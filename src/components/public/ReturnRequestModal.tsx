import { useEffect, useMemo, useState } from 'react'
import { Bike, Loader2, RotateCcw, CheckCircle2, Mail, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

// Motivos de devolución que acepta el backend, traducidos al español.
export const RETURN_REASONS = [
  { value: 'wrong_size', label: 'Talla incorrecta' },
  { value: 'not_liked', label: 'No me convence' },
  { value: 'defective', label: 'Producto defectuoso' },
  { value: 'damaged', label: 'Llegó dañado' },
  { value: 'wrong_item', label: 'Me enviaron otro producto' },
  { value: 'other', label: 'Otro' },
] as const

type ReasonCode = (typeof RETURN_REASONS)[number]['value']

export interface EligibleReturnItem {
  order_item_id: string
  product_name: string
  product_size_label: string | null
  image_url: string | null
  max_qty: number
  unit_price_cents: number
}

interface ReturnRequestModalProps {
  open: boolean
  onClose: () => void
  /** Token de la sesión magic-link del cliente. */
  token: string
  orderId: string
  /** Plazo de devolución (ISO) que devuelve customer-return-eligibility. */
  deadline?: string | null
  items: EligibleReturnItem[]
  /** Notifica al padre cuando la devolución se ha creado con éxito. */
  onSuccess?: (returnNumber: string) => void
}

// Estado de cada línea seleccionable: si está marcada y cuánta cantidad.
interface ItemSelection {
  checked: boolean
  quantity: number
}

interface RequestResponse {
  ok: boolean
  return_number?: string
  error?: string
}

function fmtEuros(cents: number) {
  return (cents / 100).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDeadline(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

type Phase = 'idle' | 'loading' | 'success' | 'error'

export function ReturnRequestModal({
  open,
  onClose,
  token,
  orderId,
  deadline,
  items,
  onSuccess,
}: ReturnRequestModalProps) {
  const [selections, setSelections] = useState<Record<string, ItemSelection>>({})
  const [reasonCode, setReasonCode] = useState<ReasonCode | ''>('')
  const [reasonText, setReasonText] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [returnNumber, setReturnNumber] = useState<string | null>(null)

  // Reinicia el formulario cada vez que se abre con un set de items nuevo.
  useEffect(() => {
    if (!open) return
    const initial: Record<string, ItemSelection> = {}
    for (const it of items) {
      initial[it.order_item_id] = { checked: false, quantity: 1 }
    }
    setSelections(initial)
    setReasonCode('')
    setReasonText('')
    setPhase('idle')
    setErrorMsg(null)
    setReturnNumber(null)
  }, [open, items])

  const submitting = phase === 'loading'

  const selectedCount = useMemo(
    () => Object.values(selections).filter((s) => s.checked && s.quantity > 0).length,
    [selections],
  )

  const canSubmit = selectedCount > 0 && reasonCode !== '' && !submitting

  const toggleItem = (id: string) => {
    setSelections((prev) => ({
      ...prev,
      [id]: { ...prev[id], checked: !prev[id]?.checked },
    }))
  }

  const setQuantity = (id: string, quantity: number) => {
    setSelections((prev) => ({
      ...prev,
      [id]: { ...prev[id], quantity },
    }))
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setPhase('loading')
    setErrorMsg(null)

    const payloadItems = items
      .filter((it) => selections[it.order_item_id]?.checked && selections[it.order_item_id].quantity > 0)
      .map((it) => ({
        order_item_id: it.order_item_id,
        quantity: selections[it.order_item_id].quantity,
      }))

    try {
      const { data, error: fnError } = await supabase.functions.invoke<RequestResponse>(
        'customer-return-request',
        {
          body: {
            token,
            order_id: orderId,
            items: payloadItems,
            reason_code: reasonCode,
            ...(reasonText.trim() ? { reason_text: reasonText.trim() } : {}),
          },
        },
      )

      if (fnError) {
        const ctx = (fnError as unknown as { context?: Response & { status?: number } }).context
        // 422 = no elegible: el mensaje útil viene en el cuerpo JSON de la Response.
        let detail = fnError.message
        if (ctx && typeof ctx.json === 'function') {
          try {
            const b = (await ctx.json()) as { error?: string }
            if (b?.error) detail = b.error
          } catch {
            /* ignore */
          }
        }
        setErrorMsg(detail || 'No se pudo registrar la devolución')
        setPhase('error')
        return
      }

      if (!data?.ok) {
        setErrorMsg(data?.error ?? 'No se pudo registrar la devolución')
        setPhase('error')
        return
      }

      setReturnNumber(data.return_number ?? null)
      setPhase('success')
      if (data.return_number) onSuccess?.(data.return_number)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al registrar la devolución')
      setPhase('error')
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!submitting) onClose()
      }}
      title={phase === 'success' ? 'Devolución registrada' : 'Solicitar devolución'}
      size="lg"
    >
      {phase === 'success' ? (
        <div className="space-y-5 text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-[rgba(74,222,128,0.12)] text-green-300 flex items-center justify-center">
            <CheckCircle2 size={28} aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <p className="font-[var(--font-cond)] text-lg font-semibold text-[var(--color-cream)]">
              Hemos recibido tu solicitud
            </p>
            {returnNumber && (
              <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)]">
                Número de devolución:{' '}
                <span className="font-mono text-[var(--color-lavender)]">{returnNumber}</span>
              </p>
            )}
          </div>
          <div className="bg-[var(--color-ink)] border border-[var(--color-card-hover)] rounded-xl p-4 text-left space-y-2.5">
            <p className="inline-flex items-start gap-2 text-sm text-[var(--color-cream-dim)] font-[var(--font-body)] leading-relaxed">
              <Mail size={15} className="text-[var(--color-lavender)] mt-0.5 shrink-0" aria-hidden="true" />
              Te avisaremos por email con las instrucciones para enviarnos el producto.
            </p>
            <p className="inline-flex items-start gap-2 text-sm text-[var(--color-cream-dim)] font-[var(--font-body)] leading-relaxed">
              <ShieldCheck size={15} className="text-[var(--color-lavender)] mt-0.5 shrink-0" aria-hidden="true" />
              El reembolso se hará a tu tarjeta <strong className="text-[var(--color-cream)]">cuando la
              tienda reciba el producto</strong> y verifique su estado.
            </p>
          </div>
          <div className="flex justify-end pt-1">
            <Button variant="primary" size="sm" type="button" onClick={onClose}>
              Entendido
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Aviso de plazo y condiciones de reembolso */}
          <div className="bg-[rgba(196,162,207,0.08)] border border-[var(--color-lavender)]/25 rounded-xl p-4 space-y-2">
            <p className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)] leading-relaxed">
              Dispones de <strong className="text-[var(--color-cream)]">15 días desde la entrega</strong>{' '}
              para solicitar la devolución
              {deadline ? ` (hasta el ${formatDeadline(deadline)})` : ''}.
            </p>
            <p className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)] leading-relaxed">
              El reembolso se realizará a tu tarjeta{' '}
              <strong className="text-[var(--color-cream)]">cuando la tienda reciba el producto</strong> y
              compruebe su estado.
            </p>
          </div>

          {/* Selección de artículos */}
          <div>
            <h3 className="text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] mb-3">
              ¿Qué quieres devolver?
            </h3>
            <ul className="space-y-2">
              {items.map((item) => {
                const sel = selections[item.order_item_id] ?? { checked: false, quantity: 1 }
                const qtyOptions = Array.from({ length: item.max_qty }, (_, i) => i + 1)
                return (
                  <li
                    key={item.order_item_id}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                      sel.checked
                        ? 'border-[var(--color-lavender)]/50 bg-[rgba(196,162,207,0.06)]'
                        : 'border-[var(--color-card-hover)] hover:border-[var(--color-mid)]/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      id={`return-item-${item.order_item_id}`}
                      checked={sel.checked}
                      onChange={() => toggleItem(item.order_item_id)}
                      className="w-4 h-4 shrink-0 accent-[var(--color-lavender)] cursor-pointer"
                    />
                    <label
                      htmlFor={`return-item-${item.order_item_id}`}
                      className="w-12 h-12 bg-[var(--color-ink)] rounded-lg overflow-hidden flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.product_name}
                          className="w-full h-full object-contain p-0.5"
                          loading="lazy"
                        />
                      ) : (
                        <Bike size={16} strokeWidth={1} className="text-[var(--color-mid)]" aria-hidden="true" />
                      )}
                    </label>
                    <label
                      htmlFor={`return-item-${item.order_item_id}`}
                      className="flex-1 min-w-0 cursor-pointer"
                    >
                      <p className="font-[var(--font-cond)] text-sm font-semibold text-[var(--color-cream)] line-clamp-2">
                        {item.product_name}
                      </p>
                      <p className="text-[11px] text-[var(--color-mid)]">
                        {item.product_size_label ? `Talla ${item.product_size_label} · ` : ''}
                        {fmtEuros(item.unit_price_cents)} €
                      </p>
                    </label>
                    <div className="shrink-0">
                      <label
                        htmlFor={`return-qty-${item.order_item_id}`}
                        className="sr-only"
                      >
                        Cantidad a devolver de {item.product_name}
                      </label>
                      <select
                        id={`return-qty-${item.order_item_id}`}
                        value={sel.quantity}
                        disabled={!sel.checked}
                        onChange={(e) => setQuantity(item.order_item_id, Number(e.target.value))}
                        className="bg-[var(--color-ink)] border border-[var(--color-card-hover)] rounded-lg px-2 py-1.5 text-sm text-[var(--color-cream)] font-[var(--font-body)] focus:outline-none focus:border-[var(--color-lavender)]/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label="Cantidad a devolver"
                      >
                        {qtyOptions.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Motivo */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="return-reason"
              className="text-sm font-[var(--font-cond)] font-medium text-[var(--color-cream-dim)] tracking-wide"
            >
              Motivo de la devolución
              <span className="text-[var(--color-brand-red)] ml-0.5">*</span>
            </label>
            <select
              id="return-reason"
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value as ReasonCode)}
              className="w-full bg-[var(--color-ink)] border border-[var(--color-card)] rounded-lg px-4 py-2.5 text-[var(--color-cream)] font-[var(--font-body)] text-sm transition-colors duration-200 hover:border-[var(--color-mid)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--color-lavender)]/50 focus:border-[var(--color-lavender)]"
            >
              <option value="">Selecciona un motivo…</option>
              {RETURN_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Comentario opcional */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="return-comment"
              className="text-sm font-[var(--font-cond)] font-medium text-[var(--color-cream-dim)] tracking-wide"
            >
              Comentario (opcional)
            </label>
            <textarea
              id="return-comment"
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Cuéntanos más detalles si quieres…"
              className="w-full text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-ink)] px-3 py-2 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors resize-y"
            />
          </div>

          {/* Error de envío */}
          {phase === 'error' && errorMsg && (
            <p className="text-sm text-[var(--color-brand-red)] font-[var(--font-body)] bg-[rgba(220,38,38,0.08)] border border-red-700/40 rounded-lg px-3 py-2.5">
              {errorMsg}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={onClose}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {submitting ? (
                <Loader2 size={13} className="animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw size={13} aria-hidden="true" />
              )}
              Solicitar devolución
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
