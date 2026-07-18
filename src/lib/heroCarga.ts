import { useSyncExternalStore } from "react";

/**
 * Puente entre el hero con scrub y la pantalla de carga (SplashScreen).
 *
 * El hero descodifica el clip entero ANTES de dejar hacer scroll (decode-ahead;
 * ver ScrubHero). Ese rato hay que taparlo con la pantalla de carga que YA
 * existía, no con una segunda cortina detrás: si no, el usuario se come dos
 * pantallas de carga seguidas.
 *
 * Es un store a pelo, sin contexto, porque los dos extremos están en ramas
 * distintas del árbol (SplashScreen cuelga de App, el hero cuelga de la ruta) y
 * un contexto obligaría a envolver la app entera para dos números.
 *
 * NO hay ventana de cortesía para la carrera "el splash se va antes de que el
 * hero se registre". Si eso pasa (ruta lazy lenta), el splash vuelve a entrar —
 * y eso es lo CORRECTO, no un parpadeo a evitar: si se va a bloquear el scroll,
 * hay que decir por qué. Cualquier margen de espera preventivo retrasaría el
 * splash en todas las páginas que no tienen hero, que son la mayoría.
 */

let pendiente = false;
let progreso = 0;

// --- ESTADO (booleano; cambia dos veces en toda la vida de la página) ---
const subsEstado = new Set<() => void>();
const avisarEstado = () => { for (const f of subsEstado) f(); };
const suscribirEstado = (f: () => void) => {
  subsEstado.add(f);
  return () => { subsEstado.delete(f); };
};

/** Para el splash: ¿hay un hero precargando al que haya que esperar? */
export function useHeroPrecargando(): boolean {
  return useSyncExternalStore(suscribirEstado, () => pendiente, () => false);
}

// --- PROGRESO (número; ~150 avisos durante la precarga) ---
// Va por su cuenta y NO pasa por estado de React a propósito: quien lo pinta
// escribe en el DOM a mano. Con estado serían ~150 re-renders de la app entera.
const subsProgreso = new Set<(p: number) => void>();
export function suscribirProgresoHero(f: (p: number) => void) {
  subsProgreso.add(f);
  f(progreso);
  return () => { subsProgreso.delete(f); };
}

/** El hero avisa de que va a precargar: la pantalla de carga debe quedarse. */
export function heroPrecargando() {
  if (pendiente) return;
  pendiente = true;
  avisarEstado();
}

/** Avance de la precarga, 0..1. */
export function heroProgreso(p: number) {
  progreso = p;
  for (const f of subsProgreso) f(p);
}

/** Precarga terminada (o rendida por el tope de seguridad): el splash se va. */
export function heroListo() {
  if (!pendiente) return;
  pendiente = false;
  avisarEstado();
}
