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

/** Panel de diagnóstico en pantalla (?herodiag=1): escribe la secuencia real del
 *  motor —soporte, mensajes del worker, watchdog, fallback— para poder ver en un
 *  navegador ajeno (Opera GX...) DÓNDE se cuelga, sin abrir DevTools. Inerte sin
 *  el parámetro. El overlay lo pinta ScrubHero; aquí solo se le añaden líneas. */
const HERODIAG =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("herodiag");
function diag(txt: string) {
  if (!HERODIAG) return;
  const el = typeof document !== "undefined" && document.getElementById("hero-diag-log");
  if (el) el.textContent += `${(performance.now() / 1000).toFixed(1)}s · ${txt}\n`;
}

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

/* ───────────────── AQUÍ VIVÍA UNA "ESCALERA ADAPTATIVA" (retirada) ─────────────
 *
 * Se deja constancia para que nadie la reinvente. Medía el jank en los deltas de
 * rAF y, si la cosa iba mal, pintaba 1 de cada 2 o 3 fotogramas ("zancada"),
 * recordándolo en sessionStorage. La idea era atacar el atasco de la composición
 * software con una palanca TEMPORAL, porque se creía que la ESPACIAL (tocar el
 * backing) era contraproducente por definición.
 *
 * Se retiró porque el diagnóstico de fondo estaba mal. El jank de los monitores
 * anchos NO venía de que el canvas cambiara demasiado a menudo: venía de que el
 * backing estaba capado a 1920 y el compositor tenía que ESTIRAR cada frame
 * compuesto (ver backingIdeal() en el worker). Con el 1:1 recuperado a cualquier
 * ancho, el problema que la escalera intentaba tapar no existe.
 *
 * Y aunque existiera, no servía. Medido:
 *  - Tardaba 1,3 s en subir el primer escalón y 3,5-6,4 s en llegar al tope:
 *    más de lo que dura el hero entero a velocidad de usuario. Nunca llegaba.
 *  - En el scroll rápido no podía dispararse JAMÁS por diseño: el taller a
 *    50 px/frame dura 36 ticks y la escalera necesitaba 44 solo para decidir.
 *    O sea que el caso más duro era justo donde no llegaba.
 *  - Cuando llegaba, no arreglaba nada: con zancada 3 el jank se quedaba en el
 *    43-73 %. Apagaba el fuego equivocado — el estirado se paga en cada frame
 *    COMPUESTO, cambie el canvas o no.
 *  - Y ahí sí cobraba: la zancada 3 le quitaba al taller el 60 % de su cadencia
 *    (44,7 -> 18,1 img/s).
 *  - En monitores <=1920 no se disparaba nunca (0 disparos en 6 celdas x 3
 *    repeticiones): puro peso muerto.
 *
 * MORALEJA, que es lo que hay que llevarse: si el hero vuelve a ir a tirones, lo
 * primero que hay que mirar es si el backing casa 1:1 con los píxeles físicos
 * del hueco (stats.canvasW/H contra el rect x DPR, con `?bench=1`), NO inventar
 * un regulador que tire cadencia.
 */

/** object-position → ancla 0..1 por eje. Solo palabras clave (los heroes usan
 *  "center" y "center top"); un token desconocido se queda en el centro, que
 *  es el mismo comportamiento por defecto que tenía el CSS. */
function parseEncuadre(encuadre: string): { x: number; y: number } {
  let x = 0.5;
  let y = 0.5;
  for (const token of encuadre.trim().toLowerCase().split(/\s+/)) {
    if (token === "left") x = 0;
    else if (token === "right") x = 1;
    else if (token === "top") y = 0;
    else if (token === "bottom") y = 1;
  }
  return { x, y };
}

/** Tamaño de un elemento en píxeles FÍSICOS (CSS × devicePixelRatio). Es lo
 *  que de verdad pinta el compositor; el backing del canvas debe casar con
 *  esto —a cualquier ancho— para que el blit sea 1:1. */
function tamanoFisico(el: Element): { width: number; height: number } {
  const r = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  return {
    width: Math.max(1, Math.round(r.width * dpr)),
    height: Math.max(1, Math.round(r.height * dpr)),
  };
}

interface Opciones {
  /** false => manda el <video>; este hook no hace nada. */
  enabled: boolean;
  /** El worker no ha podido: hay que caer al <video>. */
  onFail: () => void;
  /** El MP4 a descodificar. TIENE que ser all-intra. */
  video: string;
  /** object-position del canvas: de dónde recorta el cover en pantallas más
   *  panorámicas que el vídeo. El recorte real lo aplica el worker al crear
   *  cada bitmap; el CSS queda como red de seguridad durante un resize. */
  encuadre?: string;
  /** Progreso de descarga 0..1, por si se quiere pintar una barra de carga. */
  onLoadProgress?: (p: number) => void;
  /** Si true, el scroll manda un índice FRACCIONARIO y el worker mezcla los dos
   *  fotogramas vecinos (cross-fade): la cadencia pasa a ser la del refresco en
   *  vez de la de nFrames, sin subir N ni peso. Solo para planos de poco
   *  movimiento (la portada); en el taller fantasmearía. Ver scrubProtocol. */
  blending?: boolean;
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
 *
 * LA REGLA DE MOTOR que salió del diagnóstico sin GPU (no la rompas): el backing
 * del canvas casa SIEMPRE con los píxeles FÍSICOS del hueco, A CUALQUIER ANCHO,
 * también si eso supera el tamaño nativo del vídeo. Reescala el worker al crear
 * cada bitmap (una vez por fotograma); el compositor jamás (+5,2 ms/frame
 * medidos si le toca a él, y le toca en CADA frame compuesto). El porqué, con
 * los números, está en backingIdeal() del worker.
 */
export function useScrubRenderer(
  sectionRef: React.RefObject<HTMLElement | null>,
  hostRef: React.RefObject<HTMLDivElement | null>,
  onProgress: (p: number) => void,
  { enabled, onFail, video, encuadre = "center", onLoadProgress, blending = false }: Opciones,
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
    // Backing inicial: el tamaño físico del hueco, tal cual (regla 1:1). Es el
    // mismo cálculo que repetirá el worker con las medidas reales del MP4;
    // acertar aquí solo evita un resize al arrancar.
    const fisico = tamanoFisico(host);
    canvas.width = fisico.width;
    canvas.height = fisico.height;
    canvas.setAttribute("aria-hidden", "true");
    // Arranca invisible: debajo está el póster, y así no se ve un canvas negro
    // mientras baja el vídeo. Se destapa con el primer fotograma pintado.
    // El object-fit:cover ya NO recorta en régimen normal (el worker entrega el
    // encuadre exacto y el blit es 1:1): queda como red de seguridad para el
    // instante de un resize, mientras el mensaje 'viewport' viaja al worker.
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
    let ultimaPos = 0;      // posición fraccionaria anterior, para la dirección del blend
    let rafId: number | null = null;
    let ultimoT = 0;
    let visible = true;
    let watchdog: ReturnType<typeof setTimeout> | undefined;   // arranque de WebCodecs
    let rafCount = 0;         // refrescos del bucle (fps), para el medidor en vivo
    let paintedWorker = 0;    // fotogramas pintados según el worker (métrica de fluidez)
    let liveInterval: ReturnType<typeof setInterval> | undefined;

    // Los 'seek' son objetos planos; el 'init' lleva el OffscreenCanvas, que NO
    // se clona: hay que TRANSFERIRLO explícitamente o postMessage lanza.
    const enviar = (m: ToWorker) =>
      m.type === "init" ? worker.postMessage(m, [m.canvas]) : worker.postMessage(m);

    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const msg = e.data;
      if (msg.type === "ready") {
        diag(`ready ✓ (${msg.frameCount} fotogramas, ${msg.codec})`);
        nFrames = msg.frameCount;
        ultimoIndice = -1;      // fuerza a mandar el índice actual ya
        leerScroll();
      } else if (msg.type === "firstPaint") {
        diag("firstPaint ✓ — CANVAS DESTAPADO, todo OK");
        clearTimeout(watchdog);   // arrancó bien: se desarma el fallback
        canvas.style.opacity = "1";
      } else if (msg.type === "progress") {
        if (msg.loaded === 0 || msg.loaded >= msg.total) diag(`descarga: ${msg.loaded}/${msg.total} bytes`);
        cbs.current.onLoadProgress?.(msg.total ? msg.loaded / msg.total : 0);
      } else if (msg.type === "stats") {
        paintedWorker = msg.stats.painted;   // para el medidor en vivo del panel
        exponerStats(msg.stats);
      } else if (msg.type === "error") {
        // El worker no puede seguir: se retira y manda el <video>.
        diag(`ERROR del worker: ${msg.message} → cae al <video>`);
        console.warn("[hero] scrub WebCodecs no disponible:", msg.message);
        clearTimeout(watchdog);
        vivo = false;
        worker.terminate();
        canvas.remove();
        cbs.current.onFail();
      }
    };
    worker.onerror = (e) => {
      diag(`worker onerror: ${e.message || "(sin mensaje)"} → cae al <video>`);
      console.warn("[hero] worker del hero caído:", e.message);
      clearTimeout(watchdog);
      vivo = false;
      worker.terminate();
      canvas.remove();
      cbs.current.onFail();
    };
    diag("worker creado, esperando 'ready'…");

    const pintar = () => {
      cbs.current.onProgress(actual);
      if (nFrames <= 0) return;

      // El corazón de todo: el fotograma es aritmética, no un seek.
      const pos = actual * (nFrames - 1);

      if (blending) {
        // Índice ENTERO + fracción. El worker mezcla i con i+1 según `frac`, así
        // la cadencia deja de estar atada a nFrames y pasa a ser la del refresco.
        // Se manda en CADA tick porque la fracción cambia de forma continua aunque
        // el índice entero no; no spamea en reposo porque el tick se apaga solo
        // cuando `actual` alcanza el objetivo (diff < EPSILON).
        const i = Math.min(nFrames - 1, Math.floor(pos));
        const frac = i >= nFrames - 1 ? 0 : pos - i;   // en el último fotograma no hay i+1
        const dir = pos >= ultimaPos ? 1 : -1;
        ultimoIndice = i;
        enviar({ type: "seek", index: i, dir, frac });
      } else {
        // Índice entero redondeado; solo se manda cuando cambia (el clásico).
        const i = Math.min(nFrames - 1, Math.round(pos));
        if (i !== ultimoIndice) {
          const dir = i > ultimoIndice ? 1 : -1;
          ultimoIndice = i;
          enviar({ type: "seek", index: i, dir });
        }
      }
      ultimaPos = pos;
    };

    const tick = (t: number) => {
      rafCount++;   // para el medidor de refrescos/seg del panel
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

    // El hueco visible manda el tamaño del backing (regla 1:1). Cambia con el
    // resize de ventana, el zoom y los cambios de DPR (mover a otro monitor).
    // devicePixelContentBoxSize da los píxeles FÍSICOS exactos, que es la
    // moneda del compositor; si el navegador no lo trae, rect × DPR.
    // El debounce de 150 ms importa: cada 'viewport' con tamaño nuevo tira la
    // caché de bitmaps y re-descodifica, y durante el arrastre de un resize el
    // hueco cambia decenas de veces por segundo. Mientras tanto el
    // object-fit:cover mantiene la imagen correcta (escalada por el
    // compositor): 150 ms de blit no-1:1 no se ven.
    let temporizadorViewport: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver((entradas) => {
      const entrada = entradas[entradas.length - 1];
      const caja = entrada.devicePixelContentBoxSize?.[0];
      const width = caja ? Math.round(caja.inlineSize) : tamanoFisico(host).width;
      const height = caja ? Math.round(caja.blockSize) : tamanoFisico(host).height;
      clearTimeout(temporizadorViewport);
      temporizadorViewport = setTimeout(() => {
        if (vivo && width > 0 && height > 0) {
          enviar({ type: "viewport", width, height });
        }
      }, 150);
    });

    // Se arranca el worker al final, cuando todo lo que responde a sus mensajes
    // (leerScroll, tick...) ya existe.
    //
    // Probado y DESCARTADO: retrasar esta descarga hasta que cargue el póster,
    // por si los 7,5 MB del MP4 le robaban el ancho de banda. No era eso: con
    // el retraso el póster tardaba exactamente lo mismo (compite con el JS y
    // las fuentes, no con el vídeo) y el primer fotograma pasaba de 1,5 s a
    // 3,0 s. Todo coste y ningún beneficio.
    enviar({
      type: "init",
      canvas: offscreen,
      url: video,
      cacheName: cacheName(video),
      viewport: fisico,
      encuadre: parseEncuadre(encuadre),
    });

    // Watchdog de arranque. En navegadores que restringen WebCodecs (Opera GX con
    // su bloqueador y su GX Control, y similares) el worker puede quedarse MUDO sin
    // mandar ni 'ready' ni 'error': el canvas se queda invisible y el hero
    // congelado sobre el póster, sin caer al <video>. Si no ha pintado el primer
    // fotograma en este tiempo, se da por perdido y se cae al <video>, que funciona
    // en todas partes. 6 s es holgado a propósito: el primer fotograma solo necesita
    // el moov + el sample 0 (~35 KB con faststart), que llega rápido hasta en 4G;
    // pasarse de 6 s es señal de cuelgue, no de red lenta. Se desarma en 'firstPaint'.
    watchdog = setTimeout(() => {
      if (!vivo) return;
      diag("WATCHDOG 6s: worker MUDO (ni ready ni error) → cae al <video>. Esta es la señal del cuelgue.");
      console.warn("[hero] WebCodecs no arrancó a tiempo: se cae al <video>");
      vivo = false;
      worker.terminate();
      canvas.remove();
      cbs.current.onFail();
    }, 6000);

    ro.observe(host);
    leerScroll();

    // Medidor en vivo del panel de diagnóstico (?herodiag=1): cada 400 ms calcula
    // las imágenes/seg REALMENTE pintadas (delta del contador del worker) y los
    // refrescos/seg del bucle, y los escribe en grande. Verde fluido, rojo trabado.
    // Así se ve al momento —y en un navegador ajeno como Opera GX— si el scrub va
    // bien mientras se hace scroll. Solo con el parámetro; cero coste sin él.
    if (HERODIAG) {
      let ultP = 0, ultR = 0, ultT = performance.now(), maxImgS = 0;
      liveInterval = setInterval(() => {
        const el = document.getElementById("hero-diag-live");
        if (!el) return;
        const ahora = performance.now();
        const dt = (ahora - ultT) / 1000 || 1;
        const imgS = Math.round((paintedWorker - ultP) / dt);
        const fps = Math.round((rafCount - ultR) / dt);
        ultP = paintedWorker; ultR = rafCount; ultT = ahora;
        if (imgS > maxImgS) maxImgS = imgS;   // recuerda el pico para no depender del instante de la captura
        el.style.color = maxImgS >= 45 ? "#33ff66" : maxImgS >= 20 ? "#ffcc33" : "#ff5555";
        el.textContent =
          `▶ ahora ${imgS}  ·  MÁX ${maxImgS} img/s  ·  ${fps} refr/s  ·  fot ${Math.max(0, ultimoIndice)}/${nFrames > 0 ? nFrames - 1 : "?"}`;
      }, 400);
    }

    return () => {
      vivo = false;
      clearTimeout(watchdog);
      clearInterval(liveInterval);
      io.disconnect();
      ro.disconnect();
      clearTimeout(temporizadorViewport);
      document.removeEventListener("visibilitychange", onVisibilidad);
      window.removeEventListener("scroll", leerScroll);
      window.removeEventListener("resize", leerScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();   // se lleva por delante decoder, bitmaps y bytes
      canvas.remove();
    };
  }, [sectionRef, hostRef, enabled, video, encuadre, blending]);
}

/** Contabilidad para el banco de pruebas (`?bench=1`). Los ImageBitmap y los
 *  VideoFrame NO viven en el heap de JS, así que medir memoria desde fuera no
 *  los ve: hay que declararlos. */
function exponerStats(stats: ScrubStats) {
  if (typeof location === "undefined") return;
  if (!new URLSearchParams(location.search).has("bench")) return;
  (window as unknown as { __variantStats?: ScrubStats }).__variantStats = stats;
}
