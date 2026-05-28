import { useState, useEffect, useMemo, useCallback } from 'react'
import { clsx } from 'clsx'
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'

/**
 * Transportistas disponibles. Cliente usa principalmente Correos Express y DHL,
 * resto son fallback comunes en España.
 */
export const CARRIERS = [
  'Correos Express',
  'DHL',
  'SEUR',
  'MRW',
  'Nacex',
  'GLS',
  'Otro',
] as const

export type Carrier = typeof CARRIERS[number]

export interface BulkShipOrder {
  id: string
  order_number: string
  customer_first_name: string
  customer_last_name: string
}

interface BulkShipModalProps {
  open: boolean
  onClose: () => void
  orders: BulkShipOrder[]
  /** Llamado tras un submit con al menos 1 éxito, para que el padre refresque. */
  onAnySuccess: () => void
  /** Llamado cuando TODO ha ido OK, para cerrar y limpiar selección. */
  onAllSuccess: () => void
  /** Hook para mostrar toasts globales en el padre. */
  toast: {
    success: (msg: string) => void
    error: (msg: string) => void
    info: (msg: string) => void
  }
}

interface RowState {
  carrier: Carrier
  tracking: string
  /** `null` = no enviado todavía. `'ok'` = éxito. `'error'` con mensaje = falló. */
  result: null | 'ok' | { error: string }
}

/**
 * Modal para marcar varios pedidos como enviados en lote.
 * - Tabla con una fila por pedido (transportista + tracking).
 * - Opciones globales: mismo transportista, prefijo común de tracking.
 * - Submit en paralelo con `Promise.allSettled` contra la edge function
 *   `order-mark-shipped`. Errores se muestran por fila y se puede reintentar.
 */
export function BulkShipModal({
  open,
  onClose,
  orders,
  onAnySuccess,
  onAllSuccess,
  toast,
}: BulkShipModalProps) {
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [submitting, setSubmitting] = useState(false)
  const [sameCarrierMode, setSameCarrierMode] = useState(false)
  const [globalCarrier, setGlobalCarrier] = useState<Carrier>('Correos Express')
  const [trackingPrefix, setTrackingPrefix] = useState('')

  // Inicializa filas al abrir el modal o cambiar la lista de pedidos.
  useEffect(() => {
    if (!open) return
    setRows(prev => {
      const next: Record<string, RowState> = {}
      for (const o of orders) {
        // Conserva valores anteriores si el pedido ya estaba (caso "reintentar").
        next[o.id] = prev[o.id] ?? {
          carrier: 'Correos Express',
          tracking: '',
          result: null,
        }
      }
      return next
    })
  }, [open, orders])

  // Aplica el prefijo común a todas las filas que no han tenido éxito todavía.
  const applyPrefix = useCallback(() => {
    if (!trackingPrefix.trim()) return
    setRows(prev => {
      const next = { ...prev }
      for (const o of orders) {
        const current = next[o.id]
        if (!current || current.result === 'ok') continue
        // Sufijo: últimos 6 chars del order_number sin ceros a la izquierda.
        const suffix = o.order_number.replace(/^0+/, '').slice(-6)
        next[o.id] = {
          ...current,
          tracking: `${trackingPrefix.trim()}-${suffix}`,
        }
      }
      return next
    })
  }, [trackingPrefix, orders])

  const updateRow = (id: string, patch: Partial<RowState>) => {
    setRows(prev => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }))
  }

  // Lista de pedidos pendientes (no marcados como ok).
  const pending = useMemo(
    () => orders.filter(o => rows[o.id]?.result !== 'ok'),
    [orders, rows],
  )

  // ¿Hay fallos visibles? -> habilita "Reintentar fallidos".
  const hasFailed = useMemo(
    () => Object.values(rows).some(r => r && typeof r.result === 'object' && r.result !== null),
    [rows],
  )

  const totalCount = orders.length
  const successCount = useMemo(
    () => Object.values(rows).filter(r => r?.result === 'ok').length,
    [rows],
  )

  const handleSubmit = async (onlyFailed = false) => {
    // Determina qué pedidos enviar.
    const targets = orders.filter(o => {
      const r = rows[o.id]
      if (!r) return false
      if (r.result === 'ok') return false
      if (onlyFailed && r.result === null) return false
      return true
    })

    if (targets.length === 0) {
      toast.info('No hay pedidos pendientes de envío.')
      return
    }

    // Validación: tracking no vacío y carrier no vacío.
    const carrierForRow = (id: string): Carrier =>
      sameCarrierMode ? globalCarrier : rows[id]?.carrier ?? 'Correos Express'

    for (const o of targets) {
      const tracking = rows[o.id]?.tracking.trim() ?? ''
      const carrier = carrierForRow(o.id)
      if (!tracking) {
        toast.error(`Falta tracking del pedido ${o.order_number}.`)
        return
      }
      if (!carrier) {
        toast.error(`Falta transportista del pedido ${o.order_number}.`)
        return
      }
    }

    setSubmitting(true)

    // Marca los targets como "loading" limpiando resultados previos.
    setRows(prev => {
      const next = { ...prev }
      for (const o of targets) {
        next[o.id] = { ...next[o.id], result: null }
      }
      return next
    })

    const results = await Promise.allSettled(
      targets.map(async o => {
        const tracking = rows[o.id]!.tracking.trim()
        const carrier = carrierForRow(o.id)
        const { data, error } = await supabase.functions.invoke('order-mark-shipped', {
          body: {
            order_id: o.id,
            tracking_number: tracking,
            tracking_carrier: carrier,
          },
        })
        if (error) throw new Error(error.message || 'Error desconocido')
        // Algunas edge functions devuelven { error } en el body con 200.
        if (data && typeof data === 'object' && 'error' in data && data.error) {
          throw new Error(String(data.error))
        }
        return { id: o.id }
      }),
    )

    let success = 0
    let failed = 0
    setRows(prev => {
      const next = { ...prev }
      results.forEach((res, idx) => {
        const order = targets[idx]
        if (res.status === 'fulfilled') {
          next[order.id] = { ...next[order.id], result: 'ok' }
          success++
        } else {
          const reason = res.reason instanceof Error ? res.reason.message : String(res.reason)
          next[order.id] = { ...next[order.id], result: { error: reason } }
          failed++
        }
      })
      return next
    })

    setSubmitting(false)

    if (success > 0) onAnySuccess()

    if (failed === 0) {
      toast.success(`${success} ${success === 1 ? 'pedido marcado' : 'pedidos marcados'} como enviados`)
      onAllSuccess()
    } else if (success === 0) {
      toast.error(`Ningún pedido pudo marcarse: ${failed} ${failed === 1 ? 'fallo' : 'fallos'}`)
    } else {
      toast.error(`${success} completados, ${failed} fallaron`)
    }
  }

  if (!open) return null

  return (
    <Modal open={open} onClose={submitting ? () => {} : onClose} title="Marcar como enviados (en lote)" size="lg">
      <div className="space-y-4">
        {/* Resumen */}
        <p className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)]">
          Vas a marcar <strong className="text-[var(--color-cream)]">{totalCount}</strong>{' '}
          {totalCount === 1 ? 'pedido' : 'pedidos'} como enviados. Se enviará un email de
          confirmación al cliente con el número de seguimiento.
        </p>

        {/* Opciones globales */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-xl bg-[var(--color-ink)]/40 border border-[var(--color-card-hover)]">
          {/* Mismo transportista */}
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sameCarrierMode}
                onChange={e => setSameCarrierMode(e.target.checked)}
                className="accent-[var(--color-lavender)]"
              />
              <span className="text-xs font-[var(--font-cond)] tracking-wide text-[var(--color-cream-dim)]">
                Mismo transportista para todos
              </span>
            </label>
            {sameCarrierMode && (
              <select
                value={globalCarrier}
                onChange={e => setGlobalCarrier(e.target.value as Carrier)}
                disabled={submitting}
                className="text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-card)] px-3 py-1.5 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none"
              >
                {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>

          {/* Prefijo tracking */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-[var(--font-cond)] tracking-wide text-[var(--color-cream-dim)]">
              Prefijo tracking común (opcional)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={trackingPrefix}
                onChange={e => setTrackingPrefix(e.target.value)}
                placeholder="Ej: CEX2025"
                disabled={submitting}
                className="flex-1 text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-card)] px-3 py-1.5 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={applyPrefix}
                disabled={submitting || !trackingPrefix.trim()}
              >
                Aplicar
              </Button>
            </div>
          </div>
        </div>

        {/* Tabla de pedidos */}
        <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-[var(--color-card-hover)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-card)] z-10">
              <tr className="border-b border-[var(--color-card-hover)]">
                <th className="px-3 py-2 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Pedido</th>
                <th className="px-3 py-2 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Cliente</th>
                {!sameCarrierMode && (
                  <th className="px-3 py-2 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Transportista</th>
                )}
                <th className="px-3 py-2 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Tracking</th>
                <th className="px-3 py-2 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Estado</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => {
                const row = rows[o.id]
                if (!row) return null
                const isOk = row.result === 'ok'
                const errMsg = typeof row.result === 'object' && row.result ? row.result.error : null
                return (
                  <tr
                    key={o.id}
                    className={clsx(
                      'border-b border-[var(--color-card-hover)]/40 last:border-0',
                      isOk && 'bg-green-900/10',
                      errMsg && 'bg-red-900/10',
                    )}
                  >
                    <td className="px-3 py-2 font-[var(--font-cond)] text-[var(--color-lavender)] whitespace-nowrap">
                      {o.order_number}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-cream)] font-[var(--font-body)]">
                      {o.customer_first_name} {o.customer_last_name}
                    </td>
                    {!sameCarrierMode && (
                      <td className="px-3 py-2">
                        <select
                          value={row.carrier}
                          onChange={e => updateRow(o.id, { carrier: e.target.value as Carrier })}
                          disabled={submitting || isOk}
                          className="text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-ink)] px-2 py-1 rounded-md border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none disabled:opacity-50"
                        >
                          {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.tracking}
                        onChange={e => updateRow(o.id, { tracking: e.target.value })}
                        disabled={submitting || isOk}
                        placeholder="Nº seguimiento"
                        className="w-full text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-ink)] px-2 py-1 rounded-md border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none disabled:opacity-50"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {isOk && (
                        <span className="inline-flex items-center gap-1 text-xs text-green-300 font-[var(--font-cond)]">
                          <CheckCircle2 size={14} aria-hidden="true" /> Enviado
                        </span>
                      )}
                      {errMsg && (
                        <span
                          title={errMsg}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-[var(--font-cond)] tracking-wide border bg-red-900/30 text-red-300 border-red-500/40 uppercase max-w-[180px] truncate"
                        >
                          <AlertTriangle size={11} aria-hidden="true" /> {errMsg}
                        </span>
                      )}
                      {!isOk && !errMsg && (
                        <span className="text-xs text-[var(--color-mid)] font-[var(--font-body)]">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer acciones */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)]">
            {successCount > 0 && (
              <>
                <strong className="text-green-300">{successCount}</strong> /{' '}
                <strong className="text-[var(--color-cream)]">{totalCount}</strong> completados
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2 ml-auto">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
              {successCount === totalCount && totalCount > 0 ? 'Cerrar' : 'Cancelar'}
            </Button>
            {hasFailed && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleSubmit(true)}
                disabled={submitting}
              >
                {submitting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
                Reintentar fallidos
              </Button>
            )}
            {pending.length > 0 && !hasFailed && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleSubmit(false)}
                disabled={submitting}
              >
                {submitting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
                Confirmar envío ({pending.length})
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
