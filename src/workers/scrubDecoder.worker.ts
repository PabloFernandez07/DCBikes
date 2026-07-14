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
 *    MiB POR FOTOGRAMA. Por eso la LRU es de 8 (63 MiB) y no de 16 (127 MiB), y
 *    sobre todo por eso se SUELTA entera cuando el hero sale de pantalla o se
 *    esconde la pestaña: quien está leyendo el pie de página no tiene por qué
 *    pagar memoria de vídeo por un hero que no ve.
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
 */

import { parseMp4, type Mp4Track } from '@/lib/mp4';
import type { FromWorker, ScrubStats, ToWorker } from './scrubProtocol';

/** Fotogramas que se quedan en la LRU. 8 x ImageBitmap 1080p RGBA (7,91 MiB) =
 *  63 MiB. Estaba en 16 = 127 MiB, y esa memoria no se soltaba NUNCA. El informe
 *  de partida ya midió que con 8 se va a 58,5 fps, o sea lo mismo que cachearlos
 *  todos. */
const LRU_MAX = 8;
/** Fotogramas que se adelantan en la dirección del scroll. Con LRU_MAX=8 deja
 *  además un par de huecos de historial para cuando el scroll da la vuelta. */
const PREFETCH = 5;
/** Coste en memoria de vídeo de un fotograma 1080p en RGBA. Solo para informar. */
const MB_POR_FOTOGRAMA = (1920 * 1080 * 4) / (1024 * 1024);
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
let sirviendo = false;
/** Alguien pidió algo mientras servir() estaba ocupado: hay que dar otra vuelta. */
let repetir = false;
let primerPintado = false;
/** Veces seguidas que un fotograma no ha salido solo. Ver descodificar(). */
let tardiosSeguidos = 0;
/** El hero no se ve: ni se adelantan fotogramas ni se guarda memoria de vídeo. */
let dormido = false;

const stats: ScrubStats = {
  cached: 0, cachedMB: 0, decodes: 0, hits: 0, misses: 0,
  ranges: 0, needsFlush: false, sleeping: false,
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

function contarLru() {
  stats.cached = lru.size;
  stats.cachedMB = Math.round(lru.size * MB_POR_FOTOGRAMA);
}

function lruSet(i: number, bm: ImageBitmap) {
  lru.set(i, bm);
  while (lru.size > LRU_MAX) {
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
    return await createImageBitmap(frame);
  } finally {
    // OBLIGATORIO. Sin esto el pool se atasca a los 10 fotogramas y flush() deja
    // de resolver para siempre.
    frame.close();
  }
}

// ------------------------------------------------------------ bucle de pintado

function pintar(i: number, bm: ImageBitmap) {
  if (!ctx || !canvas) return;
  ctx.drawImage(bm, 0, 0, canvas.width, canvas.height);
  pintado = i;
  if (!primerPintado) {
    primerPintado = true;
    post({ type: 'firstPaint' });
  }
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
  if (!track || pintado < 0 || dormido) return;
  for (let k = 1; k <= PREFETCH; k++) {
    if (deseado !== pintado) return;                 // ha vuelto a moverse: fuera
    const i = pintado + k * direccion;
    if (i < 0 || i >= track.frameCount) return;
    if (lru.has(i) || !disponible(i)) continue;
    const bm = await descodificar(i);
    if (!bm) return;
    lruSet(i, bm);
  }
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

function arrancarDecoder(): Promise<void> {
  if (arranque) return arranque;
  arranque = (async () => {
    const t = track;
    if (!t) throw new Error('MP4: sin pista de vídeo');

    if (canvas && (canvas.width !== t.codedWidth || canvas.height !== t.codedHeight)) {
      canvas.width = t.codedWidth;
      canvas.height = t.codedHeight;
    }

    const config: VideoDecoderConfig = {
      codec: t.codec,
      description: t.description,
      codedWidth: t.codedWidth,
      codedHeight: t.codedHeight,
      // Ver nota 1 de la cabecera. 'prefer-hardware' es HARDWARE-ONLY en Chrome
      // y mataba el scrub entero en las máquinas sin descodificador H.264 por
      // hardware, que son justo las que peor lo pasaban con el <video>.
      hardwareAcceleration: 'no-preference',
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
    descargar(msg.url, msg.cacheName).catch((err: Error) => {
      post({ type: 'error', message: err.message });
    });
    return;
  }

  if (msg.type === 'sleep') { dormir(); return; }
  if (msg.type === 'wake') { despertar(); return; }

  if (msg.type === 'seek' && msg.index !== deseado) {
    direccion = msg.dir || (msg.index > deseado ? 1 : -1);
    deseado = msg.index;
    void servir();
  }
};
