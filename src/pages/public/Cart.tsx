import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Trash2,
  Plus,
  Minus,
  ChevronLeft,
  ShoppingBag,
  Bike,
  Truck,
  Store,
} from 'lucide-react'
import { useCartStore } from '@/stores/cartStore'
import { useShopSettings } from '@/hooks/useShopSettings'
import { Button } from '@/components/ui/Button'
import { SEO } from '@/components/layout/SEO'

function fmtEuros(cents: number): string {
  return (cents / 100).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

type DeliveryPreview = 'shipping' | 'pickup'

export default function Cart() {
  const navigate = useNavigate()
  const items = useCartStore(s => s.items)
  const removeItem = useCartStore(s => s.removeItem)
  const updateQuantity = useCartStore(s => s.updateQuantity)
  const getSubtotalCents = useCartStore(s => s.getSubtotalCents)

  // Settings tienda (envío, umbral free). Mientras carga usa defaults — no
  // bloqueamos UX porque son cálculos orientativos hasta el checkout real.
  const { settings } = useShopSettings()
  const shippingFlatRateCents = settings.shippingFlatRateCents
  const shippingFreeThresholdCents = settings.shippingFreeThresholdCents

  const [deliveryPreview, setDeliveryPreview] =
    useState<DeliveryPreview>('shipping')

  const subtotalCents = getSubtotalCents()
  const isEmpty = items.length === 0

  // Cálculo envío previsualizado (orientativo — el real se calcula en checkout).
  const shippingPreviewCents = (() => {
    if (deliveryPreview === 'pickup') return 0
    if (subtotalCents >= shippingFreeThresholdCents) return 0
    return shippingFlatRateCents
  })()
  const totalCents = subtotalCents + shippingPreviewCents

  useEffect(() => {
    document.title = 'Tu carrito · DC Bikes Cantabria'
  }, [])

  if (isEmpty) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-20">
        <SEO
          title="Tu carrito"
          description="Tu carrito de compra en DC Bikes Cantabria."
          url="https://dcbikescantabria.com/carrito"
          noIndex={true}
        />
        <div className="max-w-md mx-auto text-center flex flex-col items-center gap-6">
          <div className="w-24 h-24 rounded-full bg-[var(--color-card)] flex items-center justify-center text-[var(--color-mid)]">
            <ShoppingBag size={42} strokeWidth={1} aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-[var(--font-display)] text-4xl tracking-wide text-[var(--color-cream)] mb-2">
              Carrito vacío
            </h1>
            <p className="font-[var(--font-body)] text-[var(--color-mid)]">
              Aún no has añadido productos. Explora el catálogo y vuelve cuando
              encuentres lo que buscas.
            </p>
          </div>
          <Link
            to="/catalogo"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--color-lavender)] text-[var(--color-ink)] font-[var(--font-cond)] font-semibold tracking-widest hover:brightness-110 transition-all"
          >
            <ChevronLeft size={18} aria-hidden="true" />
            Ver catálogo
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-10">
      <SEO
        title="Tu carrito"
        description="Revisa los productos de tu carrito antes de tramitar el pedido."
        url="https://dcbikescantabria.com/carrito"
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
        <span className="text-[var(--color-lavender)]">Carrito</span>
      </nav>

      <h1 className="font-[var(--font-display)] text-5xl text-[var(--color-cream)] tracking-wide mb-8">
        Tu carrito
      </h1>

      <div className="grid lg:grid-cols-[1fr_360px] gap-8">
        {/* Lista items */}
        <div className="space-y-3">
          {/* Header tabla (solo desktop) */}
          <div className="hidden md:grid grid-cols-[80px_1fr_140px_140px_120px_44px] gap-3 px-3 pb-2 text-[11px] font-[var(--font-cond)] uppercase tracking-widest text-[var(--color-mid)] border-b border-[var(--color-card)]">
            <span></span>
            <span>Producto</span>
            <span className="text-right">Precio</span>
            <span className="text-center">Cantidad</span>
            <span className="text-right">Subtotal</span>
            <span></span>
          </div>

          {items.map(item => {
            const { product_id, quantity, snapshot } = item
            const lineTotalCents = snapshot.unit_price_cents * quantity
            const canIncrease = quantity < snapshot.stock_at_add
            return (
              <article
                key={product_id}
                className="bg-[var(--color-card)] rounded-xl p-3 md:p-4 grid md:grid-cols-[80px_1fr_140px_140px_120px_44px] gap-3 md:gap-4 items-center"
              >
                {/* Imagen */}
                <Link
                  to={`/producto/${snapshot.slug}`}
                  className="row-span-2 md:row-span-1 w-20 h-20 bg-[var(--color-ink)] rounded-lg overflow-hidden flex items-center justify-center shrink-0"
                  aria-label={`Ver ${snapshot.name}`}
                >
                  {snapshot.image_url ? (
                    <img
                      src={snapshot.image_url}
                      alt={snapshot.name}
                      className="w-full h-full object-contain p-1"
                      loading="lazy"
                    />
                  ) : (
                    <Bike
                      size={28}
                      strokeWidth={1}
                      className="text-[var(--color-mid)]"
                      aria-hidden="true"
                    />
                  )}
                </Link>

                {/* Info */}
                <div className="flex flex-col gap-1 min-w-0">
                  <Link
                    to={`/producto/${snapshot.slug}`}
                    className="font-[var(--font-cond)] text-base font-semibold text-[var(--color-cream)] leading-tight hover:text-[var(--color-lavender)] transition-colors line-clamp-2"
                  >
                    {snapshot.name}
                  </Link>
                  {snapshot.size_label && (
                    <span className="text-[11px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)]">
                      Talla {snapshot.size_label}
                    </span>
                  )}
                  {snapshot.sku && (
                    <span className="text-[10px] font-[var(--font-cond)] tracking-wide text-[var(--color-mid)]">
                      SKU {snapshot.sku}
                    </span>
                  )}
                </div>

                {/* Precio unitario */}
                <div className="md:text-right">
                  <span className="md:hidden text-[10px] uppercase tracking-widest text-[var(--color-mid)] mr-2">
                    Precio
                  </span>
                  <span className="font-[var(--font-cond)] text-base text-[var(--color-cream-dim)] tabular-nums">
                    {fmtEuros(snapshot.unit_price_cents)} €
                  </span>
                </div>

                {/* Cantidad */}
                <div className="flex md:justify-center">
                  <div className="inline-flex items-center gap-1 bg-[var(--color-ink-deep)] rounded-lg border border-[var(--color-card)]">
                    <button
                      onClick={() => updateQuantity(product_id, quantity - 1)}
                      className="px-2.5 py-1.5 text-[var(--color-mid)] hover:text-[var(--color-cream)] disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={quantity <= 1}
                      aria-label="Disminuir cantidad"
                    >
                      <Minus size={14} aria-hidden="true" />
                    </button>
                    <span className="min-w-[28px] text-center font-[var(--font-cond)] text-sm text-[var(--color-cream)] tabular-nums">
                      {quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(product_id, quantity + 1)}
                      className="px-2.5 py-1.5 text-[var(--color-mid)] hover:text-[var(--color-cream)] disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={!canIncrease}
                      aria-label="Aumentar cantidad"
                      title={
                        !canIncrease ? 'Stock máximo alcanzado' : undefined
                      }
                    >
                      <Plus size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Subtotal línea */}
                <div className="md:text-right">
                  <span className="md:hidden text-[10px] uppercase tracking-widest text-[var(--color-mid)] mr-2">
                    Subtotal
                  </span>
                  <span className="font-[var(--font-display)] text-lg text-[var(--color-lavender)] tracking-wide tabular-nums">
                    {fmtEuros(lineTotalCents)} €
                  </span>
                </div>

                {/* Eliminar */}
                <div className="md:flex md:justify-end">
                  <button
                    onClick={() => removeItem(product_id)}
                    className="p-2 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-brand-red)] hover:bg-[rgba(255,77,77,0.08)] transition-colors"
                    aria-label={`Eliminar ${snapshot.name} del carrito`}
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </div>
              </article>
            )
          })}

          <div className="pt-2">
            <Link
              to="/catalogo"
              className="inline-flex items-center gap-1.5 text-sm font-[var(--font-cond)] tracking-wide text-[var(--color-lavender)] hover:text-[var(--color-cream)] transition-colors"
            >
              <ChevronLeft size={16} aria-hidden="true" />
              Volver al catálogo
            </Link>
          </div>
        </div>

        {/* Resumen lateral */}
        <aside className="lg:sticky lg:top-24 h-fit bg-[var(--color-card)] rounded-2xl p-6 flex flex-col gap-5">
          <h2 className="font-[var(--font-display)] text-2xl tracking-widest text-[var(--color-cream)]">
            Resumen
          </h2>

          {/* Selector método entrega */}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[11px] font-[var(--font-cond)] uppercase tracking-widest text-[var(--color-mid)] mb-1">
              Método de entrega
            </legend>
            <label
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                deliveryPreview === 'shipping'
                  ? 'border-[var(--color-lavender)] bg-[rgba(196,162,207,0.08)]'
                  : 'border-[var(--color-card-hover)] hover:border-[var(--color-mid)]'
              }`}
            >
              <input
                type="radio"
                name="delivery_preview"
                value="shipping"
                checked={deliveryPreview === 'shipping'}
                onChange={() => setDeliveryPreview('shipping')}
                className="accent-[var(--color-lavender)]"
              />
              <Truck size={18} className="text-[var(--color-lavender)] shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="font-[var(--font-cond)] text-sm font-semibold text-[var(--color-cream)]">
                  Envío a dirección
                </p>
                <p className="text-[11px] text-[var(--color-mid)]">
                  Calculado en checkout
                </p>
              </div>
            </label>
            <label
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                deliveryPreview === 'pickup'
                  ? 'border-[var(--color-lavender)] bg-[rgba(196,162,207,0.08)]'
                  : 'border-[var(--color-card-hover)] hover:border-[var(--color-mid)]'
              }`}
            >
              <input
                type="radio"
                name="delivery_preview"
                value="pickup"
                checked={deliveryPreview === 'pickup'}
                onChange={() => setDeliveryPreview('pickup')}
                className="accent-[var(--color-lavender)]"
              />
              <Store size={18} className="text-[var(--color-lavender)] shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="font-[var(--font-cond)] text-sm font-semibold text-[var(--color-cream)]">
                  Recogida en tienda
                </p>
                <p className="text-[11px] text-[var(--color-mid)]">
                  Gratis · El Astillero
                </p>
              </div>
            </label>
          </fieldset>

          {/* Desglose */}
          <div className="space-y-2 border-t border-[var(--color-card-hover)] pt-4">
            <div className="flex justify-between text-sm font-[var(--font-cond)]">
              <span className="text-[var(--color-mid)]">Subtotal</span>
              <span className="text-[var(--color-cream)] tabular-nums">
                {fmtEuros(subtotalCents)} €
              </span>
            </div>
            <div className="flex justify-between text-sm font-[var(--font-cond)]">
              <span className="text-[var(--color-mid)]">Envío</span>
              <span className="text-[var(--color-cream)] tabular-nums">
                {shippingPreviewCents === 0
                  ? 'Gratis'
                  : `${fmtEuros(shippingPreviewCents)} €`}
              </span>
            </div>
            {deliveryPreview === 'shipping' &&
              subtotalCents < shippingFreeThresholdCents && (
                <p className="text-[11px] text-[var(--color-mid)] font-[var(--font-cond)]">
                  Te faltan{' '}
                  <strong className="text-[var(--color-lavender)]">
                    {fmtEuros(shippingFreeThresholdCents - subtotalCents)} €
                  </strong>{' '}
                  para envío gratis.
                </p>
              )}
          </div>

          <div className="flex justify-between items-baseline border-t border-[var(--color-card-hover)] pt-4">
            <span className="font-[var(--font-cond)] text-sm uppercase tracking-widest text-[var(--color-cream-dim)]">
              Total
            </span>
            <span className="font-[var(--font-display)] text-3xl text-[var(--color-lavender)] tracking-wide tabular-nums">
              {fmtEuros(totalCents)} €
            </span>
          </div>

          <p className="text-[10px] text-[var(--color-mid)] font-[var(--font-cond)] leading-relaxed">
            Precios con IVA incluido (21 %). El total definitivo y el desglose
            fiscal se muestran en el checkout.
          </p>

          <Button
            variant="primary"
            size="lg"
            onClick={() => navigate(`/checkout?delivery=${deliveryPreview}`)}
            className="w-full font-[var(--font-display)] tracking-widest"
          >
            Continuar al checkout
          </Button>
        </aside>
      </div>
    </div>
  )
}
