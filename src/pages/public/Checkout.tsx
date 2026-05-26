import { useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronLeft, Truck, Store, Receipt, Clock, Bike } from 'lucide-react'
import { useCartStore } from '@/stores/cartStore'
import { useSchedule } from '@/hooks/useSchedule'
import { useShopSettings } from '@/hooks/useShopSettings'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { SEO } from '@/components/layout/SEO'
import { supabase } from '@/lib/supabase'
import { TERMS_VERSION, PRIVACY_VERSION } from '@/lib/legal-versions'
import type { RedsysFormData } from '@/components/public/RedsysAutoSubmitForm'
import {
  checkoutSchema,
  checkoutDefaults,
  PROVINCIAS_PENINSULA,
  type CheckoutFormValues,
} from '@/schemas/checkout'

function fmtEuros(cents: number): string {
  return (cents / 100).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

interface OrderPlaceResponse {
  ok: boolean
  error?: string
  order_number: string
  order_id: string
  public_token: string
  payment:
    | { mode: 'mock'; mock_url: string }
    | { mode: 'redsys'; form_data: RedsysFormData }
}

export default function Checkout() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const items = useCartStore(s => s.items)
  const getSubtotalCents = useCartStore(s => s.getSubtotalCents)
  const { schedule } = useSchedule()
  const { toasts, toast, dismiss } = useToast()

  // Preferencia traída desde /carrito (?delivery=pickup|shipping). Si no
  // viene o es inválida, mantenemos el default del schema (shipping).
  const initialDelivery: 'shipping' | 'pickup' =
    searchParams.get('delivery') === 'pickup' ? 'pickup' : checkoutDefaults.delivery_method

  // Settings tienda (envío, umbral, IVA, auto-cancel). Defaults se usan
  // mientras carga para no bloquear el render del formulario.
  const { settings } = useShopSettings()
  const shippingFlatRateCents = settings.shippingFlatRateCents
  const shippingFreeThresholdCents = settings.shippingFreeThresholdCents
  const taxRate = settings.taxRateDefault
  const autoCancelHours = settings.orderAutoCancelHours

  const subtotalCents = getSubtotalCents()
  const isEmpty = items.length === 0

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutFormValues>({
    // El resolver acepta el output type del schema (con refines) — casteamos para
    // satisfacer el chequeo de defaults vs InferredType bajo `superRefine`.
    resolver: zodResolver(checkoutSchema) as never,
    defaultValues: { ...checkoutDefaults, delivery_method: initialDelivery },
    mode: 'onBlur',
  })

  const deliveryMethod = watch('delivery_method')
  const needsInvoice = watch('needs_invoice')

  // Si carrito vacío → redirect a /carrito.
  useEffect(() => {
    if (isEmpty) navigate('/carrito', { replace: true })
  }, [isEmpty, navigate])

  useEffect(() => {
    document.title = 'Checkout · DC Bikes Cantabria'
  }, [])

  // Cálculo envío y totales.
  const shippingCents = (() => {
    if (deliveryMethod === 'pickup') return 0
    if (subtotalCents >= shippingFreeThresholdCents) return 0
    return shippingFlatRateCents
  })()
  const totalCents = subtotalCents + shippingCents
  // Desglose IVA: precios son con IVA incluido.
  const baseCents = Math.round(totalCents / (1 + taxRate / 100))
  const taxCents = totalCents - baseCents

  const onSubmit = async (data: CheckoutFormValues) => {
    // Construimos el body que `order-place` espera (ver contrato Fase E).
    // OJO: NO enviamos snapshot ni totales — el backend recalcula precios
    // y stock para evitar manipulación del cliente.
    const body = {
      items: items.map(i => ({
        product_id: i.product_id,
        quantity: i.quantity,
      })),
      customer: {
        first_name: data.first_name.trim(),
        last_name: data.last_name.trim(),
        email: data.email.trim().toLowerCase(),
        phone: data.phone.trim(),
      },
      delivery_method: data.delivery_method,
      shipping_address:
        data.delivery_method === 'shipping'
          ? {
              address: data.shipping_address?.trim() ?? '',
              city: data.shipping_city?.trim() ?? '',
              postal_code: data.shipping_postal_code?.trim() ?? '',
              province: data.shipping_province ?? '',
              notes: data.shipping_notes?.trim() || null,
            }
          : null,
      needs_invoice: data.needs_invoice,
      invoice_b2b: data.needs_invoice
        ? {
            business_name: data.invoice_business_name?.trim() ?? '',
            cif: (data.invoice_cif?.trim() ?? '').toUpperCase(),
            address: data.invoice_address?.trim() ?? '',
          }
        : null,
      consents: {
        accepted_terms: data.accepted_terms,
        accepted_privacy: data.accepted_privacy,
        marketing_opt_in: data.marketing_opt_in,
      },
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
    }

    try {
      const { data: result, error } = await supabase.functions.invoke<
        OrderPlaceResponse
      >('order-place', { body })

      if (error) throw error
      if (!result?.ok) {
        throw new Error(result?.error || 'No se pudo procesar el pedido')
      }

      // Persistimos referencia ligera del último pedido para que la página
      // de confirmación pueda leerla aunque pierda el state de navegación
      // (refresh, click directo desde email, etc.).
      try {
        localStorage.setItem(
          'dcbikes_last_order',
          JSON.stringify({
            order_id: result.order_id,
            order_number: result.order_number,
            token: result.public_token,
          }),
        )
      } catch {
        // localStorage saturado o bloqueado — no crítico.
      }

      // NO vaciamos el carrito todavía: el usuario podría cancelar en
      // Redsys y querer reintentar con los mismos items. El clear se
      // hace en `OrderConfirmation` cuando el pago está autorizado.

      if (result.payment.mode === 'mock') {
        // Sandbox local: vamos directos al simulador.
        navigate(result.payment.mock_url, { replace: true })
        return
      }

      // Redsys real: pasamos el form_data por location.state para que
      // la página puente lo auto-submita.
      navigate('/pedido/redirigiendo', {
        replace: true,
        state: {
          form_data: result.payment.form_data,
          order_id: result.order_id,
          public_token: result.public_token,
        },
      })
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : 'Error procesando el pedido. Inténtalo de nuevo.'
      toast.error(message)
    }
  }

  if (isEmpty) {
    return null // El useEffect ya redirige.
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-10">
      <SEO
        title="Checkout"
        description="Finaliza tu pedido — datos de envío, facturación y pago."
        url="https://dc-bikes-cantabria.vercel.app/checkout"
        noIndex={true}
      />

      {/* Breadcrumb */}
      <nav
        className="flex items-center gap-2 mb-6 text-sm text-[var(--color-mid)] font-[var(--font-cond)]"
        aria-label="Navegación"
      >
        <Link to="/" className="hover:text-[var(--color-cream)] transition-colors">
          Inicio
        </Link>
        <span>/</span>
        <Link
          to="/carrito"
          className="hover:text-[var(--color-cream)] transition-colors"
        >
          Carrito
        </Link>
        <span>/</span>
        <span className="text-[var(--color-lavender)]">Checkout</span>
      </nav>

      <h1 className="font-[var(--font-display)] text-5xl text-[var(--color-cream)] tracking-wide mb-8">
        Finaliza tu pedido
      </h1>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="grid lg:grid-cols-[1fr_380px] gap-8"
      >
        {/* Formulario (columna izquierda) */}
        <div className="space-y-8">
          {/* Sección 1: Datos cliente */}
          <section className="bg-[var(--color-card)] rounded-2xl p-6 space-y-5">
            <header className="flex items-baseline gap-3">
              <span className="font-[var(--font-display)] text-2xl text-[var(--color-lavender)] tracking-wide">
                1.
              </span>
              <h2 className="font-[var(--font-display)] text-2xl tracking-widest text-[var(--color-cream)]">
                Tus datos
              </h2>
            </header>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field
                label="Nombre"
                required
                {...register('first_name')}
                error={errors.first_name?.message}
                autoComplete="given-name"
              />
              <Field
                label="Apellidos"
                required
                {...register('last_name')}
                error={errors.last_name?.message}
                autoComplete="family-name"
              />
              <Field
                label="Email"
                type="email"
                required
                {...register('email')}
                error={errors.email?.message}
                autoComplete="email"
              />
              <Field
                label="Teléfono"
                type="tel"
                required
                placeholder="612 345 678"
                {...register('phone')}
                error={errors.phone?.message}
                autoComplete="tel"
              />
            </div>
          </section>

          {/* Sección 2: Entrega */}
          <section className="bg-[var(--color-card)] rounded-2xl p-6 space-y-5">
            <header className="flex items-baseline gap-3">
              <span className="font-[var(--font-display)] text-2xl text-[var(--color-lavender)] tracking-wide">
                2.
              </span>
              <h2 className="font-[var(--font-display)] text-2xl tracking-widest text-[var(--color-cream)]">
                Entrega
              </h2>
            </header>

            <Controller
              control={control}
              name="delivery_method"
              render={({ field }) => (
                <fieldset className="grid sm:grid-cols-2 gap-3">
                  <legend className="sr-only">Método de entrega</legend>
                  {(
                    [
                      {
                        value: 'shipping' as const,
                        icon: Truck,
                        title: 'Envío a dirección',
                        subtitle: `${fmtEuros(shippingFlatRateCents)} € · Gratis desde ${fmtEuros(shippingFreeThresholdCents)} €`,
                      },
                      {
                        value: 'pickup' as const,
                        icon: Store,
                        title: 'Recogida en tienda',
                        subtitle: 'Gratis · El Astillero',
                      },
                    ] as const
                  ).map(opt => {
                    const Icon = opt.icon
                    const selected = field.value === opt.value
                    return (
                      <label
                        key={opt.value}
                        className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                          selected
                            ? 'border-[var(--color-lavender)] bg-[rgba(196,162,207,0.08)]'
                            : 'border-[var(--color-card-hover)] hover:border-[var(--color-mid)]'
                        }`}
                      >
                        <input
                          type="radio"
                          name={field.name}
                          value={opt.value}
                          checked={selected}
                          onChange={() => field.onChange(opt.value)}
                          onBlur={field.onBlur}
                          className="accent-[var(--color-lavender)]"
                        />
                        <Icon
                          size={20}
                          className="text-[var(--color-lavender)] shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-[var(--font-cond)] text-sm font-semibold text-[var(--color-cream)]">
                            {opt.title}
                          </p>
                          <p className="text-[11px] text-[var(--color-mid)]">
                            {opt.subtitle}
                          </p>
                        </div>
                      </label>
                    )
                  })}
                </fieldset>
              )}
            />

            {deliveryMethod === 'shipping' ? (
              <div className="grid sm:grid-cols-2 gap-4 pt-2">
                <div className="sm:col-span-2">
                  <Field
                    label="Dirección"
                    required
                    placeholder="Calle, número, piso..."
                    {...register('shipping_address')}
                    error={errors.shipping_address?.message}
                    autoComplete="street-address"
                  />
                </div>
                <Field
                  label="Ciudad"
                  required
                  {...register('shipping_city')}
                  error={errors.shipping_city?.message}
                  autoComplete="address-level2"
                />
                <Field
                  label="Código postal"
                  required
                  placeholder="39000"
                  maxLength={5}
                  inputMode="numeric"
                  {...register('shipping_postal_code')}
                  error={errors.shipping_postal_code?.message}
                  autoComplete="postal-code"
                />
                <div className="sm:col-span-2 flex flex-col gap-1.5">
                  <label
                    htmlFor="shipping_province"
                    className="text-sm font-[var(--font-cond)] font-medium text-[var(--color-cream-dim)] tracking-wide"
                  >
                    Provincia
                    <span className="text-[var(--color-brand-red)] ml-0.5">
                      *
                    </span>
                  </label>
                  <select
                    id="shipping_province"
                    {...register('shipping_province')}
                    aria-invalid={!!errors.shipping_province}
                    className={`w-full bg-[var(--color-ink)] border rounded-lg px-4 py-2.5 text-[var(--color-cream)] font-[var(--font-body)] text-sm transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-lavender)]/50 focus:border-[var(--color-lavender)] ${
                      errors.shipping_province
                        ? 'border-[var(--color-brand-red)]'
                        : 'border-[var(--color-card)] hover:border-[var(--color-mid)]/60'
                    }`}
                  >
                    <option value="">— Selecciona provincia —</option>
                    {PROVINCIAS_PENINSULA.map(p => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  {errors.shipping_province && (
                    <p className="text-xs text-[var(--color-brand-red)] font-[var(--font-body)]">
                      {errors.shipping_province.message}
                    </p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <Field
                    label="Notas de entrega (opcional)"
                    as="textarea"
                    rows={3}
                    placeholder="Indicaciones para el repartidor, horario preferido..."
                    {...register('shipping_notes')}
                    error={errors.shipping_notes?.message}
                  />
                </div>
              </div>
            ) : (
              <div className="bg-[var(--color-ink)] rounded-xl p-4 flex gap-3 items-start">
                <Store
                  size={22}
                  className="text-[var(--color-lavender)] shrink-0 mt-0.5"
                />
                <div className="flex-1 text-sm font-[var(--font-body)] text-[var(--color-cream-dim)] space-y-2">
                  <p>
                    Te avisaremos por email cuando tu pedido esté listo para
                    recoger en nuestra tienda.
                  </p>
                  <div className="flex items-start gap-2 text-[var(--color-mid)]">
                    <Clock size={14} className="mt-0.5 shrink-0" />
                    <ul className="space-y-0.5 text-xs">
                      {schedule.slice(0, 7).map(day => {
                        const slots = [day.morning, day.afternoon].filter(
                          Boolean,
                        ) as string[]
                        return (
                          <li key={day.label}>
                            <strong className="text-[var(--color-cream-dim)]">
                              {day.label}:
                            </strong>{' '}
                            {slots.length === 0
                              ? 'Cerrado'
                              : slots.join(' · ')}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Sección 3: Facturación (collapsible) */}
          <section className="bg-[var(--color-card)] rounded-2xl p-6 space-y-5">
            <header className="flex items-baseline gap-3">
              <span className="font-[var(--font-display)] text-2xl text-[var(--color-lavender)] tracking-wide">
                3.
              </span>
              <h2 className="font-[var(--font-display)] text-2xl tracking-widest text-[var(--color-cream)]">
                Facturación
              </h2>
            </header>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                {...register('needs_invoice')}
                className="mt-1 accent-[var(--color-lavender)] w-4 h-4"
              />
              <div className="flex-1">
                <p className="font-[var(--font-cond)] text-sm font-semibold text-[var(--color-cream)] flex items-center gap-2">
                  <Receipt size={16} />
                  Necesito factura para empresa
                </p>
                <p className="text-xs text-[var(--color-mid)] mt-0.5">
                  Si activas esta opción emitiremos la factura a nombre de tu
                  empresa con CIF.
                </p>
              </div>
            </label>

            {needsInvoice && (
              <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-[var(--color-card-hover)]">
                <div className="sm:col-span-2">
                  <Field
                    label="Razón social"
                    required
                    {...register('invoice_business_name')}
                    error={errors.invoice_business_name?.message}
                    autoComplete="organization"
                  />
                </div>
                <Field
                  label="CIF"
                  required
                  placeholder="B12345678"
                  {...register('invoice_cif')}
                  error={errors.invoice_cif?.message}
                />
                <div className="sm:col-span-2">
                  <Field
                    label="Dirección fiscal"
                    required
                    {...register('invoice_address')}
                    error={errors.invoice_address?.message}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Sección 4: Resumen items + consentimientos */}
          <section className="bg-[var(--color-card)] rounded-2xl p-6 space-y-5">
            <header className="flex items-baseline gap-3">
              <span className="font-[var(--font-display)] text-2xl text-[var(--color-lavender)] tracking-wide">
                4.
              </span>
              <h2 className="font-[var(--font-display)] text-2xl tracking-widest text-[var(--color-cream)]">
                Resumen y aceptación
              </h2>
            </header>

            {/* Items compactos */}
            <ul className="space-y-2">
              {items.map(item => (
                <li
                  key={item.product_id}
                  className="flex items-center gap-3 py-2 border-b border-[var(--color-card-hover)] last:border-0"
                >
                  <div className="w-12 h-12 bg-[var(--color-ink)] rounded-lg overflow-hidden flex items-center justify-center shrink-0">
                    {item.snapshot.image_url ? (
                      <img
                        src={item.snapshot.image_url}
                        alt={item.snapshot.name}
                        className="w-full h-full object-contain p-0.5"
                        loading="lazy"
                      />
                    ) : (
                      <Bike
                        size={18}
                        strokeWidth={1}
                        className="text-[var(--color-mid)]"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-[var(--font-cond)] text-sm font-semibold text-[var(--color-cream)] line-clamp-1">
                      {item.snapshot.name}
                    </p>
                    <p className="text-[11px] text-[var(--color-mid)]">
                      {item.snapshot.size_label
                        ? `Talla ${item.snapshot.size_label} · `
                        : ''}
                      Cantidad {item.quantity}
                    </p>
                  </div>
                  <span className="font-[var(--font-cond)] text-sm text-[var(--color-cream-dim)] tabular-nums">
                    {fmtEuros(item.snapshot.unit_price_cents * item.quantity)} €
                  </span>
                </li>
              ))}
            </ul>

            {/* Consentimientos */}
            <div className="space-y-3 border-t border-[var(--color-card-hover)] pt-5">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  {...register('accepted_terms')}
                  className="mt-1 accent-[var(--color-lavender)] w-4 h-4 shrink-0"
                />
                <span className="text-sm font-[var(--font-body)] text-[var(--color-cream-dim)] leading-relaxed">
                  He leído y acepto los{' '}
                  <Link
                    to="/terminos-venta"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-lavender)] underline hover:text-[var(--color-cream)]"
                  >
                    Términos y condiciones de venta
                  </Link>
                  .
                </span>
              </label>
              {errors.accepted_terms && (
                <p className="text-xs text-[var(--color-brand-red)] ml-7">
                  {errors.accepted_terms.message}
                </p>
              )}

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  {...register('accepted_privacy')}
                  className="mt-1 accent-[var(--color-lavender)] w-4 h-4 shrink-0"
                />
                <span className="text-sm font-[var(--font-body)] text-[var(--color-cream-dim)] leading-relaxed">
                  He leído y acepto la{' '}
                  <Link
                    to="/privacidad"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-lavender)] underline hover:text-[var(--color-cream)]"
                  >
                    Política de Privacidad
                  </Link>
                  .
                </span>
              </label>
              {errors.accepted_privacy && (
                <p className="text-xs text-[var(--color-brand-red)] ml-7">
                  {errors.accepted_privacy.message}
                </p>
              )}

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  {...register('accepted_approval_flow')}
                  className="mt-1 accent-[var(--color-lavender)] w-4 h-4 shrink-0"
                />
                <span className="text-sm font-[var(--font-body)] text-[var(--color-cream-dim)] leading-relaxed">
                  Acepto que la tienda tiene{' '}
                  <strong>{autoCancelHours}&nbsp;horas</strong> para confirmar
                  mi pedido. Si lo rechazan, mi reserva se libera
                  automáticamente sin coste para mí.
                </span>
              </label>
              {errors.accepted_approval_flow && (
                <p className="text-xs text-[var(--color-brand-red)] ml-7">
                  {errors.accepted_approval_flow.message}
                </p>
              )}

              <label className="flex items-start gap-3 cursor-pointer pt-2">
                <input
                  type="checkbox"
                  {...register('marketing_opt_in')}
                  className="mt-1 accent-[var(--color-lavender)] w-4 h-4 shrink-0"
                />
                <span className="text-sm font-[var(--font-body)] text-[var(--color-mid)] leading-relaxed">
                  Quiero recibir ofertas y novedades por email (opcional).
                </span>
              </label>
            </div>
          </section>

          {/* Footer formulario móvil */}
          <div className="lg:hidden">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isSubmitting}
              className="w-full font-[var(--font-display)] tracking-widest"
            >
              Realizar pedido con obligación de pago
            </Button>
          </div>

          <Link
            to="/carrito"
            className="inline-flex items-center gap-1.5 text-sm font-[var(--font-cond)] tracking-wide text-[var(--color-lavender)] hover:text-[var(--color-cream)] transition-colors"
          >
            <ChevronLeft size={16} />
            Volver al carrito
          </Link>
        </div>

        {/* Resumen lateral */}
        <aside className="lg:sticky lg:top-24 h-fit bg-[var(--color-card)] rounded-2xl p-6 flex flex-col gap-5">
          <h2 className="font-[var(--font-display)] text-2xl tracking-widest text-[var(--color-cream)]">
            Total a pagar
          </h2>

          <div className="space-y-2 text-sm font-[var(--font-cond)]">
            <div className="flex justify-between">
              <span className="text-[var(--color-mid)]">Subtotal</span>
              <span className="text-[var(--color-cream)] tabular-nums">
                {fmtEuros(subtotalCents)} €
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-mid)]">
                Envío{' '}
                {deliveryMethod === 'pickup' && (
                  <span className="text-[10px] uppercase">(recogida)</span>
                )}
              </span>
              <span className="text-[var(--color-cream)] tabular-nums">
                {shippingCents === 0 ? 'Gratis' : `${fmtEuros(shippingCents)} €`}
              </span>
            </div>
          </div>

          <div className="border-t border-[var(--color-card-hover)] pt-4">
            <div className="flex justify-between items-baseline mb-2">
              <span className="font-[var(--font-cond)] text-sm uppercase tracking-widest text-[var(--color-cream-dim)]">
                Total
              </span>
              <span className="font-[var(--font-display)] text-3xl text-[var(--color-lavender)] tracking-wide tabular-nums">
                {fmtEuros(totalCents)} €
              </span>
            </div>
            <p className="text-[10px] font-[var(--font-cond)] text-[var(--color-mid)] leading-relaxed tabular-nums">
              Base imponible {fmtEuros(baseCents)} € + IVA {taxRate}%{' '}
              {fmtEuros(taxCents)} € = Total {fmtEuros(totalCents)} €
            </p>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={isSubmitting}
            className="hidden lg:flex w-full font-[var(--font-display)] tracking-widest"
          >
            Realizar pedido con obligación de pago
          </Button>

          <p className="text-[10px] text-[var(--color-mid)] font-[var(--font-cond)] leading-relaxed">
            Al realizar el pedido se reservará el importe en tu tarjeta. No se
            cobrará hasta que la tienda confirme la disponibilidad (máx.{' '}
            {autoCancelHours} h).
          </p>
        </aside>
      </form>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
