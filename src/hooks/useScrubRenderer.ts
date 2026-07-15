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

/* ─────────────────────────── LA ESCALERA ADAPTATIVA ───────────────────────────
 *
 * POR QUÉ EXISTE. Usuarios reales veían los dos heros "trabados" mientras en la
 * máquina de desarrollo iban perfectos. La diferencia era la aceleración
 * gráfica: SIN GPU (desactivada en ajustes, drivers vetados, VM, escritorio
 * remoto...) todo el pintado y la composición caen sobre UN core de CPU. Se
 * midió con trazas de Chrome dónde se iba el tiempo, y NO era ni el decode
 * (3,7-5,7 ms/fotograma en su propio hilo, sobrado) ni el hilo principal
 * (ocioso, 0 long-animation-frames): era la COMPOSICIÓN SOFTWARE del viewport
 * completo (evento Display::DrawAndSwap): 12,5 ms/frame la portada y 16,6 ms el
 * taller, contra un presupuesto de 16,7 ms. El taller no cabía; en CPUs más
 * lentas que la de desarrollo no cabe ninguno. De ese coste, ~5,7 ms era el
 * backdrop-blur del badge (eliminado, era puro adorno), ~3-4 ms los velos
 * degradados (caben una vez fuera el blur) y 2-5 ms el blit del canvas.
 *
 * POR QUÉ NO SE "DETECTA" LA GPU. No hay API fiable para preguntar "¿este
 * navegador compone por software?": los flags de chrome://gpu no se ven desde
 * la página, WebGL puede ir por SwiftShader con GPU buena y viceversa, y la
 * lista de combinaciones (blocklist de drivers, políticas de empresa, RDP)
 * cambia con cada versión. Así que no se pregunta: SE MIDE EL SÍNTOMA. Si el
 * pipeline no da abasto, los intervalos entre rAF se estiran a múltiplos del
 * vsync (25, 33, 41,7 ms... exactamente lo que se midió); si da abasto, quedan
 * clavados al vsync. Con GPU los deltas nunca se estiran y la escalera no se
 * dispara jamás: cero regresión para quien va sobrado, por construcción.
 *
 * POR QUÉ LA SEÑAL SON LOS DELTAS DE rAF DEL HILO PRINCIPAL. El worker no puede
 * ver el atasco: su drawImage es diferido (0,03 ms medidos; el raster real pasa
 * en el commit) y el coste está en OTRO proceso (el compositor). Pero el
 * BeginFrame que despierta cada rAF lo emite ese mismo compositor: cuando
 * DrawAndSwap se pasa de presupuesto, el siguiente rAF llega tarde. El jank
 * real aparece en los deltas de rAF de la página, que es además la métrica con
 * la que se diagnosticó todo.
 *
 * POR QUÉ LA PALANCA ES TEMPORAL (zancada de fotogramas) Y NO ESPACIAL (bajar
 * la resolución del backing). Está medido que encoger el backing es
 * CONTRAPRODUCENTE: un canvas más pequeño que los píxeles físicos obliga al
 * compositor software a remuestrear el viewport entero en cada frame, +5,2
 * ms/frame (el 720p antiguo mostrado a 1080p era LA PEOR config del
 * diagnóstico: 17,71 ms/frame contra 12,54 del 1080p 1:1). En cambio, el coste
 * dominante (blit del canvas + velos sobre él) solo se paga en los frames en
 * los que el canvas CAMBIA: espaciar los cambios divide el coste. Medido: el
 * taller, que avanza ~1 fotograma por rAF (14,9 px de scroll por fotograma),
 * pasó de 18-23 frames >25 ms por pasada a 1 al doblar el espaciado. La
 * portada avanza de serie 1 fotograma por cada 36 px y nadie lo nota: zancada
 * 2 en el taller lo deja en ~30 px/fotograma, aún más fino que la portada.
 *
 * CÓMO DECIDE. Solo se cuentan ticks ATRIBUIBLES (hubo un 'seek' al worker en
 * los últimos 2 ticks: el canvas acaba de cambiar y el frame compuesto era de
 * los caros) y fuera de los periodos de calentamiento (tras montar o despertar
 * hay ráfaga de descarga/decode que no es representativa). Un tick "se pasa"
 * si su delta supera max(1,5 × vsync estimado, 23 ms) — o sea, la misma vara
 * de ">25 ms" del diagnóstico, tolerante con el monitor de 60 Hz (16,7 ms
 * limpios no cuentan). Si en una ventana de 48 ticks atribuibles se pasan 5
 * (~10 % sostenido ≈ P95 ≥ 25 ms, justo el objetivo incumplido), se sube la
 * zancada un escalón (1 → 2 → 3) y se enfría 90 ticks antes de poder volver a
 * decidir, para ver el efecto del escalón antes de juzgar otra vez.
 *
 * LA HISTÉRESIS ES ASIMÉTRICA A PROPÓSITO: la zancada solo sube, nunca baja en
 * caliente, y el último valor se recuerda por sesión (sessionStorage, por
 * vídeo). Bajar para "sondear" significa devolverle el tirón a un usuario real
 * para quizá no ganar nada, mientras que quedarse un escalón de más es
 * invisible (ver arriba). El precio total del peor caso —una máquina rápida
 * que sufrió un atasco transitorio y se queda en zancada 2 toda la sesión— es
 * que el vídeo avance de 2 en 2 fotogramas: imperceptible en un scrub.
 * En máquinas lentas la primera pasada de scroll puede dar algún tirón durante
 * ~medio segundo (lo que tarda la ventana en llenarse): es el coste de medir
 * la realidad en vez de adivinar el hardware.
 */
/** Tope de la escalera. Zancada 3 ≈ 45 px de scroll por fotograma en el taller:
 *  más allá se empezaría a notar el paso y ya no queda coste que amortizar. */
const STRIDE_MAX = 3;
/** Ticks atribuibles que se miran para decidir (~0,5-0,8 s de scroll activo). */
const VENTANA = 48;
/** No se decide con menos muestras que esto: una racha corta no es evidencia. */
const MIN_MUESTRAS = 24;
/** Frames pasados de presupuesto dentro de la ventana para bajar un escalón.
 *  5/48 ≈ 10 % sostenido ≈ P95 ≥ 25 ms. La portada sana de hoy da 1-2 %. */
const UMBRAL_SOBRECOSTES = 5;
/** Ticks que se ignoran tras montar o despertar: la ráfaga inicial de
 *  descarga + decode + primer pintado estira frames y no es el compositor. */
const CALENTAMIENTO = 20;
/** Ticks sin decidir tras un escalón: hay que dejar que el efecto se vea. */
const ENFRIAMIENTO = 90;
/** Suelo absoluto para contar un frame como pasado: la vara ">25 ms" del
 *  diagnóstico, con margen para el redondeo del vsync de 100/120 Hz. */
const UMBRAL_ABS_MS = 23;
/** Deltas mayores que esto son pausas (cambio de pestaña, GC gordo), no
 *  composición: contaminarían la media y se descartan. */
const DELTA_IGNORAR_MS = 250;

const claveStride = (url: string) =>
  `dcbikes-scrub-stride:${url.slice(url.lastIndexOf("/") + 1)}`;

/** La zancada aprendida en esta sesión (por vídeo). sessionStorage y no
 *  localStorage adrede: un portátil enchufado hoy puede ir con GPU mañana
 *  (drivers, batería, docking); lo aprendido caduca con la pestaña. */
function strideGuardado(url: string): number {
  try {
    const v = Number(sessionStorage.getItem(claveStride(url)));
    return Number.isInteger(v) && v >= 1 && v <= STRIDE_MAX ? v : 1;
  } catch {
    return 1;
  }
}

function guardarStride(url: string, stride: number): void {
  try {
    sessionStorage.setItem(claveStride(url), String(stride));
  } catch {
    /* modo incógnito estricto: se pierde la memoria, no la función */
  }
}

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
 *  esto (capado al nativo del vídeo) para que el blit sea 1:1. */
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
  /** Tamaño nativo del MP4. Solo es la ESTIMACIÓN para dimensionar el canvas
   *  antes de transferirlo (después ya solo puede redimensionarlo el worker):
   *  el backing real lo decide el worker con las medidas de verdad del MP4 y
   *  el tamaño físico del hueco. Si el MP4 dijera otra cosa, se corrige solo. */
  ancho: number;
  alto: number;
  /** object-position del canvas: de dónde recorta el cover en pantallas más
   *  panorámicas que el vídeo. El recorte real lo aplica el worker al crear
   *  cada bitmap; el CSS queda como red de seguridad durante un resize. */
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
 *
 * Dos reglas de motor que salieron del diagnóstico sin GPU (no las rompas):
 *
 *  1. El backing del canvas casa SIEMPRE con los píxeles físicos mostrados
 *     (capado al nativo del vídeo). Reescala el worker al crear cada bitmap;
 *     el compositor jamás (+5,2 ms/frame medidos si tiene que hacerlo él).
 *  2. Si la composición no cabe en el presupuesto de frame, la palanca es
 *     TEMPORAL (espaciar los cambios de fotograma con la escalera adaptativa
 *     de arriba), nunca espacial.
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
    // Backing inicial: el tamaño físico del hueco capado al nativo declarado
    // (regla 1:1). Es el mismo cálculo que repetirá el worker con las medidas
    // reales del MP4; acertar aquí solo evita un resize al arrancar.
    const fisico = tamanoFisico(host);
    const kInicial = Math.min(1, ancho / fisico.width, alto / fisico.height);
    canvas.width = Math.max(1, Math.round(fisico.width * kInicial));
    canvas.height = Math.max(1, Math.round(fisico.height * kInicial));
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
    let rafId: number | null = null;
    let ultimoT = 0;
    let visible = true;

    // ── Estado de la escalera adaptativa (ver el bloque grande de arriba) ──
    let stride = strideGuardado(video);
    let ticks = 0;                          // rAF vividos por este hook
    let ultimoTickConSeek = -1e9;           // para atribuir el frame caro al canvas
    let calentamientoHasta = CALENTAMIENTO;
    let enfriamientoHasta = 0;
    let pacing = 16.9;                      // estimación del vsync (mín. observado)
    let ventana: number[] = [];             // 1 = tick pasado de presupuesto
    let sobrecostes = 0;                    // suma de la ventana, incremental
    // Visible en el inspector y desde los tests: <canvas data-stride="2">.
    canvas.dataset.stride = String(stride);

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

      // El corazón de todo: el fotograma es aritmética, no un seek. Con la
      // escalera activa, el índice se cuantiza a múltiplos de la zancada; el
      // redondeo hace que el asentamiento caiga solo en la rejilla y que el
      // error máximo sea media zancada (≤1,5 fotogramas: invisible).
      const bruto = actual * (nFrames - 1);
      const i = Math.min(nFrames - 1, Math.round(bruto / stride) * stride);
      if (i !== ultimoIndice) {
        const dir = i > ultimoIndice ? 1 : -1;
        ultimoIndice = i;
        ultimoTickConSeek = ticks;
        enviar({ type: "seek", index: i, dir });
      }
    };

    /** Un escalón menos de cadencia: ver LA ESCALERA ADAPTATIVA (arriba). */
    const bajarEscalon = () => {
      stride++;
      guardarStride(video, stride);
      canvas.dataset.stride = String(stride);
      enviar({ type: "stride", stride });
      ventana = [];
      sobrecostes = 0;
      enfriamientoHasta = ticks + ENFRIAMIENTO;
    };

    /** Alimenta la escalera con el delta de ESTE rAF. Barato a propósito: dos
     *  comparaciones y un push en el camino común; nada de percentiles. */
    const medir = (deltaMs: number) => {
      ticks++;
      if (stride >= STRIDE_MAX) return;                      // ya no hay más escalera
      if (deltaMs <= 0 || deltaMs > DELTA_IGNORAR_MS) return; // pausa, no composición
      if (deltaMs >= 4 && deltaMs < pacing) pacing = deltaMs; // vsync real observado
      if (ticks < calentamientoHasta || ticks < enfriamientoHasta) return;
      if (ticks - ultimoTickConSeek > 2) return;             // frame sin daño nuestro
      const pasado = deltaMs > Math.max(pacing * 1.5, UMBRAL_ABS_MS) ? 1 : 0;
      ventana.push(pasado);
      sobrecostes += pasado;
      if (ventana.length > VENTANA) sobrecostes -= ventana.shift()!;
      if (ventana.length >= MIN_MUESTRAS && sobrecostes >= UMBRAL_SOBRECOSTES) {
        bajarEscalon();
      }
    };

    const tick = (t: number) => {
      const deltaMs = t - ultimoT;   // crudo, para la escalera
      const dt = Math.min(Math.max(deltaMs / 1000, 0), 0.1);
      ultimoT = t;

      const diff = objetivo - actual;
      if (Math.abs(diff) < EPSILON) {
        actual = objetivo;
        pintar();
        medir(deltaMs);
        rafId = null;      // alcanzado: se apaga solo hasta el próximo scroll
        return;
      }

      actual += diff * (1 - Math.exp(-LAMBDA * dt));
      pintar();
      medir(deltaMs);
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
    const despertar = () => {
      if (!vivo) return;
      // La ráfaga del despertar (rellenar la caché, primer pintado) estira
      // frames sin que sea culpa del compositor: que la escalera no la mire.
      calentamientoHasta = ticks + CALENTAMIENTO;
      enviar({ type: "wake" });
    };

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
    // La zancada aprendida en esta misma sesión se aplica desde el arranque:
    // el que ya sufrió el tirón no tiene por qué volver a probarlo.
    if (stride > 1) enviar({ type: "stride", stride });
    ro.observe(host);
    leerScroll();

    return () => {
      vivo = false;
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
