/** Mensajes entre el hilo principal y el worker que descodifica el hero. */

export interface ScrubStats {
  /** Fotogramas en la caché LRU y coste aproximado en memoria de vídeo. */
  cached: number;
  cachedMB: number;
  /** Techo vigente de la LRU. NO es una constante: sale de un presupuesto de
   *  memoria dividido entre lo que ocupa un bitmap con el backing de ahora, así
   *  que en un monitor grande son menos fotogramas (ver el worker). */
  lruMax: number;
  decodes: number;
  hits: number;
  misses: number;
  /** Fotogramas REALMENTE pintados en el canvas (incluye los recompuestos del
   *  cross-fade). Es la métrica de fluidez de verdad: el hilo principal calcula
   *  img/s con el delta de este contador. */
  painted: number;
  /** Peticiones Range sueltas para adelantar un fotograma que aún no había
   *  bajado (ver `pedirPrioritario` en el worker). */
  ranges: number;
  /** true si este descodificador retiene la salida y hay que forzarla con flush()
   *  (descodificador por software; ver scrubDecoder.worker.ts). */
  needsFlush: boolean;
  /** true mientras el hero está fuera de pantalla o la pestaña escondida: la
   *  caché de bitmaps está vacía y no se adelanta nada. */
  sleeping: boolean;
  /** Tamaño real del backing del canvas en píxeles físicos. Sirve para
   *  verificar la regla de oro del motor: backing == píxeles mostrados
   *  (blit 1:1). */
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
       * ESTE es el backing del canvas, tal cual, a cualquier ancho (solo se
       * reduce en el disparate: ver BACKING_MAX_PX en el worker). El porqué es
       * la regla de oro medida en el diagnóstico sin GPU: si el backing coincide
       * con los píxeles físicos mostrados, el compositor copia el quad 1:1
       * (barato); si NO coincide, tiene que remuestrear el viewport entero EN
       * CADA FRAME, y eso costó +5,2 ms/frame medidos en composición software.
       * Quien reescala es SIEMPRE el worker (una vez por fotograma
       * descodificado), nunca el compositor (una vez por frame compuesto).
       *
       * Ojo: esto vale también cuando el hueco es MÁS GRANDE que el vídeo. Ahí
       * el backing supera al nativo y el bitmap se estira sin ganar nitidez; da
       * igual, porque lo que se busca es suavidad y el compositor iba a hacer
       * ese mismo estirado de todas formas, pero en cada frame. Ver el comentario
       * de backingIdeal() en el worker, que cuenta el fallo que había aquí.
       */
      viewport: { width: number; height: number };
      /**
       * Decode-ahead estilo Rockstar: si true, tras arrancar el worker
       * descodifica TODOS los fotogramas por adelantado y los RETIENE (LRU sin
       * expulsión, con el backing capado para que quepan), de modo que durante el
       * scroll no descodifica nada — solo pinta lo ya listo. Es lo que hace que en
       * navegadores con el pipeline de vídeo frágil (Opera GX) el scrub no se
       * atasque: el trabajo caro se hace una vez, con el hero quieto, no en caliente.
       * Lo activa la portada (junto con el blending); el taller no lo usa.
       */
      precarga?: boolean;
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
  /**
   * dir: +1 si el scroll baja, -1 si sube. Manda el prefetch.
   *
   * frac (0..1): posición SUBFOTOGRAMA entre `index` e `index+1`. Si viene y es
   * > 0, el worker MEZCLA (cross-fade) el fotograma `index` con el `index+1`
   * pintando el segundo con globalAlpha=frac encima: así la cadencia deja de
   * estar atada al número de fotogramas y pasa a ser la del refresco (rompe el
   * "stepping" sin subir N ni peso). Solo lo manda la portada (cámara casi
   * quieta -> sin fantasma); el taller NO lo manda (sus piezas se mueven y el
   * cross-fade las duplicaría), así que allí el worker pinta el índice tal cual.
   */
  | { type: 'seek'; index: number; dir: number; frac?: number }
  /**
   * El hueco visible ha cambiado (resize de ventana, zoom, cambio de DPR).
   * Llega ya con debounce desde el hilo principal. El worker recalcula el
   * backing, redimensiona el canvas, tira la LRU (los bitmaps están
   * pre-recortados y pre-escalados al tamaño viejo, ya no valen) y repinta el
   * fotograma actual al tamaño nuevo.
   */
  | { type: 'viewport'; width: number; height: number }
  /** El hero ya no se ve (fuera de pantalla o pestaña escondida): suelta los
   *  ImageBitmap de la LRU. Son varios MB de memoria de vídeo CADA UNO y, sin
   *  esto, se quedaban reservados toda la vida de la página. */
  | { type: 'sleep' }
  /** Vuelve a verse: repuebla la caché alrededor del fotograma actual. */
  | { type: 'wake' };

export type FromWorker =
  | { type: 'ready'; frameCount: number; width: number; height: number; codec: string }
  | { type: 'progress'; loaded: number; total: number }
  /**
   * Avance del DECODE-AHEAD (solo con `precarga`): cuántos fotogramas del clip
   * están ya descodificados y retenidos. `completa` se manda una vez, cuando ya
   * están TODOS y el worker no volverá a descodificar en caliente — que es el
   * instante en el que el scroll puede soltarse sin riesgo de que se atasque.
   * El hilo principal lo usa para la pantalla de carga del hero.
   */
  | { type: 'precarga'; listos: number; total: number; completa: boolean }
  /** Primer fotograma pintado en el canvas: a partir de aquí el póster sobra. */
  | { type: 'firstPaint' }
  | { type: 'stats'; stats: ScrubStats }
  | { type: 'error'; message: string };
