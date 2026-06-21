import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, Check, X as XIcon, Loader2, Package as PackageIcon,
  Mail, CreditCard, AlertTriangle, Truck, FileText, PackageCheck,
} from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'
import {
  ReturnStatusBadge, reasonLabel, type ReturnStatus,
} from './ReturnsList'

// ─── Tipos del contrato admin-return-get ────────────────────────────
interface ReturnRecord {
  id: string
  return_number: string
  order_id: string
  order_number: string
  customer_email: string
  status: ReturnStatus
  reason_code: string | null
  customer_note: string | null
  refund_total_cents: number
  store_pays_return: boolean | null
  credit_invoice_number: string | null
  created_at: string
  approved_at?: string | null
  received_at?: string | null
  refunded_at?: string | null
  reject_note?: string | null
}

interface ReturnItem {
  id: string
  product_name: string
  product_size_label: string | null
  quantity: number
  refund_cents: number
}

interface ReturnOrder {
  id: string
  order_number: string
  customer_first_name: string | null
  customer_last_name: string | null
  customer_email: string | null
  customer_phone: string | null
  total_cents: number
  status: string
}

interface InvokeError {
  message: string
  status?: number
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCents(cents: number) {
  return (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Invoca una edge function de devoluciones. Extrae el status HTTP de
 * error.context.status para distinguir el 502 (Redsys KO al reembolsar) y
 * el 422 (validación) que el contrato de mark-received documenta.
 */
async function invokeReturnFn<T = unknown>(
  name: string,
  body: Record<string, unknown>,
): Promise<{ data: T | null; error: InvokeError | null }> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body })
  if (!error) return { data: data ?? null, error: null }
  const ctx = (error as unknown as { context?: { status?: number } }).context
  return {
    data: null,
    error: { message: error.message ?? String(error), status: ctx?.status },
  }
}

export default function ReturnDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toasts, toast, dismiss } = useToast()

  const [ret, setRet] = useState<ReturnRecord | null>(null)
  const [items, setItems] = useState<ReturnItem[]>([])
  const [order, setOrder] = useState<ReturnOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [busy, setBusy] = useState(false)

  // Modales de acción
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [receiveOpen, setReceiveOpen] = useState(false)

  const fetchReturn = useCallback(async (silent = false) => {
    if (!id) return
    if (!silent) setLoading(true)
    try {
      const { data, error } = await invokeReturnFn<{
        return: ReturnRecord
        items: ReturnItem[]
        order: ReturnOrder
      }>('admin-return-get', { return_id: id })
      if (error || !data?.return) {
        setNotFound(true)
        return
      }
      setRet(data.return)
      setItems(data.items ?? [])
      setOrder(data.order ?? null)
    } catch (err) {
      console.error('[ReturnDetail]', err)
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchReturn() }, [fetchReturn])

  // ─── Aprobar ─────────────────────────────────────────────────────
  async function handleApprove() {
    if (busy || !ret) return
    setBusy(true)
    try {
      const { data, error } = await invokeReturnFn<{ ok: boolean; status: string; refund_total_cents: number }>(
        'admin-return-approve',
        { return_id: ret.id },
      )
      if (error || !data?.ok) throw new Error(error?.message ?? 'No se pudo aprobar la devolución')
      toast.success('Devolución aprobada. El cliente debe enviar los artículos de vuelta.')
      await fetchReturn(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al aprobar')
    } finally {
      setBusy(false)
    }
  }

  // ─── Rechazar ────────────────────────────────────────────────────
  async function handleReject() {
    if (busy || !ret) return
    setBusy(true)
    try {
      const note = rejectNote.trim()
      const { data, error } = await invokeReturnFn<{ ok: boolean }>(
        'admin-return-reject',
        { return_id: ret.id, note },
      )
      if (error || !data?.ok) throw new Error(error?.message ?? 'No se pudo rechazar la devolución')
      toast.success('Devolución rechazada y cliente notificado.')
      setRejectOpen(false)
      setRejectNote('')
      await fetchReturn(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al rechazar')
    } finally {
      setBusy(false)
    }
  }

  // ─── Marcar recibido + reembolsar (ACCIÓN CON DINERO) ────────────
  // Esto lanza el reembolso real a la tarjeta en Redsys y genera la factura
  // rectificativa. Por eso vive tras un modal de confirmación explícito y
  // maneja el 502 (Redsys KO → reintentar) y el 422 (validación) por separado.
  async function handleMarkReceived() {
    if (busy || !ret) return
    setBusy(true)
    try {
      const { data, error } = await invokeReturnFn<{
        ok: boolean
        status: string
        credit_invoice_number: string
      }>('admin-return-mark-received', { return_id: ret.id })

      if (error) {
        if (error.status === 502) {
          // Redsys rechazó el reembolso: el RMA NO queda como reembolsado.
          // El admin puede reintentar este mismo botón.
          throw new Error('El reembolso en Redsys falló. No se ha cobrado nada al cliente. Reintenta en unos minutos.')
        }
        if (error.status === 422) {
          throw new Error(error.message || 'La devolución no está en un estado válido para reembolsar.')
        }
        throw new Error(error.message || 'No se pudo completar el reembolso')
      }
      if (!data?.ok) throw new Error('No se pudo completar el reembolso')

      toast.success(`Reembolso completado. Factura de abono ${data.credit_invoice_number ?? ''} generada.`)
      setReceiveOpen(false)
      await fetchReturn(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al reembolsar')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="p-12 flex justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-[var(--color-lavender)] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (notFound || !ret) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <h1 className="text-2xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest">
          Devolución no encontrada
        </h1>
        <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)]">
          La devolución solicitada no existe o no tienes acceso.
        </p>
        <Button variant="primary" size="sm" onClick={() => navigate('/admin/devoluciones')}>
          <ArrowLeft size={14} aria-hidden="true" />
          Volver a devoluciones
        </Button>
      </div>
    )
  }

  const isFinal = ret.status === 'refunded' || ret.status === 'received' || ret.status === 'rejected'

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <Link
              to="/admin/devoluciones"
              className="inline-flex items-center gap-1.5 text-xs font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] hover:text-[var(--color-lavender)] mb-2 transition-colors"
            >
              <ArrowLeft size={13} aria-hidden="true" />
              Volver a devoluciones
            </Link>
            <h1 className="text-xl md:text-2xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest flex items-center gap-3 flex-wrap">
              Devolución {ret.return_number}
              <ReturnStatusBadge status={ret.status} size="md" />
            </h1>
            <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
              Solicitada el {formatDate(ret.created_at)} · Pedido{' '}
              <Link
                to={`/admin/pedidos/${ret.order_id}`}
                className="text-[var(--color-lavender)] hover:underline font-[var(--font-cond)] tracking-wide"
              >
                {ret.order_number}
              </Link>
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchReturn(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-[var(--font-cond)] tracking-wide text-[var(--color-cream-dim)] border border-[var(--color-card-hover)] hover:border-[var(--color-lavender)]/40 hover:text-[var(--color-cream)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refrescar datos de la devolución"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            Refrescar
          </button>
        </div>

        {/* Banner de estado final (reembolsada) */}
        {ret.status === 'refunded' && (
          <div className="bg-green-500/10 border border-green-500/40 rounded-2xl px-5 py-4 flex items-start gap-3">
            <PackageCheck size={20} className="text-green-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm font-[var(--font-body)] text-[var(--color-cream-dim)]">
              <p className="font-[var(--font-cond)] font-semibold text-green-300 mb-0.5 tracking-wide">
                Devolución reembolsada
              </p>
              <p>
                Se reembolsaron {formatCents(ret.refund_total_cents)} € a la tarjeta del cliente
                {ret.refunded_at ? ` el ${formatDate(ret.refunded_at)}` : ''}.
                {ret.credit_invoice_number && (
                  <> Factura de abono <strong className="text-[var(--color-cream)]">{ret.credit_invoice_number}</strong>.</>
                )}
              </p>
              <p className="mt-2 inline-flex items-center gap-1.5 text-[var(--color-cream-dim)]">
                <PackageIcon size={14} className="text-[var(--color-lavender)] shrink-0" aria-hidden="true" />
                Recuerda reponer el stock de estos artículos a mano en Productos.
              </p>
            </div>
          </div>
        )}

        {/* Banner devolución rechazada */}
        {ret.status === 'rejected' && (
          <div className="bg-[var(--color-brand-red)]/10 border border-[var(--color-brand-red)]/40 rounded-2xl px-5 py-4 flex items-start gap-3">
            <XIcon size={20} className="text-[var(--color-brand-red)] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm font-[var(--font-body)] text-[var(--color-cream-dim)]">
              <p className="font-[var(--font-cond)] font-semibold text-[var(--color-brand-red)] mb-0.5 tracking-wide">
                Devolución rechazada
              </p>
              {ret.reject_note && <p>Motivo: {ret.reject_note}</p>}
            </div>
          </div>
        )}

        {/* 2-col grid */}
        <div className="grid lg:grid-cols-3 gap-5">
          {/* MAIN COLUMN */}
          <div className="lg:col-span-2 space-y-5">
            {/* Datos de la devolución */}
            <Section title="Datos de la devolución">
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <Field label="Motivo">
                  <span className="text-[var(--color-cream)] font-[var(--font-body)]">
                    {reasonLabel(ret.reason_code)}
                  </span>
                </Field>
                <Field label="Importe a reembolsar">
                  <span className="text-[var(--color-cream)] font-[var(--font-cond)] font-medium">
                    {formatCents(ret.refund_total_cents)} €
                  </span>
                </Field>
                <Field label="Envío de vuelta">
                  <span className="text-[var(--color-cream)] font-[var(--font-body)]">
                    {ret.store_pays_return
                      ? 'Lo paga la tienda'
                      : 'Lo paga el cliente'}
                  </span>
                </Field>
                {ret.customer_note && (
                  <Field label="Nota del cliente" className="sm:col-span-2">
                    <span className="text-[var(--color-cream)] font-[var(--font-body)] italic">
                      {ret.customer_note}
                    </span>
                  </Field>
                )}
              </div>
            </Section>

            {/* Artículos devueltos */}
            <Section title={`Artículos devueltos (${items.length})`} icon={<PackageIcon size={15} aria-hidden="true" />}>
              {items.length === 0 ? (
                <p className="text-xs text-[var(--color-mid)] italic">Sin artículos asociados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-card-hover)]/60">
                        <th className="px-2 py-2 text-left text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)]">Producto</th>
                        <th className="px-2 py-2 text-center text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] hidden sm:table-cell">Talla</th>
                        <th className="px-2 py-2 text-center text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)]">Cant.</th>
                        <th className="px-2 py-2 text-right text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)]">Reembolso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(it => (
                        <tr key={it.id} className="border-b border-[var(--color-card-hover)]/30 last:border-0">
                          <td className="px-2 py-2.5 font-[var(--font-body)] text-[var(--color-cream)]">
                            {it.product_name}
                          </td>
                          <td className="px-2 py-2.5 text-center text-[var(--color-cream-dim)] hidden sm:table-cell">
                            {it.product_size_label ?? '—'}
                          </td>
                          <td className="px-2 py-2.5 text-center text-[var(--color-cream-dim)] font-[var(--font-cond)]">
                            {it.quantity}
                          </td>
                          <td className="px-2 py-2.5 text-right text-[var(--color-cream)] font-[var(--font-cond)] font-medium whitespace-nowrap">
                            {formatCents(it.refund_cents)} €
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="mt-4 border-t border-[var(--color-card-hover)] pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-[var(--font-cond)] tracking-wide text-[var(--color-cream)] text-base font-semibold">
                        TOTAL REEMBOLSO
                      </span>
                      <span className="font-[var(--font-cond)] tabular-nums text-[var(--color-cream)] text-lg font-semibold">
                        {formatCents(ret.refund_total_cents)} €
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </Section>

            {/* Datos del pedido original */}
            {order && (
              <Section title="Pedido original" icon={<FileText size={15} aria-hidden="true" />}>
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <Field label="Nº pedido">
                    <Link
                      to={`/admin/pedidos/${order.id}`}
                      className="text-[var(--color-lavender)] hover:underline font-[var(--font-cond)] tracking-wide"
                    >
                      {order.order_number}
                    </Link>
                  </Field>
                  <Field label="Total pedido">
                    <span className="text-[var(--color-cream)] font-[var(--font-cond)]">
                      {formatCents(order.total_cents)} €
                    </span>
                  </Field>
                  <Field label="Cliente">
                    <span className="text-[var(--color-cream)] font-[var(--font-body)]">
                      {order.customer_first_name} {order.customer_last_name}
                    </span>
                  </Field>
                  <Field label="Email">
                    {order.customer_email ? (
                      <a
                        href={`mailto:${order.customer_email}`}
                        className="inline-flex items-center gap-1.5 text-[var(--color-lavender)] hover:underline font-[var(--font-body)]"
                      >
                        <Mail size={13} aria-hidden="true" />
                        {order.customer_email}
                      </a>
                    ) : (
                      <span className="text-[var(--color-cream-dim)]">—</span>
                    )}
                  </Field>
                </div>
              </Section>
            )}
          </div>

          {/* SIDEBAR */}
          <aside className="space-y-5 lg:sticky lg:top-0 lg:self-start">
            {/* Acciones */}
            <Section title="Acciones" muted>
              {ret.status === 'requested' && (
                <div className="space-y-2.5">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={handleApprove}
                    disabled={busy}
                    className="w-full !bg-green-500 !text-white hover:!brightness-110"
                  >
                    {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                    Aprobar devolución
                  </Button>
                  <Button
                    variant="danger"
                    size="md"
                    onClick={() => setRejectOpen(true)}
                    disabled={busy}
                    className="w-full"
                  >
                    <XIcon size={16} aria-hidden="true" />
                    Rechazar devolución
                  </Button>
                  <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)] leading-relaxed pt-1">
                    Aprobar no mueve dinero: solo autoriza al cliente a enviar los
                    artículos de vuelta. El reembolso se hace al marcarlos como recibidos.
                  </p>
                </div>
              )}

              {ret.status === 'approved' && (
                <div className="space-y-3">
                  {/* Aviso de envío de vuelta */}
                  <div className="flex items-start gap-2 text-xs text-[var(--color-cream-dim)] font-[var(--font-body)] bg-[var(--color-ink)] rounded-lg px-3 py-2.5">
                    <Truck size={14} className="text-[var(--color-lavender)] shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      {ret.store_pays_return
                        ? 'La tienda paga el envío de vuelta. Asegúrate de haber enviado al cliente la etiqueta de devolución.'
                        : 'El cliente paga el envío de vuelta.'}
                    </span>
                  </div>

                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => setReceiveOpen(true)}
                    disabled={busy}
                    className="w-full !bg-green-500 !text-white hover:!brightness-110"
                  >
                    {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <CreditCard size={16} aria-hidden="true" />}
                    Marcar recibido y reembolsar
                  </Button>
                  <div className="flex items-start gap-2 text-xs text-yellow-200/90 font-[var(--font-body)] bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2.5">
                    <AlertTriangle size={14} className="text-yellow-300 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      Esto reembolsa <strong>{formatCents(ret.refund_total_cents)} €</strong> de
                      verdad a la tarjeta del cliente y genera la factura de abono. Hazlo solo
                      cuando hayas recibido y revisado los artículos.
                    </span>
                  </div>
                </div>
              )}

              {isFinal && ret.status !== 'rejected' && (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-[var(--color-cream)] font-[var(--font-cond)] tracking-wide">
                    <PackageCheck size={16} className="text-green-400 shrink-0" aria-hidden="true" />
                    {ret.status === 'refunded' ? 'Reembolso completado' : 'Artículos recibidos'}
                  </div>
                  {ret.credit_invoice_number && (
                    <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)]">
                      Factura de abono:{' '}
                      <span className="text-[var(--color-cream-dim)] font-[var(--font-cond)]">
                        {ret.credit_invoice_number}
                      </span>
                    </p>
                  )}
                </div>
              )}

              {ret.status === 'rejected' && (
                <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)]">
                  Esta devolución fue rechazada. No hay más acciones disponibles.
                </p>
              )}
            </Section>

            {/* Reembolso / factura */}
            <Section title="Reembolso" muted icon={<CreditCard size={15} aria-hidden="true" />}>
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide uppercase">Importe</dt>
                  <dd className="text-[var(--color-cream)] font-[var(--font-cond)]">
                    {formatCents(ret.refund_total_cents)} €
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide uppercase">Envío vuelta</dt>
                  <dd className="text-[var(--color-cream-dim)] font-[var(--font-body)]">
                    {ret.store_pays_return ? 'Tienda' : 'Cliente'}
                  </dd>
                </div>
                {ret.approved_at && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide uppercase">Aprobada</dt>
                    <dd className="text-[var(--color-cream-dim)] font-[var(--font-body)]">{formatDate(ret.approved_at)}</dd>
                  </div>
                )}
                {ret.refunded_at && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide uppercase">Reembolsada</dt>
                    <dd className="text-[var(--color-cream-dim)] font-[var(--font-body)]">{formatDate(ret.refunded_at)}</dd>
                  </div>
                )}
                {ret.credit_invoice_number && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide uppercase">Factura abono</dt>
                    <dd className="text-[var(--color-cream-dim)] font-[var(--font-body)] font-mono">{ret.credit_invoice_number}</dd>
                  </div>
                )}
              </dl>
            </Section>
          </aside>
        </div>
      </div>

      {/* ─── Modal: rechazar ──────────────────────────────────────── */}
      <Modal open={rejectOpen} onClose={() => !busy && setRejectOpen(false)} title="Rechazar devolución" size="md">
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)]">
            Al rechazar la devolución <strong className="text-[var(--color-cream)]">{ret.return_number}</strong>,
            se notificará al cliente con el motivo. No se moverá dinero.
          </p>
          <div>
            <label className="block text-xs font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] mb-2">
              Motivo del rechazo
            </label>
            <textarea
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              rows={3}
              placeholder="Explica al cliente por qué se rechaza…"
              className="w-full text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-ink)] px-3 py-2 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors resize-y"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRejectOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="danger" size="sm" onClick={handleReject} disabled={busy || !rejectNote.trim()}>
              {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <XIcon size={14} aria-hidden="true" />}
              Confirmar rechazo
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Modal: marcar recibido y reembolsar (DINERO REAL) ────── */}
      <Modal open={receiveOpen} onClose={() => !busy && setReceiveOpen(false)} title="Reembolsar al cliente" size="md">
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3">
            <AlertTriangle size={20} className="text-yellow-300 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)] leading-relaxed">
              Vas a reembolsar <strong className="text-[var(--color-cream)]">{formatCents(ret.refund_total_cents)} €</strong> a
              la tarjeta del cliente <strong className="text-[var(--color-cream)]">de forma inmediata e irreversible</strong> a
              través de Redsys, y se generará la factura rectificativa (de abono).
            </p>
          </div>
          <p className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)]">
            Confirma solo si ya has recibido los artículos de la devolución{' '}
            <strong className="text-[var(--color-cream)]">{ret.return_number}</strong> y están en condiciones.
          </p>
          <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)]">
            Si Redsys rechaza el reembolso no se cobrará nada y podrás reintentarlo.
            El stock de los artículos lo repones a mano en Productos.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setReceiveOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleMarkReceived}
              disabled={busy}
              className="!bg-green-500 !text-white hover:!brightness-110"
            >
              {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <CreditCard size={14} aria-hidden="true" />}
              {busy ? 'Reembolsando…' : 'Sí, reembolsar ahora'}
            </Button>
          </div>
        </div>
      </Modal>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────

interface SectionProps {
  title: string
  icon?: React.ReactNode
  muted?: boolean
  children: React.ReactNode
}

function Section({ title, icon, muted, children }: SectionProps) {
  return (
    <section className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl overflow-hidden">
      <header className="px-5 py-3.5 border-b border-[var(--color-card-hover)]/60 flex items-center gap-2">
        {icon && <span className="text-[var(--color-lavender)]">{icon}</span>}
        <h3
          className={clsx(
            'font-[var(--font-cond)] font-semibold tracking-wide text-sm',
            muted ? 'text-[var(--color-cream-dim)]' : 'text-[var(--color-cream)]',
          )}
        >
          {title}
        </h3>
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

interface FieldProps {
  label: string
  children: React.ReactNode
  className?: string
}

function Field({ label, children, className }: FieldProps) {
  return (
    <div className={className}>
      <p className="text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] mb-1">
        {label}
      </p>
      {children}
    </div>
  )
}
