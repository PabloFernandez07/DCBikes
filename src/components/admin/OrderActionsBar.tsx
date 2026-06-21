import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, X as XIcon, Package, Store, Truck, Mail, Loader2, RotateCcw } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { Database } from '@/lib/database.types'
import type { OrderStatus } from './OrderStatusBadge'

type Order = Database['public']['Tables']['orders']['Row']

export interface OrderActionsBarProps {
  order: Order
  currentUserId: string | null
  onChanged: (updated: Partial<Order>) => void
  /** Refetch completo desde BD tras una acción exitosa. Garantiza
   *  que la UI muestre los datos reales del backend (timestamps, factura,
   *  payment_pre_auth_id, etc.) sin necesidad de F5. */
  onRefresh?: () => Promise<void> | void
  onToast: (type: 'success' | 'error' | 'info', message: string) => void
}

const CARRIERS = ['SEUR', 'Correos Express', 'MRW', 'Nacex', 'GLS'] as const
const REJECT_REASONS = [
  { value: 'no_stock', label: 'Sin stock' },
  { value: 'cannot_serve', label: 'No podemos servirlo' },
  { value: 'other', label: 'Otros' },
] as const

const STATUS_TO_RESEND_FUNCTION: Partial<Record<OrderStatus, string>> = {
  authorized: 'send-order-confirmation-customer',
  accepted: 'send-order-accepted-customer',
  rejected: 'send-order-rejected-customer',
  cancelled: 'send-order-auto-cancelled',
  ready_pickup: 'send-order-ready-pickup',
  shipped: 'send-order-shipped',
}

interface InvokeResult {
  ok: boolean
  notImplemented: boolean
  errorMessage?: string
}

/**
 * Llama una edge function. Detecta el caso "no desplegada" (404 / FunctionsHttpError
 * con status 404, o error de red típico) para que el caller pueda hacer fallback
 * a UPDATE directo en BD (útil mientras Fase E no está desplegada).
 */
async function invokeFn(name: string, body: unknown): Promise<InvokeResult> {
  try {
    const { error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> })
    if (!error) return { ok: true, notImplemented: false }

    const message = error.message ?? String(error)
    const ctx = (error as unknown as { context?: { status?: number } }).context
    const status = ctx?.status
    const notImplemented = status === 404 || /not.?found|does not exist|no such function/i.test(message)
    return { ok: false, notImplemented, errorMessage: message }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const notImplemented = /404|not.?found|failed to fetch/i.test(message)
    return { ok: false, notImplemented, errorMessage: message }
  }
}

async function appendHistory(
  orderId: string,
  fromStatus: OrderStatus,
  toStatus: OrderStatus,
  changedBy: string | null,
  reason: string | null,
) {
  await supabase.from('order_status_history').insert({
    order_id: orderId,
    from_status: fromStatus,
    to_status: toStatus,
    changed_by: changedBy,
    reason,
  })
}

export function OrderActionsBar({ order, currentUserId, onChanged, onRefresh, onToast }: OrderActionsBarProps) {
  const status = order.status as OrderStatus

  // Modal states
  const [acceptOpen, setAcceptOpen] = useState(false)
  const [acceptNotes, setAcceptNotes] = useState('')
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState<string>('no_stock')
  const [rejectCustom, setRejectCustom] = useState('')
  const [shipOpen, setShipOpen] = useState(false)
  const [shipCarrier, setShipCarrier] = useState<string>(CARRIERS[0])
  const [shipTracking, setShipTracking] = useState('')
  const [readyOpen, setReadyOpen] = useState(false)
  const [deliveredOpen, setDeliveredOpen] = useState(false)

  const [busy, setBusy] = useState(false)

  // ─── Accept ─────────────────────────────────────────────────────
  async function handleAccept() {
    if (busy) return
    setBusy(true)
    try {
      const notes = acceptNotes.trim() || null
      const res = await invokeFn('order-accept', { order_id: order.id, notes_internal: notes })

      if (res.ok) {
        onToast('success', 'Pedido aceptado correctamente')
      } else if (res.notImplemented) {
        // Fallback: UPDATE directo BD
        const acceptedAt = new Date().toISOString()
        const { error } = await supabase
          .from('orders')
          .update({
            status: 'accepted',
            accepted_by: currentUserId,
            accepted_at: acceptedAt,
            notes_internal: notes ?? order.notes_internal,
          })
          .eq('id', order.id)
        if (error) throw new Error(error.message)
        await appendHistory(order.id, status, 'accepted', currentUserId, notes)
        onChanged({
          status: 'accepted',
          accepted_by: currentUserId,
          accepted_at: acceptedAt,
          notes_internal: notes ?? order.notes_internal,
        })
        onToast('info', 'Función pendiente — esta acción se completará al desplegar Fase E. Estado actualizado localmente.')
      } else {
        throw new Error(res.errorMessage ?? 'Error desconocido')
      }
      setAcceptOpen(false)
      setAcceptNotes('')
      await onRefresh?.()
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Error al aceptar')
    } finally {
      setBusy(false)
    }
  }

  // ─── Reject ─────────────────────────────────────────────────────
  async function handleReject() {
    if (busy) return
    setBusy(true)
    try {
      const reasonLabel = REJECT_REASONS.find(r => r.value === rejectReason)?.label ?? rejectReason
      const fullReason = rejectCustom.trim()
        ? `${reasonLabel}: ${rejectCustom.trim()}`
        : reasonLabel
      const res = await invokeFn('order-reject', { order_id: order.id, rejection_reason: fullReason })

      if (res.ok) {
        onToast('success', 'Pedido rechazado')
      } else if (res.notImplemented) {
        const { error } = await supabase
          .from('orders')
          .update({ status: 'rejected', rejection_reason: fullReason })
          .eq('id', order.id)
        if (error) throw new Error(error.message)
        await appendHistory(order.id, status, 'rejected', currentUserId, fullReason)
        onChanged({ status: 'rejected', rejection_reason: fullReason })
        onToast('info', 'Función pendiente — esta acción se completará al desplegar Fase E. Estado actualizado localmente.')
      } else {
        throw new Error(res.errorMessage ?? 'Error desconocido')
      }
      setRejectOpen(false)
      setRejectCustom('')
      await onRefresh?.()
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Error al rechazar')
    } finally {
      setBusy(false)
    }
  }

  // ─── Mark shipped ───────────────────────────────────────────────
  async function handleMarkShipped() {
    if (busy) return
    if (!shipTracking.trim()) {
      onToast('error', 'Introduce el número de seguimiento')
      return
    }
    setBusy(true)
    try {
      const tracking = shipTracking.trim()
      const carrier = shipCarrier
      const res = await invokeFn('order-mark-shipped', {
        order_id: order.id,
        tracking_number: tracking,
        tracking_carrier: carrier,
      })

      if (res.ok) {
        onToast('success', 'Pedido marcado como enviado')
      } else if (res.notImplemented) {
        const shippedAt = new Date().toISOString()
        const { error } = await supabase
          .from('orders')
          .update({
            status: 'shipped',
            shipped_at: shippedAt,
            tracking_number: tracking,
            tracking_carrier: carrier,
          })
          .eq('id', order.id)
        if (error) throw new Error(error.message)
        await appendHistory(order.id, status, 'shipped', currentUserId, `${carrier} ${tracking}`)
        onChanged({
          status: 'shipped',
          shipped_at: shippedAt,
          tracking_number: tracking,
          tracking_carrier: carrier,
        })
        onToast('info', 'Función pendiente — esta acción se completará al desplegar Fase E. Estado actualizado localmente.')
      } else {
        throw new Error(res.errorMessage ?? 'Error desconocido')
      }
      setShipOpen(false)
      setShipTracking('')
      await onRefresh?.()
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  // ─── Mark ready pickup ──────────────────────────────────────────
  async function handleMarkReady() {
    if (busy) return
    setBusy(true)
    try {
      const res = await invokeFn('order-mark-ready', { order_id: order.id })

      if (res.ok) {
        onToast('success', 'Pedido marcado como listo para recoger')
      } else if (res.notImplemented) {
        const readyAt = new Date().toISOString()
        const { error } = await supabase
          .from('orders')
          .update({ status: 'ready_pickup', ready_pickup_at: readyAt })
          .eq('id', order.id)
        if (error) throw new Error(error.message)
        await appendHistory(order.id, status, 'ready_pickup', currentUserId, null)
        onChanged({ status: 'ready_pickup', ready_pickup_at: readyAt })
        onToast('info', 'Función pendiente — esta acción se completará al desplegar Fase E. Estado actualizado localmente.')
      } else {
        throw new Error(res.errorMessage ?? 'Error desconocido')
      }
      setReadyOpen(false)
      await onRefresh?.()
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  // ─── Mark delivered (shipping → delivered or ready_pickup → delivered) ───
  // Invoca order-mark-delivered (validates source state). Fallback a UPDATE
  // directo si la edge function devuelve 404 (mismo patrón que las demás).
  async function handleMarkDelivered() {
    if (busy) return
    setBusy(true)
    try {
      const res = await invokeFn('order-mark-delivered', { order_id: order.id })

      if (res.ok) {
        onToast('success', 'Pedido marcado como entregado')
      } else if (res.notImplemented) {
        const { error } = await supabase
          .from('orders')
          .update({ status: 'delivered' })
          .eq('id', order.id)
        if (error) throw new Error(error.message)
        await appendHistory(order.id, status, 'delivered', currentUserId, null)
        onChanged({ status: 'delivered' })
        onToast('info', 'Función pendiente — esta acción se completará al desplegar Fase E. Estado actualizado localmente.')
      } else {
        throw new Error(res.errorMessage ?? 'Error desconocido')
      }
      setDeliveredOpen(false)
      await onRefresh?.()
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  // ─── Resend confirmation email ──────────────────────────────────
  async function handleResendEmail() {
    if (busy) return
    const fnName = STATUS_TO_RESEND_FUNCTION[status]
    if (!fnName) {
      onToast('info', 'No hay email asociado a este estado.')
      return
    }
    setBusy(true)
    try {
      // Las funciones send-order-* son internas (exigen x-internal-secret, que
      // el navegador no tiene). Reenviamos a través del proxy admin-resend-email,
      // que valida el JWT de admin y reenvía a la send-* correcta firmando con
      // el secreto interno. (Llamarlas directo daba 403 → non-2xx.)
      const res = await invokeFn('admin-resend-email', { order_id: order.id, fn: fnName })
      if (res.ok) {
        onToast('success', 'Email reenviado al cliente')
      } else if (res.notImplemented) {
        onToast('info', `Función "${fnName}" pendiente — se reenviará al desplegarla.`)
      } else {
        throw new Error(res.errorMessage ?? 'Error')
      }
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="space-y-2.5">
        {status === 'authorized' && (
          <>
            <Button
              variant="primary"
              size="md"
              onClick={() => setAcceptOpen(true)}
              className={clsx(
                'w-full !bg-green-500 !text-white hover:!brightness-110',
              )}
            >
              <Check size={16} aria-hidden="true" />
              Aceptar pedido
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={() => setRejectOpen(true)}
              className="w-full"
            >
              <XIcon size={16} aria-hidden="true" />
              Rechazar pedido
            </Button>
          </>
        )}

        {status === 'accepted' && order.delivery_method === 'shipping' && (
          <Button
            variant="primary"
            size="md"
            onClick={() => setShipOpen(true)}
            className="w-full"
          >
            <Truck size={16} aria-hidden="true" />
            Marcar como enviado
          </Button>
        )}

        {status === 'accepted' && order.delivery_method === 'pickup' && (
          <Button
            variant="primary"
            size="md"
            onClick={() => setReadyOpen(true)}
            className="w-full"
          >
            <Store size={16} aria-hidden="true" />
            Marcar listo para recoger
          </Button>
        )}

        {status === 'shipped' && (
          <Button
            variant="primary"
            size="md"
            onClick={() => setDeliveredOpen(true)}
            className="w-full !bg-green-500 !text-white hover:!brightness-110"
          >
            <Package size={16} aria-hidden="true" />
            Marcar entregado
          </Button>
        )}

        {status === 'ready_pickup' && (
          <Button
            variant="primary"
            size="md"
            onClick={() => setDeliveredOpen(true)}
            className="w-full !bg-green-500 !text-white hover:!brightness-110"
          >
            <Check size={16} aria-hidden="true" />
            Marcar recogido en tienda
          </Button>
        )}

        {STATUS_TO_RESEND_FUNCTION[status] && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResendEmail}
            disabled={busy}
            className="w-full"
          >
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Mail size={14} aria-hidden="true" />}
            Reenviar email confirmación
          </Button>
        )}

        {/* Acceso a devoluciones para pedidos entregados o ya devueltos. Lleva a la
            lista de devoluciones (el RMA concreto no está cargado en este componente). */}
        {(status === 'delivered' || status === 'returned') && (
          <Link
            to="/admin/devoluciones"
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-sm font-[var(--font-cond)] text-[var(--color-lavender)] hover:bg-[rgba(196,162,207,0.08)] transition-colors"
          >
            <RotateCcw size={14} aria-hidden="true" />
            Ver devoluciones
          </Link>
        )}
      </div>

      {/* ─── Accept modal ─────────────────────────────────────── */}
      <Modal open={acceptOpen} onClose={() => !busy && setAcceptOpen(false)} title="Aceptar pedido" size="md">
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)]">
            Al aceptar el pedido <strong className="text-[var(--color-cream)]">{order.order_number}</strong>, se capturará el cobro en Redsys y se enviará un email de confirmación al cliente con la factura adjunta.
          </p>
          <div>
            <label className="block text-xs font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] mb-2">
              Notas internas (opcional)
            </label>
            <textarea
              value={acceptNotes}
              onChange={e => setAcceptNotes(e.target.value)}
              rows={3}
              placeholder="Notas visibles solo en admin…"
              className="w-full text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-ink)] px-3 py-2 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors resize-y"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAcceptOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAccept}
              disabled={busy}
              className="!bg-green-500 !text-white hover:!brightness-110"
            >
              {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
              Confirmar aceptación
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Reject modal ─────────────────────────────────────── */}
      <Modal open={rejectOpen} onClose={() => !busy && setRejectOpen(false)} title="Rechazar pedido" size="md">
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)]">
            Al rechazar el pedido <strong className="text-[var(--color-cream)]">{order.order_number}</strong>, se liberará la reserva de pago en Redsys y se notificará al cliente.
          </p>
          <div>
            <label className="block text-xs font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] mb-2">
              Razón
            </label>
            <select
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              className="w-full text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-ink)] px-3 py-2 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors"
            >
              {REJECT_REASONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] mb-2">
              Detalle (opcional)
            </label>
            <textarea
              value={rejectCustom}
              onChange={e => setRejectCustom(e.target.value)}
              rows={3}
              placeholder="Información adicional para el cliente…"
              className="w-full text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-ink)] px-3 py-2 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors resize-y"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRejectOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="danger" size="sm" onClick={handleReject} disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <XIcon size={14} aria-hidden="true" />}
              Confirmar rechazo
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Ship modal ───────────────────────────────────────── */}
      <Modal open={shipOpen} onClose={() => !busy && setShipOpen(false)} title="Marcar como enviado" size="md">
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)]">
            Introduce los datos de envío. Se enviará un email al cliente con el seguimiento.
          </p>
          <div>
            <label className="block text-xs font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] mb-2">
              Transportista
            </label>
            <select
              value={shipCarrier}
              onChange={e => setShipCarrier(e.target.value)}
              className="w-full text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-ink)] px-3 py-2 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors"
            >
              {CARRIERS.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] mb-2">
              Nº seguimiento
            </label>
            <input
              type="text"
              value={shipTracking}
              onChange={e => setShipTracking(e.target.value)}
              placeholder="Ej: 1234567890"
              className="w-full text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-ink)] px-3 py-2 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShipOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={handleMarkShipped} disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Truck size={14} aria-hidden="true" />}
              Confirmar envío
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Ready pickup modal ───────────────────────────────── */}
      <Modal open={readyOpen} onClose={() => !busy && setReadyOpen(false)} title="Marcar listo para recoger" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)]">
            Se notificará al cliente que su pedido <strong className="text-[var(--color-cream)]">{order.order_number}</strong> está disponible para recoger en tienda.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setReadyOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={handleMarkReady} disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Store size={14} aria-hidden="true" />}
              Confirmar
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Delivered modal ──────────────────────────────────── */}
      <Modal open={deliveredOpen} onClose={() => !busy && setDeliveredOpen(false)} title="Marcar como entregado" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)]">
            Confirma que el pedido <strong className="text-[var(--color-cream)]">{order.order_number}</strong> ha sido entregado al cliente.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDeliveredOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleMarkDelivered}
              disabled={busy}
              className="!bg-green-500 !text-white hover:!brightness-110"
            >
              {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
              Confirmar entrega
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
