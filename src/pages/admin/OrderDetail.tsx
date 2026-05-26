import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Mail, Phone, FileText, Download, Save, Loader2, Package as PackageIcon, Store, MapPin, Receipt, Trash2, History, XCircle, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'
import { OrderStatusBadge, ORDER_STATUS_META, type OrderStatus } from '@/components/admin/OrderStatusBadge'
import { OrderActionsBar } from '@/components/admin/OrderActionsBar'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'
import { useSchedule } from '@/hooks/useSchedule'
import { useAuth } from '@/hooks/useAuth'
import type { Database } from '@/lib/database.types'

type Order = Database['public']['Tables']['orders']['Row']
type OrderItem = Database['public']['Tables']['order_items']['Row']
type StatusHistoryRow = Database['public']['Tables']['order_status_history']['Row']
type Invoice = Database['public']['Tables']['invoices']['Row']
type ProductImage = Database['public']['Tables']['product_images']['Row']

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

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toasts, toast, dismiss } = useToast()
  const { schedule } = useSchedule()
  const { user } = useAuth()

  const [order, setOrder] = useState<Order | null>(null)
  const [items, setItems] = useState<OrderItem[]>([])
  const [history, setHistory] = useState<StatusHistoryRow[]>([])
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [actorEmails, setActorEmails] = useState<Record<string, string>>({})
  const [productImages, setProductImages] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Notes editing
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  // Invoice download
  const [downloadingInvoice, setDownloadingInvoice] = useState(false)

  // Delete order modal
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)

  const fetchAll = useCallback(async (silent = false) => {
    if (!id) return
    if (!silent) setLoading(true)

    // 1) Order
    const { data: orderRow, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (orderErr || !orderRow) {
      setNotFound(true)
      setLoading(false)
      return
    }
    const ord = orderRow as Order
    setOrder(ord)
    setNotes(ord.notes_internal ?? '')

    // 2) Items
    const { data: itemsData } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', id)
    setItems((itemsData as OrderItem[]) ?? [])

    // 3) History
    const { data: histData } = await supabase
      .from('order_status_history')
      .select('*')
      .eq('order_id', id)
      .order('created_at', { ascending: true })
    const histRows = (histData as StatusHistoryRow[]) ?? []
    setHistory(histRows)

    // 4) Invoice (si existe)
    const { data: invData } = await supabase
      .from('invoices')
      .select('*')
      .eq('order_id', id)
      .maybeSingle()
    setInvoice((invData as Invoice) ?? null)

    // 5) Actor emails (auth.users)
    const actorIds = Array.from(
      new Set(histRows.map(h => h.changed_by).filter((x): x is string => !!x)),
    )
    if (actorIds.length > 0) {
      // auth.users no es accesible vía PostgREST público. Si en el proyecto hay
      // una vista pública (p. ej. `admin_users`), se podría usar aquí. Como
      // fallback, marcamos los UUIDs sin email.
      // Intentamos `admin_users` (best effort) y si falla, dejamos vacío.
      try {
        const builder = supabase.from('admin_users' as unknown as keyof Database['public']['Tables']) as unknown as {
          select: (cols: string) => {
            in: (col: string, vals: string[]) => Promise<{ data: Array<{ id: string; email: string }> | null; error: { message: string } | null }>
          }
        }
        const res = await builder.select('id,email').in('id', actorIds)
        if (res.data) {
          const map: Record<string, string> = {}
          for (const row of res.data) map[row.id] = row.email
          setActorEmails(map)
        }
      } catch {
        // Sin acceso a la vista — dejamos vacío.
      }
    }

    // 6) Product images (para items con product_id válido)
    const prodIds = Array.from(
      new Set(
        ((itemsData as OrderItem[] | null) ?? [])
          .map(it => it.product_id)
          .filter((x): x is string => !!x),
      ),
    )
    if (prodIds.length > 0) {
      const { data: imgsData } = await supabase
        .from('product_images')
        .select('*')
        .in('product_id', prodIds)
        .order('sort_order')
      const imgs = (imgsData as ProductImage[]) ?? []
      const map: Record<string, string> = {}
      for (const img of imgs) {
        if (map[img.product_id]) continue
        const { data } = supabase.storage.from('product-images').getPublicUrl(img.storage_path)
        map[img.product_id] = data.publicUrl
      }
      setProductImages(map)
    }

    setLoading(false)
  }, [id])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleSaveNotes = async () => {
    if (!order || savingNotes) return
    setSavingNotes(true)
    try {
      const { error } = await supabase
        .from('orders')
        .update({ notes_internal: notes })
        .eq('id', order.id)
      if (error) throw new Error(error.message)
      setOrder({ ...order, notes_internal: notes })
      toast.success('Notas guardadas')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSavingNotes(false)
    }
  }

  const handleOrderChanged = useCallback((patch: Partial<Order>) => {
    setOrder(prev => (prev ? { ...prev, ...patch } : prev))
    // Refrescar timeline (insertamos historial localmente vía refetch ligero)
    if (id) {
      supabase
        .from('order_status_history')
        .select('*')
        .eq('order_id', id)
        .order('created_at', { ascending: true })
        .then(({ data }) => setHistory((data as StatusHistoryRow[]) ?? []))
    }
  }, [id])

  const handleDeleteOrder = async () => {
    if (!order || deleting) return
    setDeleting(true)
    try {
      const trimmed = deleteReason.trim()
      const { data, error } = await supabase.functions.invoke('order-delete', {
        body: { order_id: order.id, ...(trimmed ? { reason: trimmed } : {}) },
      })
      if (error) throw new Error(error.message)
      if (!data?.ok) throw new Error(data?.error ?? 'No se pudo eliminar el pedido')
      toast.success('Pedido eliminado')
      setDeleteOpen(false)
      navigate('/admin/pedidos')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setDeleting(false)
    }
  }

  const handleDownloadInvoice = async () => {
    if (!invoice || downloadingInvoice) return
    setDownloadingInvoice(true)
    try {
      const { data, error } = await supabase.storage
        .from('invoices')
        .createSignedUrl(invoice.pdf_storage_path, 3600)
      if (error || !data?.signedUrl) throw new Error(error?.message ?? 'No se pudo generar el enlace')
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al descargar')
    } finally {
      setDownloadingInvoice(false)
    }
  }

  if (loading) {
    return (
      <div className="p-12 flex justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-[var(--color-lavender)] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (notFound || !order) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <h1 className="text-2xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest">
          Pedido no encontrado
        </h1>
        <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)]">
          El pedido solicitado no existe o ha sido eliminado.
        </p>
        <Button variant="primary" size="sm" onClick={() => navigate('/admin/pedidos')}>
          <ArrowLeft size={14} />
          Volver a pedidos
        </Button>
      </div>
    )
  }

  const status = order.status as OrderStatus
  const baseCents = Math.round(order.subtotal_cents / (1 + order.tax_rate / 100))
  const taxCents = order.subtotal_cents - baseCents

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <Link
              to="/admin/pedidos"
              className="inline-flex items-center gap-1.5 text-xs font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] hover:text-[var(--color-lavender)] mb-2 transition-colors"
            >
              <ArrowLeft size={13} />
              Volver a pedidos
            </Link>
            <h1 className="text-2xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest flex items-center gap-3 flex-wrap">
              Pedido {order.order_number}
              <OrderStatusBadge status={status} size="md" />
            </h1>
            <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
              Creado el {formatDate(order.created_at)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchAll(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-[var(--font-cond)] tracking-wide text-[var(--color-cream-dim)] border border-[var(--color-card-hover)] hover:border-[var(--color-lavender)]/40 hover:text-[var(--color-cream)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refrescar datos del pedido"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refrescar
          </button>
        </div>

        {/* Banners de cambios del cliente */}
        {order.cancelled_by_customer && (
          <div className="bg-red-900/15 border border-red-700/40 rounded-2xl px-5 py-4 flex items-start gap-3">
            <XCircle size={20} className="text-red-300 shrink-0 mt-0.5" />
            <div className="text-sm font-[var(--font-body)] text-[var(--color-cream-dim)]">
              <p className="font-[var(--font-cond)] font-semibold text-red-200 mb-0.5 tracking-wide">
                El cliente canceló este pedido
              </p>
              <p>
                {(() => {
                  const iso = order.payment_cancelled_at ?? order.client_modified_at ?? order.updated_at
                  return iso ? `Fecha de cancelación: ${formatDate(iso)}` : 'Cancelación registrada.'
                })()}
              </p>
            </div>
          </div>
        )}
        {order.client_modified_at && !order.cancelled_by_customer && (
          <div className="bg-orange-500/10 border border-orange-500/40 rounded-2xl px-5 py-4 flex items-start gap-3">
            <History size={20} className="text-orange-300 shrink-0 mt-0.5" />
            <div className="text-sm font-[var(--font-body)] text-[var(--color-cream-dim)]">
              <p className="font-[var(--font-cond)] font-semibold text-orange-200 mb-0.5 tracking-wide">
                Este pedido fue modificado por el cliente
              </p>
              <p>
                Fecha de modificación: {formatDate(order.client_modified_at)}. Revisa los datos
                de envío antes de continuar con la preparación.
              </p>
            </div>
          </div>
        )}

        {/* 2-col grid */}
        <div className="grid lg:grid-cols-3 gap-5">
          {/* MAIN COLUMN */}
          <div className="lg:col-span-2 space-y-5">
            {/* Cliente */}
            <Section title="Datos del cliente">
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <Field label="Nombre">
                  <span className="text-[var(--color-cream)] font-[var(--font-body)]">
                    {order.customer_first_name} {order.customer_last_name}
                  </span>
                </Field>
                <Field label="Email">
                  <a
                    href={`mailto:${order.customer_email}`}
                    className="inline-flex items-center gap-1.5 text-[var(--color-lavender)] hover:underline font-[var(--font-body)]"
                  >
                    <Mail size={13} />
                    {order.customer_email}
                  </a>
                </Field>
                <Field label="Teléfono">
                  <a
                    href={`tel:${order.customer_phone}`}
                    className="inline-flex items-center gap-1.5 text-[var(--color-lavender)] hover:underline font-[var(--font-body)]"
                  >
                    <Phone size={13} />
                    {order.customer_phone}
                  </a>
                </Field>
                <Field label="Marketing">
                  <span className="text-[var(--color-cream-dim)] font-[var(--font-body)]">
                    {order.marketing_opt_in ? 'Sí' : 'No'}
                  </span>
                </Field>
              </div>
            </Section>

            {/* Entrega */}
            <Section
              title={order.delivery_method === 'shipping' ? 'Dirección de envío' : 'Recogida en tienda'}
              icon={order.delivery_method === 'shipping' ? <MapPin size={15} /> : <Store size={15} />}
            >
              {order.delivery_method === 'shipping' ? (
                <div className="text-sm text-[var(--color-cream)] font-[var(--font-body)] space-y-1">
                  <p>{order.shipping_address}</p>
                  <p>
                    {order.shipping_postal_code} {order.shipping_city}
                    {order.shipping_province && `, ${order.shipping_province}`}
                  </p>
                  {order.shipping_notes && (
                    <p className="text-xs text-[var(--color-mid)] mt-2 italic">
                      Notas: {order.shipping_notes}
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)] space-y-2">
                  <p>El cliente recogerá el pedido en tienda.</p>
                  <div className="bg-[var(--color-ink)] rounded-lg p-3 space-y-1">
                    <p className="text-xs font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] mb-1.5">
                      Horario tienda
                    </p>
                    {schedule.map(d => (
                      <p key={d.label} className="text-xs flex justify-between gap-3">
                        <span className="text-[var(--color-cream-dim)]">{d.label}</span>
                        <span className="text-[var(--color-mid)]">
                          {d.morning && d.afternoon
                            ? `${d.morning} · ${d.afternoon}`
                            : d.morning ?? d.afternoon ?? 'Cerrado'}
                        </span>
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            {/* Facturación B2B */}
            {order.needs_invoice && (
              <Section title="Facturación B2B" icon={<Receipt size={15} />}>
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <Field label="Razón social">
                    <span className="text-[var(--color-cream)] font-[var(--font-body)]">
                      {order.invoice_business_name ?? '—'}
                    </span>
                  </Field>
                  <Field label="CIF">
                    <span className="text-[var(--color-cream)] font-[var(--font-body)]">
                      {order.invoice_cif ?? '—'}
                    </span>
                  </Field>
                  <Field label="Dirección fiscal" className="sm:col-span-2">
                    <span className="text-[var(--color-cream)] font-[var(--font-body)]">
                      {order.invoice_address ?? '—'}
                    </span>
                  </Field>
                </div>
              </Section>
            )}

            {/* Items */}
            <Section title={`Artículos (${items.length})`} icon={<PackageIcon size={15} />}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-card-hover)]/60">
                      <th className="px-2 py-2 text-left text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)]"></th>
                      <th className="px-2 py-2 text-left text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)]">Producto</th>
                      <th className="px-2 py-2 text-center text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] hidden sm:table-cell">Talla</th>
                      <th className="px-2 py-2 text-center text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)]">Cant.</th>
                      <th className="px-2 py-2 text-right text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] hidden sm:table-cell">PVP</th>
                      <th className="px-2 py-2 text-right text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)]">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(it => (
                      <tr key={it.id} className="border-b border-[var(--color-card-hover)]/30 last:border-0">
                        <td className="px-2 py-2.5">
                          <div className="w-12 h-12 rounded-lg bg-[var(--color-ink)] overflow-hidden flex items-center justify-center">
                            {it.product_id && productImages[it.product_id] ? (
                              <img
                                src={productImages[it.product_id]}
                                alt={it.product_name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <PackageIcon size={16} className="text-[var(--color-mid)]" />
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2.5 font-[var(--font-body)] text-[var(--color-cream)]">
                          {it.product_name}
                          {it.product_sku && (
                            <p className="text-[11px] text-[var(--color-mid)] mt-0.5">SKU: {it.product_sku}</p>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-center text-[var(--color-cream-dim)] hidden sm:table-cell">
                          {it.product_size_label ?? '—'}
                        </td>
                        <td className="px-2 py-2.5 text-center text-[var(--color-cream-dim)] font-[var(--font-cond)]">
                          {it.quantity}
                        </td>
                        <td className="px-2 py-2.5 text-right text-[var(--color-cream-dim)] font-[var(--font-cond)] hidden sm:table-cell whitespace-nowrap">
                          {formatCents(it.unit_price_cents)} €
                        </td>
                        <td className="px-2 py-2.5 text-right text-[var(--color-cream)] font-[var(--font-cond)] font-medium whitespace-nowrap">
                          {formatCents(it.line_total_cents)} €
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="mt-4 border-t border-[var(--color-card-hover)] pt-4 space-y-1.5 text-sm">
                <Row label="Base imponible" value={`${formatCents(baseCents)} €`} muted />
                <Row label={`IVA (${order.tax_rate}%)`} value={`${formatCents(taxCents)} €`} muted />
                <Row label="Subtotal" value={`${formatCents(order.subtotal_cents)} €`} muted />
                <Row
                  label={order.shipping_cents === 0 ? 'Envío (gratis)' : 'Envío'}
                  value={`${formatCents(order.shipping_cents)} €`}
                  muted
                />
                <div className="border-t border-[var(--color-card-hover)]/60 pt-2 mt-2">
                  <Row
                    label="TOTAL"
                    value={`${formatCents(order.total_cents)} €`}
                    big
                  />
                </div>
              </div>
            </Section>
          </div>

          {/* SIDEBAR */}
          <aside className="space-y-5 lg:sticky lg:top-0 lg:self-start">
            {/* Actions */}
            <Section title="Acciones" muted>
              <OrderActionsBar
                order={order}
                currentUserId={user?.id ?? null}
                onChanged={handleOrderChanged}
                onRefresh={() => fetchAll(true)}
                onToast={(type, msg) => {
                  if (type === 'success') toast.success(msg)
                  else if (type === 'error') toast.error(msg)
                  else toast.info(msg)
                }}
              />
              {(order.status === 'pending' || order.status === 'payment_failed') && (
                <div className="mt-3 pt-3 border-t border-[var(--color-card-hover)]/60">
                  <button
                    type="button"
                    onClick={() => setDeleteOpen(true)}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-[var(--font-cond)] font-medium tracking-wide text-red-300/80 border border-red-700/30 bg-red-900/10 hover:bg-red-900/20 hover:text-red-300 hover:border-red-700/50 transition-colors"
                  >
                    <Trash2 size={13} />
                    Eliminar pedido
                  </button>
                </div>
              )}
            </Section>

            {/* Timeline */}
            <Section title="Historial" muted>
              {history.length === 0 ? (
                <p className="text-xs text-[var(--color-mid)] italic">Sin cambios registrados.</p>
              ) : (
                <ol className="space-y-3">
                  {history.map(h => {
                    const meta = ORDER_STATUS_META[h.to_status as OrderStatus]
                    const actor = h.changed_by
                      ? actorEmails[h.changed_by] ?? `Admin (${h.changed_by.slice(0, 6)}…)`
                      : 'Sistema'
                    return (
                      <li key={h.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="w-2 h-2 rounded-full bg-[var(--color-lavender)] mt-1.5" />
                          <div className="w-px flex-1 bg-[var(--color-card-hover)] mt-1" />
                        </div>
                        <div className="flex-1 pb-1">
                          <p className="text-sm font-[var(--font-cond)] text-[var(--color-cream)] tracking-wide">
                            {meta?.label ?? h.to_status}
                          </p>
                          <p className="text-[11px] text-[var(--color-mid)] font-[var(--font-body)]">
                            {formatDate(h.created_at)} · {actor}
                          </p>
                          {h.reason && (
                            <p className="text-xs text-[var(--color-cream-dim)] mt-1 italic">
                              {h.reason}
                            </p>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </Section>

            {/* Internal notes */}
            <Section title="Notas internas" muted>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={4}
                placeholder="Solo visibles para el admin…"
                className="w-full text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-ink)] px-3 py-2 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors resize-y"
              />
              <div className="mt-2 flex justify-end">
                <Button variant="secondary" size="sm" onClick={handleSaveNotes} disabled={savingNotes}>
                  {savingNotes ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  Guardar notas
                </Button>
              </div>
            </Section>

            {/* Invoice */}
            {invoice && (
              <Section title="Factura" muted icon={<FileText size={15} />}>
                <p className="text-sm font-[var(--font-cond)] text-[var(--color-cream)] tracking-wide">
                  {invoice.invoice_number}
                </p>
                <p className="text-[11px] text-[var(--color-mid)] mb-3">
                  {invoice.invoice_type === 'b2b' ? 'B2B' : 'B2C'} · {formatDate(invoice.issued_at)}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDownloadInvoice}
                  disabled={downloadingInvoice}
                  className="w-full"
                >
                  {downloadingInvoice ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  Descargar PDF
                </Button>
              </Section>
            )}

            {/* Pago */}
            <Section title="Pago" muted>
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide uppercase">Método</dt>
                  <dd className="text-[var(--color-cream-dim)] font-[var(--font-body)]">
                    {order.payment_method === 'card' ? 'Tarjeta' : order.payment_method === 'bizum' ? 'Bizum' : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide uppercase">Proveedor</dt>
                  <dd className="text-[var(--color-cream-dim)] font-[var(--font-body)] uppercase">
                    {order.payment_provider ?? '—'}
                  </dd>
                </div>
                {order.payment_pre_auth_id && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide uppercase">Pre-auth ID</dt>
                    <dd className="text-[var(--color-cream-dim)] font-[var(--font-body)] font-mono">
                      {order.payment_pre_auth_id}
                    </dd>
                  </div>
                )}
                {order.payment_pre_auth_at && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide uppercase">Pre-auth</dt>
                    <dd className="text-[var(--color-cream-dim)] font-[var(--font-body)]">
                      {formatDate(order.payment_pre_auth_at)}
                    </dd>
                  </div>
                )}
                {order.payment_captured_at && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide uppercase">Capturado</dt>
                    <dd className="text-[var(--color-cream-dim)] font-[var(--font-body)]">
                      {formatDate(order.payment_captured_at)}
                    </dd>
                  </div>
                )}
                {order.payment_cancelled_at && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide uppercase">Cancelado</dt>
                    <dd className="text-[var(--color-cream-dim)] font-[var(--font-body)]">
                      {formatDate(order.payment_cancelled_at)}
                    </dd>
                  </div>
                )}
              </dl>
            </Section>
          </aside>
        </div>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => { if (!deleting) { setDeleteOpen(false); setDeleteReason('') } }}
        title="¿Eliminar este pedido?"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)] leading-relaxed">
            Esta acción ocultará el pedido de la lista. Los datos quedan en BD para auditoría pero no se mostrarán. Solo se permite para pedidos pendientes de pago o con pago fallido.
          </p>
          <div>
            <label className="text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] mb-1 block">
              Razón (opcional)
            </label>
            <textarea
              value={deleteReason}
              onChange={e => setDeleteReason(e.target.value)}
              rows={3}
              placeholder="Motivo del borrado…"
              className="w-full text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-ink)] px-3 py-2 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors resize-y"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setDeleteOpen(false); setDeleteReason('') }}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDeleteOrder}
              disabled={deleting}
            >
              {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              Sí, eliminar
            </Button>
          </div>
        </div>
      </Modal>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────

interface SectionProps {
  title: string
  icon?: React.ReactNode
  muted?: boolean
  children: React.ReactNode
}

function Section({ title, icon, muted, children }: SectionProps) {
  return (
    <section
      className={clsx(
        'bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl overflow-hidden',
      )}
    >
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

interface RowProps {
  label: string
  value: string
  muted?: boolean
  big?: boolean
}

function Row({ label, value, muted, big }: RowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        className={clsx(
          'font-[var(--font-cond)] tracking-wide',
          big ? 'text-[var(--color-cream)] text-base font-semibold' : muted ? 'text-[var(--color-mid)] text-xs uppercase' : 'text-[var(--color-cream-dim)] text-sm',
        )}
      >
        {label}
      </span>
      <span
        className={clsx(
          'font-[var(--font-cond)] tabular-nums',
          big ? 'text-[var(--color-cream)] text-lg font-semibold' : 'text-[var(--color-cream)] text-sm',
        )}
      >
        {value}
      </span>
    </div>
  )
}
