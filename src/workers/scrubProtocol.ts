/** Mensajes entre el hilo principal y el worker que descodifica el hero. */

export interface ScrubStats {
  /** Fotogramas en la caché LRU y coste aproximado en memoria de vídeo. */
  cached: number;
  cachedMB: number;
  decodes: number;
  hits: number;
  misses: number;
  /** Peticiones Range sueltas para adelantar un fotograma que aún no había
   *  bajado (ver `pedirPrioritario` en el worker). */
  ranges: number;
  /** true si este descodificador retiene la salida y hay que forzarla con flush()
   *  (descodificador por software; ver scrubDecoder.worker.ts). */
  needsFlush: boolean;
  /** true mientras el hero está fuera de pantalla o la pestaña escondida: la
   *  caché de bitmaps está vacía y no se adelanta nada. */
  sleeping: boolean;
}

/** No hay mensaje de cierre: el hilo principal hace worker.terminate(), que se
 *  lleva por delante el descodificador, los ImageBitmap y los bytes del MP4. */
export type ToWorker =
  | { type: 'init'; canvas: OffscreenCanvas; url: string; cacheName: string }
  /** dir: +1 si el scroll baja, -1 si sube. Manda el prefetch. */
  | { type: 'seek'; index: number; dir: number }
  /** El hero ya no se ve (fuera de pantalla o pestaña escondida): suelta los
   *  ImageBitmap de la LRU. Son ~8 MB de memoria de vídeo CADA UNO y, sin esto,
   *  se quedaban reservados toda la vida de la página. */
  | { type: 'sleep' }
  /** Vuelve a verse: repuebla la caché alrededor del fotograma actual. */
  | { type: 'wake' };

export type FromWorker =
  | { type: 'ready'; frameCount: number; width: number; height: number; codec: string }
  | { type: 'progress'; loaded: number; total: number }
  /** Primer fotograma pintado en el canvas: a partir de aquí el póster sobra. */
  | { type: 'firstPaint' }
  | { type: 'stats'; stats: ScrubStats }
  | { type: 'error'; message: string };
