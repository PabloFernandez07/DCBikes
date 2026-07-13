import { useEffect, useRef, useState } from "react";

export interface ScrollVideoFlags {
  isMobile: boolean;
  isReducedMotion: boolean;
}

/** Cuánto se acerca el valor mostrado al objetivo en cada frame (0..1).
 *  Más bajo = más suave y más "pesado"; más alto = más pegado al dedo.
 *  0.12 ≈ el tacto de las webs tipo Rockstar/Apple. */
const AMORTIGUACION = 0.12;

/** Umbral para dejar de perseguir el objetivo (en unidades de progreso 0..1). */
const EPSILON = 0.0004;

/**
 * Scrub de un vídeo con el scroll.
 *
 * Tres decisiones que son las que hacen que vaya fluido:
 *
 * 1. El progreso NO vive en estado de React. Un setState por frame de scroll
 *    re-renderiza el hero entero (título letra a letra incluido) 60 veces por
 *    segundo. Aquí el progreso se entrega por callback y quien lo consume
 *    escribe los estilos directamente sobre refs: cero renders al hacer scroll.
 *
 * 2. El vídeo no sigue al scroll 1:1, sino con amortiguación: cada frame se
 *    acerca un poco al objetivo. Es lo que da la sensación de deslizamiento en
 *    vez de saltos, sobre todo con la rueda del ratón, que llega a tirones.
 *
 * 3. El bucle solo corre mientras la sección está a la vista Y queda distancia
 *    que recorrer. En cuanto alcanza el objetivo se para solo.
 *
 * REQUISITO DEL VÍDEO (lo más importante de todo): tiene que estar codificado
 * ALL-INTRA, con un keyframe en cada fotograma:
 *
 *   ffmpeg -i in.mp4 -an -c:v libx264 -crf 24 -g 1 -keyint_min 1 \
 *          -sc_threshold 0 -movflags +faststart out.mp4
 *
 * Si el vídeo tiene keyframes espaciados, saltar a un instante cualquiera
 * obliga al navegador a descomprimir todos los fotogramas desde el keyframe
 * anterior. Eso es trabajo de decodificación en el hilo principal 60 veces por
 * segundo, y NO hay código que lo arregle. El fichero pesa bastante más, pero
 * es el precio del scrub y es lo que hacen todas las webs que van finas.
 */
export function useScrollVideo(
  sectionRef: React.RefObject<HTMLElement | null>,
  videoRef: React.RefObject<HTMLVideoElement | null>,
  onProgress: (p: number) => void,
): ScrollVideoFlags {
  const [flags, setFlags] = useState<ScrollVideoFlags>(() => {
    if (typeof window === "undefined") {
      return { isMobile: false, isReducedMotion: false };
    }
    return {
      isMobile: window.matchMedia("(max-width: 768px)").matches,
      isReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  });

  // El callback cambia de identidad en cada render del consumidor; lo guardamos
  // en una ref para no tener que re-suscribir los listeners por ello.
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mqMobile = window.matchMedia("(max-width: 768px)");
    const mqReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () =>
      setFlags({ isMobile: mqMobile.matches, isReducedMotion: mqReduced.matches });
    sync();
    mqMobile.addEventListener("change", sync);
    mqReduced.addEventListener("change", sync);
    return () => {
      mqMobile.removeEventListener("change", sync);
      mqReduced.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const section = sectionRef.current;
    if (!video || !section) return;

    const lock = !flags.isMobile && !flags.isReducedMotion;

    // Móvil o reduced-motion: el vídeo ni se controla, se deja en bucle.
    if (!lock) {
      video.loop = true;
      video.muted = true;
      video.autoplay = true;
      void video.play().catch(() => {
        // Algunos navegadores bloquean el autoplay; con el primer frame basta.
      });
      onProgressRef.current(0);
      return;
    }

    video.loop = false;
    video.autoplay = false;
    video.pause();

    let objetivo = 0;       // hacia dónde quiere ir el scroll
    let actual = 0;         // dónde está realmente el vídeo (persigue al objetivo)
    let rafId: number | null = null;
    let visible = true;
    let ultimoSeek = -1;

    /** Duración de medio fotograma: por debajo de eso, reposicionar el vídeo no
     *  cambiaría nada en pantalla y solo gastaría decodificaciones. */
    const medioFrame = () =>
      Number.isFinite(video.duration) && video.duration > 0 ? 1 / 48 : Infinity;

    const leerScroll = () => {
      const recorrido = section.offsetHeight - window.innerHeight;
      if (recorrido <= 0) return;
      const desplazado = -section.getBoundingClientRect().top;
      objetivo = Math.max(0, Math.min(1, desplazado / recorrido));
      arrancar();
    };

    const pintar = () => {
      onProgressRef.current(actual);

      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      const t = actual * video.duration;
      if (Math.abs(t - ultimoSeek) >= medioFrame()) {
        ultimoSeek = t;
        try {
          video.currentTime = t;
        } catch {
          // currentTime antes de tener metadatos: se ignora, ya vendrá onMeta.
        }
      }
    };

    const tick = () => {
      const diff = objetivo - actual;

      if (Math.abs(diff) < EPSILON) {
        actual = objetivo;
        pintar();
        rafId = null;      // alcanzado: el bucle se apaga solo hasta el próximo scroll
        return;
      }

      actual += diff * AMORTIGUACION;
      pintar();
      rafId = requestAnimationFrame(tick);
    };

    const arrancar = () => {
      if (rafId === null && visible) rafId = requestAnimationFrame(tick);
    };

    const onMeta = () => {
      ultimoSeek = -1;
      leerScroll();
    };

    // Fuera de pantalla no se decodifica nada: ni batería ni CPU malgastadas.
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) leerScroll();
        else if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      },
      { rootMargin: "100px" },
    );
    io.observe(section);

    video.addEventListener("loadedmetadata", onMeta);
    window.addEventListener("scroll", leerScroll, { passive: true });
    window.addEventListener("resize", leerScroll);

    if (video.readyState < 1) video.load();
    else leerScroll();

    return () => {
      io.disconnect();
      video.removeEventListener("loadedmetadata", onMeta);
      window.removeEventListener("scroll", leerScroll);
      window.removeEventListener("resize", leerScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [sectionRef, videoRef, flags.isMobile, flags.isReducedMotion]);

  return flags;
}
