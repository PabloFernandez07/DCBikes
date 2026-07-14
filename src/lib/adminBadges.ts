/**
 * Bus mínimo para refrescar los badges del menú lateral (AdminShell).
 *
 * Los badges viven en el AdminShell, que en una SPA NO se remonta al navegar ni
 * cuando una pantalla hija muta datos. Resultado: mandabas una consulta a la
 * papelera desde /admin/consultas y el punto rojo seguía ahí hasta que cambiabas
 * de ruta o pasaban los 60 s del refresco periódico.
 *
 * Las pantallas que tocan consultas o pedidos llaman a `notifyBadgeRefresh(...)`
 * DESPUÉS de que el UPDATE haya terminado, y el AdminShell vuelve a contar contra
 * la BD al instante. Se usa un CustomEvent en window en vez de un contexto para no
 * tener que envolver medio panel en un provider por dos contadores.
 */
export type AdminBadge = 'quotes' | 'orders'

const EVENT = 'admin:badge-refresh'

/** Avisa al AdminShell de que un badge debe volver a contar. Llamar tras el UPDATE. */
export function notifyBadgeRefresh(badge: AdminBadge): void {
  window.dispatchEvent(new CustomEvent<AdminBadge>(EVENT, { detail: badge }))
}

/** Suscribe un handler a un badge concreto. Devuelve la función para desuscribirse. */
export function onBadgeRefresh(badge: AdminBadge, handler: () => void): () => void {
  const listener = (e: Event) => {
    if ((e as CustomEvent<AdminBadge>).detail === badge) handler()
  }
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
