/**
 * Worker que descodifica el hero fotograma a fotograma y lo pinta en un
 * OffscreenCanvas. Es la técnica de Rockstar (GTA VI): el scroll NO toca
 * `video.currentTime` jamás; calcula un ÍNDICE y se pinta ese fotograma.
 *
 * Por qué esto y no un <video>: un seek a bytes que aún no han bajado se va a
 * la red y congela ~1 s. Aquí los bytes se descargan una vez, se descodifica
 * bajo demanda desde memoria y el índice es aritmética pura.
 *
 * ─── LAS DECISIONES QUE NO SE VEN EN EL CÓDIGO ────────────────────────────
 *
 * 1. hardwareAcceleration: 'no-preference'.
 *
 *    Aquí ponía 'prefer-hardware'. En Chrome ese valor NO es una preferencia:
 *    es HARDWARE-ONLY. En cualquier máquina sin descodificación H.264 por
 *    hardware (VM, GPU vieja, drivers rotos, --disable-gpu) configure() revienta
 *    con «Unsupported configuration», el worker se muere y el hero cae al
 *    <video>... justo en las máquinas donde más se nota el tirón, que son las
 *    que teníamos que rescatar.
 *
 *    Con 'no-preference' Chrome coge el hardware cuando lo hay y el software
 *    cuando no, y el scrub SIGUE funcionando en las dos. El miedo al software
 *    (que retiene la salida y obliga a flush()) resultó no aplicar: con
 *    optimizeForLatency el fotograma sale solo. Y por si acaso, el latch de
 *    `necesitaFlush` de más abajo lo detecta y se adapta en caliente.
 *
 *    Además se llama a isConfigSupported() ANTES de configure(), que es lo que
 *    pide el propio mensaje de error de Chrome, para caer al <video> de forma
 *    limpia en vez de por el callback de error del descodificador.
 *
 * 2. Nunca se retiene un VideoFrame.
 *
 *    El pool del descodificador por hardware SE ATASCA a los 10 VideoFrame
 *    retenidos sin cerrar: decodeQueueSize se queda clavado y flush() ya no
 *    resuelve nunca. No es lentitud, es un interbloqueo, y está reproducido.
 *    Aquí se descodifica EN SERIE (un fotograma vivo como mucho) y se pasa a
 *    ImageBitmap cerrando el VideoFrame acto seguido. Con cero retención el
 *    interbloqueo es imposible por construcción.
 *
 * 3. La caché guarda ImageBitmap, no VideoFrame, y se VACÍA.
 *
 *    Un ImageBitmap ya vive en la GPU (drawImage: 0,0 ms; con un VideoFrame por
 *    hardware hay que resubirlo, 0,9 ms). Se paga en memoria: 1080p RGBA = 7,91
 *    MiB POR FOTOGRAMA. Por eso la LRU se dimensiona por PRESUPUESTO (ver
 *    LRU_PRESUPUESTO_MIB) y no de 16 (127 MiB), y sobre todo por eso se SUELTA
 *    entera cuando el hero sale de pantalla o se esconde la pestaña: quien está
 *    leyendo el pie de página no tiene por qué pagar memoria de vídeo por un
 *    hero que no ve.
 *
 * 4. Un fotograma que aún no ha bajado se pide con un Range EXACTO.
 *
 *    Antes había UNA sola descarga lineal, así que un fotograma solo se podía
 *    pintar cuando habían llegado todos los bytes anteriores. Si el usuario
 *    hacía scroll con la descarga a medias, el canvas iba pintando "el
 *    disponible más cercano" y el fondo SE PONÍA A RODAR SOLO persiguiendo a la
 *    descarga durante segundos, con el usuario quieto. El <video> nunca hacía
 *    eso: emite `Range: bytes=N-` y salta directo.
 *    Como el fichero es ALL-INTRA, cada sample (~64 KB) se descodifica suelto:
 *    se pide solo ESE trozo y se pinta ya. Y el sustituto "más cercano" está
 *    ACOTADO: si lo más cercano está lejos, es mucho menos molesto dejar el
 *    póster puesto que desfilar la película entera.
 *
 * 5. Nada se guarda en la Cache API sin comprobar que el MP4 está ENTERO.
 *    Ver comprobarIntegridad(): era un envenenamiento de caché permanente.
 *
 * 6. El backing del canvas es SIEMPRE el tamaño físico mostrado, A CUALQUIER
 *    ANCHO, y el recorte "cover" + el reescalado los hace ESTE worker al crear
 *    cada ImageBitmap, no el CSS ni el compositor.
 *
 *    Antes el canvas medía siempre 1920x1080 y el object-fit:cover del CSS
 *    hacía el resto. Con GPU eso es gratis; SIN GPU (aceleración desactivada,
 *    drivers vetados, VM...) el compositor software tiene que remuestrear el
 *    viewport entero EN CADA FRAME cuando el backing no coincide con los
 *    píxeles físicos: +5,2 ms/frame medidos. La config más fluida de todo el
 *    diagnóstico fue justo la contraria: bitmap reescalado POR EL WORKER sobre
 *    un canvas que casa 1:1 con los píxeles mostrados (blit barato). El worker
 *    puede permitírselo porque va en su propio hilo y le sobra presupuesto
 *    (decode software 3,7-5,7 ms + createImageBitmap 1,8-3,8 ms por fotograma),
 *    y además lo paga UNA vez por fotograma descodificado (queda cacheado en la
 *    LRU ya recortado y escalado), no una vez por frame compuesto.
 *
 *    Bonus: en ventanas más pequeñas que el vídeo los bitmaps de la caché pasan
 *    a ocupar lo que ocupa el backing (p. ej. 1366x768 = 4 MiB por fotograma en
 *    vez de 7,91), y el drawImage de pintado es una copia 1:1 sin remuestreo.
 */

import { parseMp4, type Mp4Track } from '@/lib/mp4';
import type { FromWorker, ScrubStats, ToWorker } from './scrubProtocol';

/**
 * PRESUPUESTO de memoria de vídeo para la caché de bitmaps, en MiB.
 *
 * La LRU ya no puede ser un número fijo de fotogramas. Los bitmaps se cachean
 * pre-recortados y pre-escalados AL BACKING (nota 6), y el backing casa con los
 * píxeles físicos del hueco a cualquier ancho, así que "8 fotogramas" cuesta
 * cosas muy distintas según el monitor:
 *      1578x725  ~ 4,4 MiB/frame  x8 =  35 MiB
 *      1920x1080 ~ 7,9 MiB/frame  x8 =  63 MiB   (lo de siempre)
 *      2538x1265 ~ 12,3 MiB/frame x8 =  98 MiB   (medido en un 3440x1440)
 *      3840x2160 ~ 31,6 MiB/frame x8 = 253 MiB   <- inaceptable
 * Con presupuesto en vez de cuenta, el techo es el mismo en todas partes y el
 * caso común no cambia: a 1080p salen 12 fotogramas, se capa a LRU_TOPE=8 y
 * queda EXACTAMENTE la configuración de antes (63 MiB).
 *
 * 96 MiB es ~1,5x lo que ya costaba el caso 1080p, que llevaba tiempo en
 * producción sin quejas de memoria.
 *
 * Recortar la LRU en pantallas grandes es barato y por eso se prefiere a
 * recortar el backing: un fallo de caché es UN intra (0,4-2,75 ms de decode +
 * el createImageBitmap), pagado en el hilo del worker; romper el 1:1 se paga en
 * el compositor EN CADA FRAME COMPUESTO. La caché es una optimización; el 1:1 no.
 */
const LRU_PRESUPUESTO_MIB = 96;
/** Presupuesto de memoria (MiB) cuando la portada pide DECODE-AHEAD: se retienen
 *  TODOS los fotogramas del clip. Es alto a propósito (el hero es un plano corto
 *  de <=150 fotogramas), pero acotado: el backing se reduce si con él los N no
 *  caben aquí, así nunca se dispara un OOM. Solo lo usa la portada con precarga. */
const PRECARGA_PRESUPUESTO_MIB = 512;
/** Tope de la LRU: más de 8 no compra nada (el informe de partida ya midió que
 *  con 8 se va a 58,5 fps, o sea lo mismo que cachearlos todos) y sí memoria. */
const LRU_TOPE = 8;
/** Suelo de la LRU: el fotograma pintado + uno de adelanto + uno de historial.
 *  No hace falta violar el presupuesto para respetarlo: BACKING_MAX_PX está
 *  elegido justo para que en el peor backing permitido quepan 3 (ver abajo). */
const LRU_SUELO = 3;
/**
 * Tope absoluto del backing, en PÍXELES (área), por sanidad.
 *
 * Es un área y NO un ancho a propósito: el coste (memoria, reescalado, blit) va
 * con los píxeles, no con un eje. Un ultrapanorámico 5120x1440 son 7,4 MP y pasa
 * entero; caparlo por ancho a 3840 le rompería el 1:1 a un monitor que existe y
 * se vende, que es justo el error que este arreglo viene a deshacer.
 *
 * 8,3 MP = 3840x2160 exactos (4K). Por encima de eso el backing se reduce
 * conservando la proporción del hueco y SÍ vuelve a estirar el compositor: es un
 * mal conocido, idéntico al de antes del arreglo, a cambio de no reservar 132
 * MiB por bitmap en un 8K. Sale a cuenta porque por encima de 4K sin aceleración
 * gráfica no hay prácticamente nadie.
 *
 * El número está atado a LRU_SUELO: 8,3 MP x 4 B = 31,6 MiB por bitmap, y
 * 3 x 31,6 = 95 MiB <= LRU_PRESUPUESTO_MIB. O sea que el suelo de la LRU nunca
 * se pasa del presupuesto. Si algún día se sube este tope, hay que subir el
 * presupuesto o bajar el suelo.
 */
const BACKING_MAX_PX = 3840 * 2160;
/** Fotogramas que se adelantan en la dirección del scroll, derivado de la LRU:
 *  se le dejan el hueco del fotograma pintado y dos de historial para cuando el
 *  scroll da la vuelta. Con la LRU en su tope da 5, que es lo que había fijo.
 *
 *  Tiene que salir de la LRU y no ser fijo: adelantar más fotogramas de los que
 *  caben es contraproducente, porque los últimos van EXPULSANDO a los primeros
 *  —que son justo los que el scroll va a pedir a continuación—, o sea decode
 *  tirado a la basura en las máquinas que menos les sobra.
 *
 *  El máximo seguro es ceil(lruMax/2), NO lruMax-3: con la LRU expulsando por
 *  recencia y el prefetch intercalando atrás/delante, un adelanto mayor que la
 *  mitad de la caché se auto-expulsa antes de pintarse. La fórmula lruMax-3
 *  fallaba EXACTAMENTE en lruMax=8 (el valor que toma casi todo el escritorio,
 *  1366x768 y 1920x1080): daba 5 y una bajada de la portada costaba 469 decodes
 *  para 239 fotogramas (~2x). Con ceil(8/2)=4 baja a 239. Esto ataca jank y
 *  batería (decode tirado), NO el stepping: el nº de imágenes no cambia. */
const adelantoDe = (lruMax: number) => Math.max(1, Math.min(5, Math.ceil(lruMax / 2)));
/** Si el fotograma no ha salido en este tiempo, se fuerza con flush(). */
const ESPERA_ANTES_DE_FLUSH_MS = 8;
/** Cuántos fotogramas seguidos tienen que tardar para dar por hecho que este
 *  descodificador RETIENE la salida (software) y no es solo el arranque en frío. */
const TARDIOS_PARA_LATCHAR = 3;
/** Hasta qué distancia se acepta pintar un fotograma "parecido" mientras el
 *  bueno todavía baja. Más allá de esto NO SE PINTA: ver nota 4 de la cabecera. */
const MAX_SUSTITUTO = 5;

const post = (m: FromWorker) => self.postMessage(m);

let ctx: OffscreenCanvasRenderingContext2D | null = null;
let canvas: OffscreenCanvas | null = null;
let track: Mp4Track | null = null;
let decoder: VideoDecoder | null = null;
/** Arranque del descodificador (isConfigSupported es async). Se comparte para no
 *  configurar dos veces y para que quien lo necesite pueda esperarlo. */
let arranque: Promise<void> | null = null;

/** Bytes del MP4. `recibidos` es la marca de agua LINEAL: todo lo que hay desde
 *  el byte 0 seguido. `tengo[i]` marca los samples que han entrado FUERA DE
 *  ORDEN por una petición Range prioritaria. */
let urlMp4 = '';
let bytes: Uint8Array<ArrayBuffer> | null = null;
let recibidos = 0;
let total = 0;
let tengo: Uint8Array | null = null;
/** ¿Sirve Range este servidor? Se descubre con la primera petición prioritaria. */
let rangeOk = false;
let bajandoRango = false;

const lru = new Map<number, ImageBitmap>();
const pendientes = new Map<number, (f: VideoFrame) => void>();
let tsSiguiente = 0;
let necesitaFlush = false;

let deseado = -1;
let pintado = -1;
let direccion = 1;
/** Posición subfotograma 0..1 del scroll entre `pintado` y `pintado+1`. Si es
 *  > 0 (solo la portada la manda), pintar() mezcla los dos fotogramas vecinos
 *  (cross-fade) para que la cadencia sea la del refresco y no la de N. El taller
 *  no manda frac, así que aquí queda en 0 y pintar() dibuja el índice tal cual. */
let fracActual = 0;
/** Fotogramas que caben en la LRU y cuántos se adelantan con el backing de
 *  AHORA. Los recalcula ajustarBacking(): un backing nuevo cambia lo que ocupa
 *  cada bitmap y por tanto cuántos caben en el presupuesto. */
let lruMax = LRU_TOPE;
let adelanto = adelantoDe(LRU_TOPE);
/** Tamaño físico visible del hueco del canvas (px). Es el backing, tal cual:
 *  ver la nota 6 de la cabecera. */
let viewportW = 0;
let viewportH = 0;
/** Ancla del encuadre (object-position) en 0..1 por eje. 0,5 = centro. */
let focoX = 0.5;
let focoY = 0.5;
let sirviendo = false;
/** Alguien pidió algo mientras servir() estaba ocupado: hay que dar otra vuelta. */
let repetir = false;
let primerPintado = false;
/** Veces seguidas que un fotograma no ha salido solo. Ver descodificar(). */
let tardiosSeguidos = 0;
/** El hero no se ve: ni se adelantan fotogramas ni se guarda memoria de vídeo. */
let dormido = false;
/** Decode-ahead estilo Rockstar (lo pide la portada en el init): descodificar
 *  TODOS los fotogramas por adelantado y retenerlos, para que el scroll no
 *  descodifique nada. Ver prefetch() y backingIdeal(). */
let modoPrecarga = false;
/** true mientras el pase de decode-ahead sigue rellenando la caché. */
let precargaCompleta = false;

const stats: ScrubStats = {
  cached: 0, cachedMB: 0, decodes: 0, hits: 0, misses: 0, painted: 0,
  ranges: 0, needsFlush: false, sleeping: false,
  lruMax: LRU_TOPE, canvasW: 0, canvasH: 0,
};

// ---------------------------------------------------------------- caché LRU

function lruGet(i: number): ImageBitmap | undefined {
  const bm = lru.get(i);
  if (bm) {
    lru.delete(i);          // re-insertar = marcar como el más reciente
    lru.set(i, bm);
  }
  return bm;
}

/** Lo que ocupa UN bitmap de la caché. Los bitmaps van pre-recortados y
 *  pre-escalados al backing (nota 6), así que su coste es el del backing, no el
 *  del vídeo: en un portátil es bastante menos y en un 4K bastante más. */
function bytesPorFotograma(): number {
  return (canvas ? canvas.width * canvas.height : 1920 * 1080) * 4;
}

function contarLru() {
  stats.cached = lru.size;
  stats.cachedMB = Math.round((lru.size * bytesPorFotograma()) / (1024 * 1024));
}

/** Cuántos bitmaps caben en el presupuesto con el backing de ahora. */
function recalcularLru() {
  // Decode-ahead: retener TODOS los fotogramas (el backing ya se capó en
  // backingIdeal para que quepan en PRECARGA_PRESUPUESTO_MIB). Sin tope de 8 ni
  // presupuesto de 96: la LRU no expulsa nada, y el prefetch los llena todos.
  if (modoPrecarga && track) {
    lruMax = track.frameCount;
    adelanto = track.frameCount;
    stats.lruMax = lruMax;
    return;
  }
  const caben = Math.floor((LRU_PRESUPUESTO_MIB * 1024 * 1024) / bytesPorFotograma());
  lruMax = Math.max(LRU_SUELO, Math.min(LRU_TOPE, caben));
  adelanto = adelantoDe(lruMax);
  stats.lruMax = lruMax;
}

function lruSet(i: number, bm: ImageBitmap) {
  lru.set(i, bm);
  while (lru.size > lruMax) {
    const viejo = lru.keys().next().value as number | undefined;
    if (viejo === undefined) break;
    lru.get(viejo)?.close();   // un ImageBitmap suelto no lo recoge nadie: hay que cerrarlo
    lru.delete(viejo);
  }
  contarLru();
}

/** Suelta TODOS los bitmaps. Es la única forma de devolver la memoria de vídeo:
 *  un ImageBitmap no lo recoge el GC solo. */
function vaciarLru() {
  for (const bm of lru.values()) bm.close();
  lru.clear();
  contarLru();
}

function dormir() {
  if (dormido) return;
  dormido = true;
  stats.sleeping = true;
  vaciarLru();
  precargaCompleta = false;   // al despertar habrá que volver a precargar
  post({ type: 'stats', stats });
}

function despertar() {
  if (!dormido) return;
  dormido = false;
  stats.sleeping = false;
  // El canvas sigue enseñando el último fotograma pintado, así que no hay nada
  // que recomponer: basta con volver a llenar la caché alrededor.
  void servir();
}

// ------------------------------------------------------------- descodificar

/** ¿Están ya en memoria los bytes de este fotograma? */
function disponible(i: number): boolean {
  if (!track || i < 0 || i >= track.frameCount) return false;
  if (tengo?.[i]) return true;
  return track.offsets[i] + track.sizes[i] <= recibidos;
}

/**
 * El fotograma disponible más cercano al que se quiere, PERO solo si está a
 * MAX_SUSTITUTO o menos.
 *
 * Antes esto buscaba por todo el vídeo, y ahí estaba el desfile: con la descarga
 * a medias y el usuario quieto en el 50 %, se pintaba el fotograma 3, luego el
 * 7, luego el 12... y el fondo se ponía a rodar solo durante segundos. Un salto
 * de 40 fotogramas es OTRA ESCENA; dejar el póster (o congelar lo último
 * pintado) molesta muchísimo menos que la película andando sola.
 */
function sustitutoCercano(i: number): number {
  if (!track) return -1;
  for (let d = 0; d <= MAX_SUSTITUTO; d++) {
    if (disponible(i - d)) return i - d;
    if (disponible(i + d)) return i + d;
  }
  return -1;
}

const espera = (ms: number) => new Promise<'tarde'>((r) => setTimeout(() => r('tarde'), ms));

/**
 * Descodifica UN fotograma y devuelve su ImageBitmap. En serie: quien llama
 * espera, así que nunca hay dos VideoFrame vivos a la vez (ver nota 2).
 */
async function descodificar(i: number): Promise<ImageBitmap | null> {
  // Se capturan en locales A PROPÓSITO: entre los awaits de aquí abajo puede
  // entrar un reiniciar() (caché envenenada) que cierre el descodificador y
  // ponga `decoder` a null. Leyendo la variable de módulo después del await, el
  // `decoder.flush()` reventaría con un TypeError, servir() lo cazaría y el hero
  // caería al <video> sin motivo. Con el local, como mucho flush() rechaza y ya
  // está cazado.
  const buf = bytes;
  const dec = decoder;
  const t = track;
  if (!dec || !t || !buf || dec.state !== 'configured') return null;

  const ts = tsSiguiente++;
  const listo = new Promise<VideoFrame>((res) => pendientes.set(ts, res));

  dec.decode(new EncodedVideoChunk({
    // Todos los samples son keyframe (el parser lo verifica), así que cualquiera
    // se descodifica suelto: eso es lo que permite el acceso aleatorio.
    type: 'key',
    timestamp: ts,
    data: buf.subarray(t.offsets[i], t.offsets[i] + t.sizes[i]),
  }));
  stats.decodes++;

  // Descodificador que retiene la salida (software): forzarla ya, sin esperar.
  if (necesitaFlush) void dec.flush().catch(() => {});

  let frame = await Promise.race([listo, espera(ESPERA_ANTES_DE_FLUSH_MS)]);
  if (frame === 'tarde') {
    // Que UN fotograma tarde no significa que el descodificador retenga: el
    // primero, en frío, tarda decenas de ms hasta en hardware (medido: hasta
    // 70 ms). Si se latcha ahí, se acaba pagando un flush (6 ms) en cada
    // fotograma para siempre. Un descodificador que retiene de verdad no saca
    // NINGUNO solo, así que llega con exigir que falle varias veces SEGUIDAS.
    if (++tardiosSeguidos >= TARDIOS_PARA_LATCHAR) {
      necesitaFlush = true;
      stats.needsFlush = true;
    }
    try { await dec.flush(); } catch { /* reconfigurado o cerrado por medio */ }
    frame = await Promise.race([listo, espera(1000)]);
    if (frame === 'tarde') { pendientes.delete(ts); return null; }
  } else {
    tardiosSeguidos = 0;
  }

  try {
    return await crearBitmap(frame);
  } finally {
    // OBLIGATORIO. Sin esto el pool se atasca a los 10 fotogramas y flush() deja
    // de resolver para siempre.
    frame.close();
  }
}

/**
 * VideoFrame → ImageBitmap con el recorte "cover" y el escalado al backing YA
 * HECHOS. Es la nota 6 de la cabecera en una función: el remuestreo se paga
 * aquí (una vez por fotograma descodificado, en el hilo del worker, y queda
 * cacheado así en la LRU), para que pintar sea un drawImage 1:1 y el compositor
 * no tenga que remuestrear el viewport entero en cada frame (+5,2 ms/frame
 * medidos sin GPU).
 *
 * El recorte replica object-fit:cover con el ancla `focoX/focoY`
 * (object-position): se toma del vídeo el rectángulo más grande con la
 * proporción del backing y se escala a él. Si backing y vídeo miden lo mismo
 * (monitor 1080p a pantalla completa), sale un recorte identidad y un resize
 * no-op: el caso común no paga nada nuevo.
 */
function crearBitmap(frame: VideoFrame): Promise<ImageBitmap> {
  const vw = frame.displayWidth || frame.codedWidth;
  const vh = frame.displayHeight || frame.codedHeight;
  const cw = canvas?.width ?? vw;
  const ch = canvas?.height ?? vh;
  const s = Math.max(cw / vw, ch / vh);
  const srcW = Math.min(vw, Math.max(1, Math.round(cw / s)));
  const srcH = Math.min(vh, Math.max(1, Math.round(ch / s)));
  const srcX = Math.round((vw - srcW) * focoX);
  const srcY = Math.round((vh - srcH) * focoY);
  return createImageBitmap(frame, srcX, srcY, srcW, srcH, {
    resizeWidth: cw,
    resizeHeight: ch,
    // 'medium' para que la reducción (1920 → portátiles 1366/1536) no haga
    // parpadear los radios de las bicis; el sobrecoste sobre 'low' es del hilo
    // del worker, que va sobrado.
    resizeQuality: 'medium',
  });
}

// ------------------------------------------------------------ bucle de pintado

function pintar(i: number, bm: ImageBitmap) {
  if (!ctx || !canvas) return;
  // Fotograma base, opaco (globalAlpha vale 1 por defecto y con {alpha:false} el
  // canvas queda cubierto entero).
  ctx.drawImage(bm, 0, 0, canvas.width, canvas.height);
  // Blend: si el scroll está ENTRE i e i+1 (frac>0) y el vecino i+1 ya está en la
  // caché, se pinta encima con opacidad = frac. Resultado = lerp(i, i+1, frac).
  // Es un cross-fade (doble exposición), no interpolación con movimiento: se
  // mide imperceptible en la portada porque su cámara casi no se mueve. Si i+1 no
  // está aún (o es el último fotograma), se queda solo la base: sin fantasma, con
  // un stepping momentáneo hasta que el prefetch traiga el vecino y recomponer().
  if (fracActual > 0.003) {
    // lru.get (no lruGet): el vecino no debe robarle la recencia al fotograma
    // pintado, o la LRU expulsaría justo lo que el scroll va a volver a pedir.
    const vecino = lru.get(i + 1);
    if (vecino) {
      ctx.globalAlpha = fracActual;
      ctx.drawImage(vecino, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }
  }
  pintado = i;
  stats.painted++;   // contador de fotogramas pintados (se expone con ?bench=1)
  if (!primerPintado) {
    primerPintado = true;
    post({ type: 'firstPaint' });
  }
}

/** Repinta el fotograma que ya está en pantalla con el frac de AHORA, sin
 *  descodificar nada: es lo que hace que el cross-fade avance suave entre dos
 *  fotogramas vecinos (cuando el scroll se mueve dentro de un mismo intervalo,
 *  cambia frac pero no el índice entero) y lo que recompone en cuanto el prefetch
 *  trae el vecino i+1. Barato: un par de drawImage desde la caché. */
function recomponer() {
  if (pintado < 0) return;
  const bm = lruGet(pintado);
  if (bm) pintar(pintado, bm);
}

/**
 * Lleva el canvas hasta `deseado`. Reentrante: si el scroll se mueve mientras
 * se descodifica, se descarta el objetivo viejo y se va a por el nuevo.
 *
 * OJO con el `sirviendo`: descartar sin más las llamadas que entran mientras se
 * está descodificando PIERDE avisos. Pasaba de verdad: el primer 'seek' llegaba
 * justo mientras el worker descodificaba, se ignoraba, y como nadie volvía a
 * llamar, el hero se quedaba en negro para siempre. Por eso lo que entra a
 * destiempo no se tira: se apunta en `repetir` y se vuelve a dar otra vuelta.
 */
async function servir() {
  if (sirviendo) { repetir = true; return; }
  if (!track) return;
  sirviendo = true;
  try {
    do {
      repetir = false;
      await unaPasada();
      await prefetch();
    } while (repetir);
  } catch (e) {
    post({ type: 'error', message: `descodificando: ${(e as Error).message}` });
  } finally {
    sirviendo = false;
    // Si el hero se ha ido de la pantalla MIENTRAS descodificábamos, el bitmap
    // recién hecho habría entrado en una LRU ya vaciada y se habría quedado ahí
    // (8 MB de memoria de vídeo) hasta la siguiente siesta, que no llegaría
    // nunca. Ya está pintado en el canvas, así que se puede soltar.
    if (dormido) vaciarLru();
  }
  post({ type: 'stats', stats });
}

async function unaPasada() {
  while (deseado !== pintado && deseado >= 0) {
    const objetivo = deseado;

    const cacheado = lruGet(objetivo);
    if (cacheado) {
      stats.hits++;
      pintar(objetivo, cacheado);
      continue;
    }

    if (!disponible(objetivo)) {
      // Aún no ha bajado. En vez de esperar a que la descarga lineal llegue
      // hasta aquí (a 5 Mbps eran ~7 s con el fondo desfilando solo), se piden
      // por Range SOLO los ~64 KB de este sample: es all-intra, se descodifica
      // suelto. Es lo que hacía el <video> con su `Range: bytes=N-`.
      pedirPrioritario(objetivo);

      // Y mientras llega, un sustituto SOLO si está pegado (ver sustitutoCercano).
      const cerca = sustitutoCercano(objetivo);
      if (cerca >= 0 && cerca !== pintado) {
        const bm = lruGet(cerca) ?? await descodificar(cerca);
        if (bm) { lruSet(cerca, bm); pintar(cerca, bm); }
      }
      return;
    }

    stats.misses++;
    const bm = await descodificar(objetivo);
    if (!bm) return;
    lruSet(objetivo, bm);
    // Si el scroll se ha ido a otro sitio mientras tanto, no pintes este: se
    // queda en la caché y vamos a por el nuevo en la siguiente vuelta.
    if (deseado === objetivo) pintar(objetivo, bm);
  }
}

/** Adelanta fotogramas en la dirección en la que va el scroll. Se corta en
 *  cuanto el scroll pide otra cosa: lo urgente es lo que se ve.
 *
 *  Con `pintado < 0` no hay nada pintado aún, así que no hay dirección que
 *  seguir: el `pintado + k*direccion` daría índices inventados a partir de -1. */
async function prefetch() {
  if (!track || dormido) return;

  // DECODE-AHEAD (portada): recorre TODOS los fotogramas y rellena la caché, para
  // que el scroll no descodifique nada (el trabajo caro se hace una vez, con el
  // hero quieto). Cede al scroll: si el usuario mueve el scroll, sale marcando
  // `repetir` para que servir() atienda antes lo pedido y luego vuelva a seguir
  // precargando. Cuando ya están todos, `precargaCompleta` lo apaga para siempre.
  if (modoPrecarga) {
    if (precargaCompleta) { if (fracActual > 0) recomponer(); return; }
    let faltan = 0;
    for (let i = 0; i < track.frameCount; i++) {
      if (dormido) return;
      if (deseado !== pintado) { repetir = true; return; }  // el scroll pide algo: cede
      if (lru.has(i)) continue;
      if (!disponible(i)) { faltan++; continue; }            // aún no bajó; otra vuelta lo pillará
      const bm = await descodificar(i);
      if (!bm) return;
      lruSet(i, bm);
      if (fracActual > 0) recomponer();
    }
    if (faltan === 0) precargaCompleta = true;               // clip entero en memoria
    if (fracActual > 0) recomponer();
    return;
  }

  // Prefetch normal (taller / sin decode-ahead): solo `adelanto` en la dirección.
  if (pintado < 0) return;
  for (let k = 1; k <= adelanto; k++) {
    if (deseado !== pintado) return;                 // ha vuelto a moverse: fuera
    const i = pintado + k * direccion;
    if (i < 0 || i >= track.frameCount) return;
    if (lru.has(i) || !disponible(i)) continue;
    const bm = await descodificar(i);
    if (!bm) return;
    lruSet(i, bm);
  }
  // Con blend, el vecino i+1 que el cross-fade necesita puede acabar de entrar en
  // la caché justo ahora: recomponer el fotograma en pantalla para que el blend
  // aparezca sin esperar al siguiente tick.
  if (fracActual > 0) recomponer();
}

// ------------------------------------------------------------------- descarga

/** Crece el buffer conservando TODO lo escrito (también lo que hayan metido las
 *  peticiones prioritarias más allá de `recibidos`) y lo devuelve. */
function asegurar(n: number): Uint8Array<ArrayBuffer> {
  let buf = bytes;
  if (!buf || buf.length < n) {
    const mas = new Uint8Array(new ArrayBuffer(Math.max(n, (buf?.length ?? 0) * 2)));
    if (buf) mas.set(buf);
    buf = mas;
    bytes = buf;
  }
  return buf;
}

/** Tamaño del fichero ENTERO. En un 206 el content-length es el del trozo, no el
 *  del fichero: eso está en el `/N` final del content-range. */
function tamanoTotal(res: Response): number {
  const cr = res.headers.get('content-range');
  if (cr) {
    const m = /\/(\d+)\s*$/.exec(cr);
    return m ? Number(m[1]) : 0;
  }
  return Number(res.headers.get('content-length')) || 0;
}

/**
 * ¿Está el MP4 ENTERO? Se comprueba contra el PROPIO FICHERO, no contra las
 * cabeceras HTTP, que pueden faltar o mentir.
 *
 * Esto es lo que faltaba y era un envenenamiento de caché PERMANENTE: si la
 * respuesta viene sin content-length (chunked, proxy, origen en streaming) y se
 * corta a medias, el stream termina LIMPIAMENTE (done:true) con los bytes
 * incompletos. parseMp4() ni se entera, porque con faststart la moov está en el
 * byte 32 y llega siempre: frameCount = 121, cero errores, cero fallback. Y esos
 * bytes a medias se escribían en la Cache API como si fueran el fichero entero.
 * A partir de ahí TODAS las visitas siguientes servían el fichero truncado desde
 * la caché y NUNCA volvían a pedirlo: el hero se quedaba congelado para siempre
 * en la parte final del scroll, en silencio, sin error, sin fallback y sin
 * poder auto-repararse. Solo renombrar el fichero (v5) rescataba al usuario.
 */
function comprobarIntegridad() {
  if (!track) throw new Error('MP4: no se ha podido leer la moov');
  const n = track.frameCount;
  const fin = track.offsets[n - 1] + track.sizes[n - 1];
  if (fin > recibidos) {
    throw new Error(`MP4 incompleto: ${recibidos} bytes de ${fin} (falta el último fotograma)`);
  }
  if (total && recibidos !== total) {
    throw new Error(`MP4 incompleto: ${recibidos} bytes de ${total} (content-length)`);
  }
}

/** Deja el estado como si no se hubiera bajado nada. Solo se usa cuando hay que
 *  tirar una caché envenenada y volver a bajar de red. */
function reiniciar() {
  bytes = null;
  recibidos = 0;
  total = 0;
  tengo = null;
  track = null;
  arranque = null;
  pendientes.clear();
  vaciarLru();
  if (decoder && decoder.state !== 'closed') {
    try { decoder.close(); } catch { /* ya estaba cerrado */ }
  }
  decoder = null;
  // `pintado` NO se toca: el canvas sigue enseñando ese fotograma de verdad.
}

/** Lee un Response en streaming dentro del buffer, a partir del byte `desde`. */
async function tragar(res: Response, desde: number) {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('respuesta sin cuerpo');

  let p = desde;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    asegurar(p + value.length).set(value, p);
    p += value.length;
    if (p > recibidos) recibidos = p;
    await alLlegarBytes();
  }
}

async function alLlegarBytes() {
  const buf = bytes;
  if (!buf) return;

  // En cuanto se puede parsear la moov (faststart: va al principio) ya se sabe
  // dónde está cada fotograma, y se puede empezar a pintar aunque el mdat siga
  // bajando.
  if (!track) {
    let leido: Mp4Track | null = null;
    try {
      leido = parseMp4(buf.subarray(0, recibidos));
    } catch {
      // Todavía no ha llegado la moov entera. Se reintenta con más bytes.
      // OJO: este catch es SOLO para eso. Si se le deja envolver también a
      // arrancarDecoder(), un fallo al configurar el descodificador se traga en
      // silencio y el hero se queda muerto sin caer al <video>.
    }
    if (leido) {
      track = leido;
      tengo = new Uint8Array(leido.frameCount);
      await arrancarDecoder();   // si lanza, sube hasta descargar() -> <video>
    }
  }
  if (track) void servir();
  post({ type: 'progress', loaded: recibidos, total: total || recibidos });
}

/**
 * Pide por Range los bytes EXACTOS de un fotograma que aún no ha bajado y lo
 * pinta en cuanto llegan. Una sola petición viva: si el scroll se mueve, la
 * siguiente vuelta ya pedirá el nuevo objetivo.
 */
function pedirPrioritario(i: number) {
  const t = track;
  if (!rangeOk || !t || bajandoRango || disponible(i)) return;
  bajandoRango = true;
  stats.ranges++;

  const ini = t.offsets[i];
  const fin = ini + t.sizes[i] - 1;
  fetch(urlMp4, { headers: { Range: `bytes=${ini}-${fin}` } })
    .then(async (r) => {
      if (r.status !== 206) {
        // Servidor sin Range: se deja de intentar y manda la descarga lineal.
        rangeOk = false;
        await r.body?.cancel().catch(() => {});
        return;
      }
      const trozo = new Uint8Array(await r.arrayBuffer());
      if (!tengo || trozo.length !== t.sizes[i] || track !== t) return;
      asegurar(ini + trozo.length).set(trozo, ini);
      tengo[i] = 1;
    })
    .catch(() => { /* red: ya lo traerá la descarga lineal */ })
    .finally(() => {
      bajandoRango = false;
      void servir();   // o pinta el bueno, o pide el siguiente
    });
}

/** Sirve el MP4 desde la Cache API. Devuelve false si no hay entrada o si la
 *  que hay está TRUNCADA (en cuyo caso la borra, para que el usuario se
 *  auto-repare en la siguiente vuelta en vez de quedarse roto para siempre). */
async function servirDeCache(cache: Cache, url: string): Promise<boolean> {
  const hit = await cache.match(url).catch(() => undefined);
  if (!hit) return false;
  try {
    total = tamanoTotal(hit);
    asegurar(total || 8 * 1024 * 1024);
    await tragar(hit, 0);
    comprobarIntegridad();
    void servir();
    return true;
  } catch {
    await cache.delete(url).catch(() => {});
    reiniciar();
    return false;
  }
}

async function bajarDeRed(url: string) {
  // Descarga lineal única, sin Range: es el camino rápido y no gasta un viaje de
  // ida y vuelta extra. Los fotogramas que el scroll pida antes de tiempo se
  // adelantan con un Range suelto (pedirPrioritario), que es justo lo que hacía
  // el <video>.
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} al bajar ${url}`);
  total = tamanoTotal(res);
  asegurar(total || 8 * 1024 * 1024);
  rangeOk = true;   // optimista; el primer prioritario dirá si es verdad
  await tragar(res, 0);
}

/**
 * Descarga el MP4 pasando por la Cache API con clave versionada: la segunda
 * visita no vuelve a bajar los 7,5 MB. Va sirviendo los bytes según llegan,
 * para poder pintar el primer fotograma sin esperar al fichero entero.
 */
async function descargar(url: string, cacheName: string) {
  urlMp4 = url;

  // `caches` no existe fuera de contexto seguro (http://, file://): si no está,
  // se tira de red y ya.
  let cache: Cache | null = null;
  try {
    if (typeof caches !== 'undefined') {
      cache = await caches.open(cacheName);
      // Tirar versiones viejas del hero (hero-scrub-v3 y compañía).
      for (const k of await caches.keys()) {
        if (k.startsWith('dcbikes-hero-') && k !== cacheName) void caches.delete(k);
      }
    }
  } catch { /* sin Cache API: seguimos por red */ }

  if (cache && (await servirDeCache(cache, url))) return;

  await bajarDeRed(url);

  // Si el fichero llegó a medias, esto LANZA: el hero cae al <video> y —lo
  // importante— NO se cachea la basura.
  comprobarIntegridad();

  if (cache && bytes) {
    try {
      await cache.put(url, new Response(bytes.subarray(0, recibidos), {
        headers: { 'content-type': 'video/mp4', 'content-length': String(recibidos) },
      }));
    } catch { /* cuota llena: no pasa nada, es solo caché */ }
  }

  void servir();
}

/**
 * Backing ideal del canvas: EL TAMAÑO FÍSICO DEL HUECO, sea el que sea. Solo se
 * reduce si se pasa de BACKING_MAX_PX, y entonces conservando la proporción del
 * HUECO (no la del vídeo): así el object-fit:cover del elemento queda en
 * identidad y el recorte real lo decide crearBitmap() con el ancla del encuadre.
 *
 * AQUÍ HABÍA UN CAP AL TAMAÑO NATIVO DEL VÍDEO Y ERA UN FALLO. El razonamiento
 * que lo justificaba decía: "por encima del nativo no hay nitidez que ganar, y
 * el compositor escala igual que siempre, SIN REGRESIÓN". Las dos frases son
 * ciertas y la conclusión es falsa:
 *
 *  - Lo de la nitidez es verdad y da igual. Estirar 1920 -> 2538 no inventa
 *    detalle, no se busca detalle: SE BUSCA SUAVIDAD. El compositor ya estaba
 *    haciendo EXACTAMENTE ese mismo estirado; la única diferencia es que lo
 *    hacía 60 veces por segundo, en el proceso equivocado, en vez de una vez por
 *    fotograma descodificado en el hilo del worker, que va sobrado.
 *  - "Sin regresión" no es "arreglado". En un monitor más ancho que el vídeo el
 *    cap dejaba el arreglo de la nota 6 SIN APLICAR, que es como no tenerlo. El
 *    cap era la anomalía dentro de su propio diseño: el mismo fichero ya medía
 *    que ese estirado cuesta +5,2 ms/frame y que es la peor configuración.
 *
 * MEDIDO (taller, sin GPU, ventana real de 2560 en un 3440x1440, 20 px/frame,
 * mediana de 3 pasadas), cap contra sin cap:
 *      con cap (canvas 1920x957, NO 1:1): p50 24,9 ms · 54 % de frames >23 ms
 *      sin cap (canvas 2538x1265, 1:1)  : p50 16,7 ms ·  4 % de frames >23 ms
 * Y es un ACANTILADO, no una pendiente: entre 1920 (1:1) y 2048 (roto) hay un
 * 13 % más de píxeles y 20 veces más jank. El precio de quitar el cap es
 * MEMORIA (bitmaps más grandes), y eso lo acota LRU_PRESUPUESTO_MIB.
 *
 * O sea: NO vuelvas a capar esto al nativo del vídeo "porque no da nitidez".
 * No va de nitidez.
 */
function backingIdeal(t: Mp4Track): { w: number; h: number } {
  if (viewportW <= 0 || viewportH <= 0) return { w: t.codedWidth, h: t.codedHeight };
  const area = viewportW * viewportH;
  // Tope normal por sanidad. Con DECODE-AHEAD hay un segundo tope: el que hace que
  // los N fotogramas quepan en PRECARGA_PRESUPUESTO_MIB. Si el viewport es más
  // grande, se reduce el backing (el compositor reescala: se pierde algo de
  // nitidez a cambio de que el clip entero quepa y el scroll no descodifique nada).
  let topePx = BACKING_MAX_PX;
  if (modoPrecarga && t.frameCount > 0) {
    const porPrecarga = (PRECARGA_PRESUPUESTO_MIB * 1024 * 1024) / (t.frameCount * 4);
    topePx = Math.min(topePx, porPrecarga);
  }
  const k = area > topePx ? Math.sqrt(topePx / area) : 1;
  return {
    w: Math.max(1, Math.round(viewportW * k)),
    h: Math.max(1, Math.round(viewportH * k)),
  };
}

/** Aplica el backing que toque al canvas. Devuelve true si ha cambiado de
 *  tamaño (y por tanto se ha borrado su contenido y la LRU ya no vale). */
function ajustarBacking(t: Mp4Track): boolean {
  if (!canvas) return false;
  const b = backingIdeal(t);
  stats.canvasW = b.w;
  stats.canvasH = b.h;
  const cambia = canvas.width !== b.w || canvas.height !== b.h;
  if (cambia) {
    canvas.width = b.w;
    canvas.height = b.h;
  }
  // Bitmaps más grandes => caben menos en el presupuesto. Se recalcula SIEMPRE,
  // no solo si el canvas ha cambiado de tamaño: en el arranque el hilo principal
  // ya suele acertar el backing de primeras, así que aquí no cambiaría nada...
  // y la LRU se quedaría con el tope por defecto (8) justo en los monitores
  // grandes donde 8 no caben. Es el único sitio por el que pasan TODOS los
  // backings, incluido el primero.
  recalcularLru();
  return cambia;
}

function arrancarDecoder(): Promise<void> {
  if (arranque) return arranque;
  arranque = (async () => {
    const t = track;
    if (!t) throw new Error('MP4: sin pista de vídeo');

    ajustarBacking(t);

    const config: VideoDecoderConfig = {
      codec: t.codec,
      description: t.description,
      codedWidth: t.codedWidth,
      codedHeight: t.codedHeight,
      // 'prefer-software', igual que el sitio de GTA VI de Rockstar (verificado en
      // el teardown de su worker). Motivo, medido de campo: en navegadores que
      // restringen recursos o el pipeline de vídeo (Opera GX con GX Control, y
      // similares) la ruta por HARDWARE que puede elegir 'no-preference' se cuelga
      // sin dar error —el worker se queda mudo y el hero se ve congelado—, mientras
      // que forzar software arranca en todas partes. Rockstar va fluido ahí
      // precisamente por esto. El coste (software siempre) lo absorbe el prefetch:
      // los fotogramas se descodifican por adelantado, fuera del camino del pintado.
      // ('prefer-hardware' está descartado aparte: es HARDWARE-ONLY en Chrome y
      // mataba el scrub en máquinas sin H.264 por hardware.)
      hardwareAcceleration: 'prefer-software',
      // SIEMPRE true: el mecanismo de descodificar() (carrera + flush por fotograma)
      // depende de esta latencia baja para sacar cada frame; con false el
      // descodificador retiene la salida y no sale ninguno (probado: cached=0).
      // Con decode-ahead el flush por fotograma solo se paga en la PRECARGA (hero
      // quieto), no en el scroll (que ya es todo cache-hit), así que no penaliza
      // el steady-state, que es lo que importa en Opera GX.
      optimizeForLatency: true,
    };

    // Lo pide el propio mensaje de error de Chrome («Check isConfigSupported()
    // prior to calling configure()»): así se cae al <video> de forma limpia, en
    // vez de por el callback de error del descodificador.
    const { supported } = await VideoDecoder.isConfigSupported(config);
    if (!supported) throw new Error(`VideoDecoder: configuración no soportada (${t.codec})`);

    decoder = new VideoDecoder({
      output: (frame) => {
        const resolver = pendientes.get(frame.timestamp);
        if (!resolver) { frame.close(); return; }   // llegó tarde: cerrarlo igual
        pendientes.delete(frame.timestamp);
        resolver(frame);
      },
      error: (e) => post({ type: 'error', message: `VideoDecoder: ${e.message}` }),
    });

    decoder.configure(config);

    post({
      type: 'ready',
      frameCount: t.frameCount,
      width: t.codedWidth,
      height: t.codedHeight,
      codec: t.codec,
    });
  })();
  return arranque;
}

// -------------------------------------------------------------------- mensajes

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;

  if (msg.type === 'init') {
    canvas = msg.canvas;
    ctx = canvas.getContext('2d', { alpha: false });
    viewportW = msg.viewport.width;
    viewportH = msg.viewport.height;
    modoPrecarga = msg.precarga ?? false;
    focoX = msg.encuadre.x;
    focoY = msg.encuadre.y;
    stats.canvasW = canvas.width;
    stats.canvasH = canvas.height;
    descargar(msg.url, msg.cacheName).catch((err: Error) => {
      post({ type: 'error', message: err.message });
    });
    return;
  }

  if (msg.type === 'viewport') {
    viewportW = msg.width;
    viewportH = msg.height;
    // Si el vídeo aún no ha llegado, con guardarlo basta: arrancarDecoder()
    // aplicará el backing bueno antes del primer pintado.
    if (!track) return;
    // El fotograma que enseña el canvas AHORA, antes de que el resize lo borre.
    const enPantalla = pintado >= 0 ? pintado : deseado;
    const bmPrevio = enPantalla >= 0 ? lru.get(enPantalla) : undefined;
    if (bmPrevio) lru.delete(enPantalla); // fuera de la LRU para que vaciarLru() no lo cierre
    if (!ajustarBacking(track)) {
      if (bmPrevio) lruSet(enPantalla, bmPrevio); // no ha cambiado nada: devuélvelo
      return;
    }
    // Backing nuevo => los bitmaps cacheados (pre-recortados y pre-escalados al
    // tamaño viejo) ya no valen. El fotograma actual se re-estira como apaño
    // instantáneo (evita un frame en negro a mitad de resize) y se re-descodifica
    // limpio justo después.
    vaciarLru();
    precargaCompleta = false;   // backing nuevo => hay que re-precargar el clip
    if (bmPrevio && ctx && canvas) {
      ctx.drawImage(bmPrevio, 0, 0, canvas.width, canvas.height);
      bmPrevio.close();
    }
    if (enPantalla >= 0) {
      pintado = -1;          // fuerza el repintado aunque el índice no cambie
      deseado = enPantalla;
      void servir();
    }
    return;
  }

  if (msg.type === 'sleep') { dormir(); return; }
  if (msg.type === 'wake') { despertar(); return; }

  if (msg.type === 'seek') {
    fracActual = msg.frac ?? 0;
    if (msg.index !== deseado) {
      direccion = msg.dir || (msg.index > deseado ? 1 : -1);
      deseado = msg.index;
      void servir();
    } else if (fracActual > 0) {
      // Solo se ha movido el subfotograma (mismo índice entero, distinto frac):
      // el cross-fade avanza recomponiendo desde la caché, sin descodificar nada.
      recomponer();
    }
  }
};
