import { useEffect, useRef } from "react";
import { useHeroFlags, type ScrollVideoFlags } from "@/hooks/useHeroFlags";

export type { ScrollVideoFlags };

/**
 * Amortiguación exponencial: cuánto se acerca el valor mostrado al objetivo,
 * POR SEGUNDO. Antes esto era `actual += diff * 0.12` una vez por frame, y eso
 * ataba el tacto a la frecuencia de refresco: en un monitor de 120 Hz se
 * aplicaba el doble de veces por segundo y el hero se sentía distinto que en
 * uno de 60 Hz. Con `1 - exp(-lambda*dt)` el resultado depende del tiempo, no
 * de cuántos frames hayan cabido.
 *
 * lambda = 7,7 reproduce el tacto de antes a 60 Hz: 1 - exp(-7,7/60) = 0,120.
 */
const LAMBDA = 7.7;

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
  /** false cuando el hero lo lleva el renderer de WebCodecs (useScrubRenderer):
   *  entonces no hay <video> que controlar y este hook solo publica las flags. */
  enabled = true,
): ScrollVideoFlags {
  const flags = useHeroFlags();

  // El callback cambia de identidad en cada render del consumidor; lo guardamos
  // en una ref para no tener que re-suscribir los listeners por ello.
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  useEffect(() => {
    const video = videoRef.current;
    const section = sectionRef.current;
    if (!enabled || !video || !section) return;

    const lock = !flags.isMobile && !flags.isReducedMotion;

    // Móvil o reduced-motion: el vídeo ni se controla, se deja en bucle.
    if (!lock) {
      video.loop = true;
      video.muted = true;
      video.autoplay = true;
      void video.play().catch(() => {
        // Algunos navegadores bloquean el autoplay; con el primer frame basta.
      });
      // OJO: aquí NO se llama a onProgress(0). Parece inofensivo y es lo que
      // dejaba el hero SIN TEXTO NI BOTONES con prefers-reduced-motion en
      // escritorio: onProgress escribe los estilos del reveal A MANO sobre los
      // refs, y con p=0 eso es `opacity: 0` en el badge, el h1, el divisor, el
      // párrafo y los DOS CTA. Sin scrub no hay scroll que vuelva a mover el
      // progreso NUNCA MÁS, así que ese opacity:0 se quedaba puesto para
      // siempre: el usuario con reduced-motion —justo el que tiene trastornos
      // vestibulares— veía un vídeo en bucle y cero contenido.
      //
      // Sin esta llamada nadie toca los bloques y se quedan como los pinta el
      // CSS (visibles), que es lo que ya pasaba en móvil de casualidad (allí no
      // se monta el <video>, así que el efecto salía antes de llegar aquí).
      // ScrollVideoHero además corta applyProgress cuando !lock, por si acaso.
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
    let ultimoT = 0;        // para que la amortiguación dependa del tiempo, no del frame

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

    const tick = (t: number) => {
      const dt = Math.min(Math.max((t - ultimoT) / 1000, 0), 0.1);
      ultimoT = t;

      const diff = objetivo - actual;

      if (Math.abs(diff) < EPSILON) {
        actual = objetivo;
        pintar();
        rafId = null;      // alcanzado: el bucle se apaga solo hasta el próximo scroll
        return;
      }

      actual += diff * (1 - Math.exp(-LAMBDA * dt));
      pintar();
      rafId = requestAnimationFrame(tick);
    };

    const arrancar = () => {
      if (rafId === null && visible) {
        ultimoT = performance.now();   // si no, el primer dt tras una pausa sería enorme
        rafId = requestAnimationFrame(tick);
      }
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
  }, [sectionRef, videoRef, enabled, flags.isMobile, flags.isReducedMotion]);

  return flags;
}
