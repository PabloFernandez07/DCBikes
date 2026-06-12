// supabase/functions/_shared/stock-restore.ts
//
// BUG-C2 (auditoría técnica 2026-06-12): restauración de stock IDEMPOTENTE.
//
// Problema original: el stock se reserva en order-place (RPC reserve_stock)
// y se devolvía vía restore_stock desde varios caminos descoordinados
// (order-reject, customer-order-cancel, order-auto-cancel, revert de captura
// KO en order-accept). Resultado: pedidos fallidos/abandonados nunca
// liberaban stock, y dos caminos concurrentes podían restaurarlo DOS veces
// (doble-restore → stock fantasma).
//
// Solución: la columna orders.stock_restored_at (migración 0065) actúa como
// candado idempotente. Este helper:
//   1. Intenta sellar stock_restored_at = now() SOLO si era NULL
//      (UPDATE condicional + select de retorno → claim atómico).
//   2. Si NO consiguió sellar (otra llamada llegó antes) → no hace nada.
//   3. Si selló → llama a restore_stock con los items del pedido.
//   4. Si restore_stock falla tras sellar → revierte el sello a NULL para
//      que un reintento posterior (cron, otro camino) pueda restaurar.
//      Riesgo residual aceptado: si la RPC restauró pero el error fue de
//      red, un reintento podría duplicar — preferible a perder stock.
//
// TODOS los caminos de restauración deben pasar por aquí. No usar
// restore_stock directamente salvo en order-place ANTES de que exista la
// fila del pedido (rollbacks pre-INSERT, donde no hay candado posible).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type RestoreStockResult = 'restored' | 'already_restored' | 'failed'

export interface RestoreItem {
  product_id: string
  qty: number
}

/**
 * Restaura el stock de un pedido exactamente UNA vez.
 *
 * @param supabase   Cliente service_role.
 * @param orderId    UUID del pedido.
 * @param knownItems Items conocidos por el caller. Necesario cuando las
 *                   filas de order_items NO existen en BD (p.ej. fallo del
 *                   INSERT de order_items en order-place — BUG-M7). Si se
 *                   omite, se leen de order_items.
 */
export async function restoreStockOnce(
  supabase: SupabaseClient,
  orderId: string,
  knownItems?: RestoreItem[],
): Promise<RestoreStockResult> {
  const tag = '[stock-restore]'

  // 1) Claim atómico: sellar stock_restored_at solo si era NULL. El
  // .select() devuelve las filas afectadas — 0 filas = ya estaba sellado
  // (otro camino restauró antes) o el pedido no existe.
  const { data: claimed, error: claimErr } = await supabase
    .from('orders')
    .update({ stock_restored_at: new Date().toISOString() })
    .eq('id', orderId)
    .is('stock_restored_at', null)
    .select('id')

  if (claimErr) {
    console.error(`${tag} claim error · order=${orderId}:`, claimErr.message)
    return 'failed'
  }
  if (!claimed || claimed.length === 0) {
    console.log(`${tag} stock ya restaurado previamente · order=${orderId} — noop`)
    return 'already_restored'
  }

  // 2) Resolver items a restaurar.
  let payload: RestoreItem[]
  if (knownItems) {
    payload = knownItems.filter(
      (it) => it.product_id && typeof it.qty === 'number' && it.qty > 0,
    )
  } else {
    const { data: items, error: itemsErr } = await supabase
      .from('order_items')
      .select('product_id, quantity')
      .eq('order_id', orderId)
    if (itemsErr || !items) {
      console.error(
        `${tag} no se pudieron leer order_items · order=${orderId}:`,
        itemsErr?.message,
      )
      // Revertir el claim para permitir reintento futuro.
      await supabase
        .from('orders')
        .update({ stock_restored_at: null })
        .eq('id', orderId)
      return 'failed'
    }
    payload = items
      .filter((it) => it.product_id && typeof it.quantity === 'number' && it.quantity > 0)
      .map((it) => ({ product_id: it.product_id as string, qty: it.quantity as number }))
  }

  if (payload.length === 0) {
    // Nada que restaurar (pedido sin items legibles). Mantenemos el sello:
    // no hay cantidades conocidas que devolver y reintentar no ayudaría.
    console.warn(`${tag} pedido sin items restaurables · order=${orderId} — sello mantenido`)
    return 'restored'
  }

  // 3) Restauración real vía RPC atómica (stock = stock + qty por item).
  const { error: rpcErr } = await supabase.rpc('restore_stock', { p_items: payload })
  if (rpcErr) {
    console.error(
      `${tag} restore_stock RPC falló · order=${orderId} · items=${JSON.stringify(payload)}:`,
      rpcErr.message,
    )
    // Revertir el claim: el stock NO se restauró; otro camino (cron) debe
    // poder reintentar.
    const { error: revertErr } = await supabase
      .from('orders')
      .update({ stock_restored_at: null })
      .eq('id', orderId)
    if (revertErr) {
      console.error(
        `${tag} CRÍTICO: no se pudo revertir el sello tras fallo de restore_stock · order=${orderId} — stock perdido, restaurar manualmente:`,
        revertErr.message,
      )
    }
    return 'failed'
  }

  console.log(`${tag} ✓ stock restaurado · order=${orderId} · items=${payload.length}`)
  return 'restored'
}
