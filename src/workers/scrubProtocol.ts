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
  /** Zancada vigente de la escalera adaptativa (1 = se pinta cada fotograma).
   *  La decide el hilo principal midiendo sus deltas de rAF; aquí solo se
   *  refleja para el banco de pruebas (`?bench=1`). */
  stride: number;
  /** Tamaño real del backing del canvas en píxeles físicos. Sirve para
   *  verificar la regla de oro del motor: backing == píxeles mostrados
   *  (blit 1:1), nunca más grande. */
  canvasW: number;
  canvasH: number;
}

/** No hay mensaje de cierre: el hilo principal hace worker.terminate(), que se
 *  lleva por delante el descodificador, los ImageBitmap y los bytes del MP4. */
export type ToWorker =
  | {
      type: 'init';
      canvas: OffscreenCanvas;
      url: string;
      cacheName: string;
      /**
       * Tamaño VISIBLE del hueco del canvas, en píxeles FÍSICOS (CSS × DPR).
       *
       * El worker dimensiona el backing a min(esto, nativo del vídeo). El
       * porqué es la regla de oro medida en el diagnóstico sin GPU: si el
       * backing coincide con los píxeles físicos mostrados, el compositor copia
       * el quad 1:1 (barato); si NO coincide, tiene que remuestrear el viewport
       * entero EN CADA FRAME, y eso costó +5,2 ms/frame medidos en composición
       * software (el 720p antiguo mostrado a 1080p era la peor configuración de
       * todas, peor que el 1080p actual). Quien reescala es SIEMPRE el worker
       * (una vez por fotograma descodificado), nunca el compositor (una vez por
       * frame compuesto).
       */
      viewport: { width: number; height: number };
      /**
       * Ancla del encuadre tipo object-position, en 0..1 por eje
       * (0,5 = centro; 0 = arriba/izquierda; 1 = abajo/derecha).
       *
       * El recorte "cover" ya no lo hace el CSS: lo hace el worker al crear
       * cada ImageBitmap, para que el canvas contenga EXACTAMENTE los píxeles
       * que se ven y el compositor no tenga ni que recortar ni que escalar.
       * El object-fit:cover del elemento se queda puesto solo como red de
       * seguridad durante un resize (mientras el mensaje 'viewport' viaja).
       */
      encuadre: { x: number; y: number };
    }
  /** dir: +1 si el scroll baja, -1 si sube. Manda el prefetch. */
  | { type: 'seek'; index: number; dir: number }
  /**
   * El hueco visible ha cambiado (resize de ventana, zoom, cambio de DPR).
   * Llega ya con debounce desde el hilo principal. El worker recalcula el
   * backing, redimensiona el canvas, tira la LRU (los bitmaps están
   * pre-recortados y pre-escalados al tamaño viejo, ya no valen) y repinta el
   * fotograma actual al tamaño nuevo.
   */
  | { type: 'viewport'; width: number; height: number }
  /**
   * Zancada de la escalera adaptativa (ver el bloque grande de comentario en
   * useScrubRenderer.ts). A partir de este mensaje el hilo principal solo va a
   * pedir índices múltiplos de `stride`, así que el prefetch debe saltar por la
   * misma rejilla: adelantar los fotogramas intermedios sería quemar decode
   * justo en las máquinas donde la CPU no da para más.
   */
  | { type: 'stride'; stride: number }
  /** El hero ya no se ve (fuera de pantalla o pestaña escondida): suelta los
   *  ImageBitmap de la LRU. Son varios MB de memoria de vídeo CADA UNO y, sin
   *  esto, se quedaban reservados toda la vida de la página. */
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
