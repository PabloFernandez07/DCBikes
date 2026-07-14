import { useEffect, useRef } from "react";
import type { FromWorker, ScrubStats, ToWorker } from "@/workers/scrubProtocol";

/** La clave de caché lleva el nombre del fichero, así que renombrar el vídeo
 *  invalida la caché sola (el worker borra las claves dcbikes-hero-* viejas).
 *  Y como cada hero tiene su propio fichero, cada uno tiene su propia caché:
 *  el del taller no pisa al de la portada. */
const cacheName = (url: string) =>
  `dcbikes-hero-${url.slice(url.lastIndexOf("/") + 1)}`;

/**
 * Amortiguación exponencial. El código viejo hacía `actual += diff * 0.12` una
 * vez por frame, y eso ATA EL TACTO A LA FRECUENCIA DE REFRESCO: en un monitor
 * de 120 Hz se aplicaba el doble de veces por segundo y el hero se sentía
 * distinto (más pegado) que en uno de 60 Hz.
 *
 * Con `1 - exp(-lambda*dt)` el resultado depende del TIEMPO, no de cuántos
 * frames hayan cabido. lambda = 7,7 reproduce exactamente el tacto de antes a
 * 60 Hz: 1 - exp(-7,7/60) = 0,120.
 */
const LAMBDA = 7.7;

/** Por debajo de esto ya no se persigue el objetivo: el bucle se apaga solo. */
const EPSILON = 0.0004;

/** ¿Puede este navegador hacer el scrub con WebCodecs? Si no (Safari, iOS), se
 *  usa el <video> de siempre, que es literalmente el fallback de Rockstar. */
export const soportaScrubWebCodecs =
  typeof window !== "undefined" &&
  typeof VideoDecoder === "function" &&
  typeof EncodedVideoChunk === "function" &&
  typeof VideoFrame === "function" &&
  typeof OffscreenCanvas === "function" &&
  typeof Worker === "function" &&
  typeof HTMLCanvasElement.prototype.transferControlToOffscreen === "function";

interface Opciones {
  /** false => manda el <video>; este hook no hace nada. */
  enabled: boolean;
  /** El worker no ha podido: hay que caer al <video>. */
  onFail: () => void;
  /** El MP4 a descodificar. TIENE que ser all-intra. */
  video: string;
  /** Tamaño nativo del MP4. Se le pone al canvas ANTES de transferirlo para que
   *  el object-fit:cover recorte bien desde el primer momento; si el MP4 dijera
   *  otra cosa, el worker lo corrige. */
  ancho: number;
  alto: number;
  /** object-position del canvas: de dónde recorta el cover en pantallas más
   *  panorámicas que el vídeo. */
  encuadre?: string;
  /** Progreso de descarga 0..1, por si se quiere pintar una barra de carga. */
  onLoadProgress?: (p: number) => void;
}

/**
 * Scrub del hero con WebCodecs, como hace Rockstar en la web de GTA VI.
 *
 * El scroll NO toca `video.currentTime` en ningún momento: calcula un ÍNDICE de
 * fotograma (aritmética pura) y se lo pide al worker, que lo descodifica y lo
 * pinta en un OffscreenCanvas. Cero seeks => cero viajes a la red => cero
 * congelaciones por falta de buffer, que era la causa real del tirón.
 *
 * El progreso amortiguado sigue saliendo por `onProgress` igual que antes, así
 * que los textos se revelan escribiendo estilos sobre refs, sin estado de React
 * y sin un solo re-render durante el scroll.
 */
export function useScrubRenderer(
  sectionRef: React.RefObject<HTMLElement | null>,
  hostRef: React.RefObject<HTMLDivElement | null>,
  onProgress: (p: number) => void,
  { enabled, onFail, video, ancho, alto, encuadre = "center", onLoadProgress }: Opciones,
): void {
  // Estos callbacks cambian de identidad en cada render del consumidor; van a
  // una ref para no re-montar el worker por eso.
  const cbs = useRef({ onProgress, onFail, onLoadProgress });
  cbs.current = { onProgress, onFail, onLoadProgress };

  useEffect(() => {
    const section = sectionRef.current;
    const host = hostRef.current;
    if (!enabled || !section || !host) return;

    // El <canvas> se crea a mano en vez de ponerlo en el JSX porque
    // transferControlToOffscreen() solo se puede llamar UNA VEZ por elemento:
    // en StrictMode el efecto se monta dos veces y la segunda lanzaría
    // InvalidStateError. Creando el elemento aquí, cada montaje tiene el suyo.
    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    canvas.setAttribute("aria-hidden", "true");
    // Arranca invisible: debajo está el póster, y así no se ve un canvas negro
    // mientras baja el vídeo. Se destapa con el primer fotograma pintado.
    canvas.style.cssText =
      `position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${encuadre};opacity:0;`;
    host.appendChild(canvas);

    let worker: Worker;
    let offscreen: OffscreenCanvas;
    try {
      offscreen = canvas.transferControlToOffscreen();
      worker = new Worker(new URL("../workers/scrubDecoder.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      canvas.remove();
      cbs.current.onFail();
      return;
    }

    let vivo = true;
    let nFrames = 0;
    let objetivo = 0;     // a dónde quiere ir el scroll
    let actual = 0;       // dónde está el hero (persigue al objetivo, amortiguado)
    let ultimoIndice = -1;
    let rafId: number | null = null;
    let ultimoT = 0;
    let visible = true;

    // Los 'seek' son objetos planos; el 'init' lleva el OffscreenCanvas, que NO
    // se clona: hay que TRANSFERIRLO explícitamente o postMessage lanza.
    const enviar = (m: ToWorker) =>
      m.type === "init" ? worker.postMessage(m, [m.canvas]) : worker.postMessage(m);

    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const msg = e.data;
      if (msg.type === "ready") {
        nFrames = msg.frameCount;
        ultimoIndice = -1;      // fuerza a mandar el índice actual ya
        leerScroll();
      } else if (msg.type === "firstPaint") {
        canvas.style.opacity = "1";
      } else if (msg.type === "progress") {
        cbs.current.onLoadProgress?.(msg.total ? msg.loaded / msg.total : 0);
      } else if (msg.type === "stats") {
        exponerStats(msg.stats);
      } else if (msg.type === "error") {
        // El worker no puede seguir: se retira y manda el <video>.
        console.warn("[hero] scrub WebCodecs no disponible:", msg.message);
        vivo = false;
        worker.terminate();
        canvas.remove();
        cbs.current.onFail();
      }
    };
    worker.onerror = (e) => {
      console.warn("[hero] worker del hero caído:", e.message);
      vivo = false;
      worker.terminate();
      canvas.remove();
      cbs.current.onFail();
    };

    const pintar = () => {
      cbs.current.onProgress(actual);
      if (nFrames <= 0) return;

      // El corazón de todo: el fotograma es aritmética, no un seek.
      const i = Math.round(actual * (nFrames - 1));
      if (i !== ultimoIndice) {
        const dir = i > ultimoIndice ? 1 : -1;
        ultimoIndice = i;
        enviar({ type: "seek", index: i, dir });
      }
    };

    const tick = (t: number) => {
      const dt = Math.min(Math.max((t - ultimoT) / 1000, 0), 0.1);
      ultimoT = t;

      const diff = objetivo - actual;
      if (Math.abs(diff) < EPSILON) {
        actual = objetivo;
        pintar();
        rafId = null;      // alcanzado: se apaga solo hasta el próximo scroll
        return;
      }

      actual += diff * (1 - Math.exp(-LAMBDA * dt));
      pintar();
      rafId = requestAnimationFrame(tick);
    };

    const arrancar = () => {
      if (rafId === null && visible && vivo) {
        ultimoT = performance.now();   // sin esto, el primer dt tras una pausa sería enorme
        rafId = requestAnimationFrame(tick);
      }
    };

    const leerScroll = () => {
      const recorrido = section.offsetHeight - window.innerHeight;
      if (recorrido <= 0) return;
      const desplazado = -section.getBoundingClientRect().top;
      objetivo = Math.max(0, Math.min(1, desplazado / recorrido));
      arrancar();
    };

    // Fuera de pantalla no se descodifica nada: ni batería, ni CPU, ni MEMORIA.
    // El 'sleep' es lo que hace que el worker suelte los ImageBitmap de la caché:
    // son ~8 MB de memoria de vídeo cada uno y, sin este aviso, se quedaban
    // reservados TODA la vida de la página. Quien está leyendo el pie no tiene
    // por qué pagar 63 MB por un hero que no ve. Al volver se repuebla sola:
    // con acceso all-intra, rellenar la caché cuesta ~0,4 ms por fotograma.
    const dormir = () => { if (vivo) enviar({ type: "sleep" }); };
    const despertar = () => { if (vivo) enviar({ type: "wake" }); };

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) {
          despertar();
          leerScroll();
        } else {
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          dormir();
        }
      },
      { rootMargin: "100px" },
    );
    io.observe(section);

    // Pestaña escondida: mismo trato. El hero puede seguir "visible" para el
    // IntersectionObserver mientras el usuario se va a otra pestaña horas.
    const onVisibilidad = () => {
      if (document.visibilityState === "hidden") dormir();
      else if (visible) {
        despertar();
        leerScroll();
      }
    };
    document.addEventListener("visibilitychange", onVisibilidad);

    window.addEventListener("scroll", leerScroll, { passive: true });
    window.addEventListener("resize", leerScroll);

    // Se arranca el worker al final, cuando todo lo que responde a sus mensajes
    // (leerScroll, tick...) ya existe.
    //
    // Probado y DESCARTADO: retrasar esta descarga hasta que cargue el póster,
    // por si los 7,5 MB del MP4 le robaban el ancho de banda. No era eso: con
    // el retraso el póster tardaba exactamente lo mismo (compite con el JS y
    // las fuentes, no con el vídeo) y el primer fotograma pasaba de 1,5 s a
    // 3,0 s. Todo coste y ningún beneficio.
    enviar({ type: "init", canvas: offscreen, url: video, cacheName: cacheName(video) });
    leerScroll();

    return () => {
      vivo = false;
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibilidad);
      window.removeEventListener("scroll", leerScroll);
      window.removeEventListener("resize", leerScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();   // se lleva por delante decoder, bitmaps y bytes
      canvas.remove();
    };
  }, [sectionRef, hostRef, enabled, video, ancho, alto, encuadre]);
}

/** Contabilidad para el banco de pruebas (`?bench=1`). Los ImageBitmap y los
 *  VideoFrame NO viven en el heap de JS, así que medir memoria desde fuera no
 *  los ve: hay que declararlos. */
function exponerStats(stats: ScrubStats) {
  if (typeof location === "undefined") return;
  if (!new URLSearchParams(location.search).has("bench")) return;
  (window as unknown as { __variantStats?: ScrubStats }).__variantStats = stats;
}
