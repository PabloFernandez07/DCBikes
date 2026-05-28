import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { X, Trash2, Plus, Minus, ShoppingBag, Bike } from 'lucide-react'
import { useCartStore } from '@/stores/cartStore'
import { useUiStore } from '@/stores/uiStore'
import { Button } from '@/components/ui/Button'

function fmtEuros(cents: number): string {
  return (cents / 100).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Drawer lateral derecho con el contenido del carrito.
 *
 * Estados:
 *  - cerrado: translateX-full (oculto a la derecha).
 *  - abierto: translateX-0 con overlay oscuro detrás (clickable para cerrar).
 *
 * En móvil ocupa ancho completo (max-w-full). En desktop ~400px.
 *
 * Bloquea scroll del body cuando está abierto.
 */
export function CartDrawer() {
  const navigate = useNavigate()
  const isOpen = useUiStore(s => s.isCartOpen)
  const closeCart = useUiStore(s => s.closeCart)
  const items = useCartStore(s => s.items)
  const removeItem = useCartStore(s => s.removeItem)
  const updateQuantity = useCartStore(s => s.updateQuantity)
  const getSubtotalCents = useCartStore(s => s.getSubtotalCents)

  // Bloquear scroll del body cuando abierto + cerrar con Escape.
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCart()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [isOpen, closeCart])

  const subtotalCents = getSubtotalCents()
  const isEmpty = items.length === 0

  const goToCart = () => {
    closeCart()
    navigate('/carrito')
  }

  return (
    <>
      {/* Overlay */}
      <div
        aria-hidden={!isOpen}
        onClick={closeCart}
        className={`fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        aria-hidden={!isOpen}
        className={`fixed top-0 right-0 z-[61] h-full w-full max-w-[420px] bg-[var(--color-ink-deep)] border-l border-[var(--color-card)] shadow-2xl transition-transform duration-300 ease-out flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-card)]">
          <h2
            id="cart-drawer-title"
            className="font-[var(--font-display)] text-2xl tracking-widest text-[var(--color-cream)] flex items-center gap-2"
          >
            <ShoppingBag size={20} aria-hidden="true" />
            Tu carrito
          </h2>
          <button
            onClick={closeCart}
            className="p-2 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[rgba(255,255,255,0.08)] transition-colors"
            aria-label="Cerrar carrito"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </header>

        {/* Contenido */}
        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-5">
            <div className="w-20 h-20 rounded-full bg-[var(--color-card)] flex items-center justify-center text-[var(--color-mid)]">
              <ShoppingBag size={36} strokeWidth={1} aria-hidden="true" />
            </div>
            <div>
              <p className="font-[var(--font-display)] text-2xl tracking-wide text-[var(--color-cream)] mb-1">
                Carrito vacío
              </p>
              <p className="font-[var(--font-body)] text-sm text-[var(--color-mid)]">
                Aún no has añadido productos.
              </p>
            </div>
            <Link
              to="/catalogo"
              onClick={closeCart}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-[var(--color-lavender)] text-[var(--color-ink)] font-[var(--font-cond)] font-semibold tracking-wide hover:brightness-110 transition-all"
            >
              Ver catálogo
            </Link>
          </div>
        ) : (
          <>
            {/* Lista items (scrollable) */}
            <ul className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {items.map(item => {
                const { product_id, quantity, snapshot } = item
                const lineTotalCents = snapshot.unit_price_cents * quantity
                const canIncrease = quantity < snapshot.stock_at_add
                return (
                  <li
                    key={product_id}
                    className="bg-[var(--color-card)] rounded-xl p-3 flex gap-3"
                  >
                    {/* Imagen */}
                    <Link
                      to={`/producto/${snapshot.slug}`}
                      onClick={closeCart}
                      className="shrink-0 w-20 h-20 bg-[var(--color-ink)] rounded-lg overflow-hidden flex items-center justify-center"
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

                    {/* Info + controles */}
                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to={`/producto/${snapshot.slug}`}
                          onClick={closeCart}
                          className="font-[var(--font-cond)] text-sm font-semibold text-[var(--color-cream)] leading-tight line-clamp-2 hover:text-[var(--color-lavender)] transition-colors"
                        >
                          {snapshot.name}
                        </Link>
                        <button
                          onClick={() => removeItem(product_id)}
                          className="shrink-0 p-1 rounded text-[var(--color-mid)] hover:text-[var(--color-brand-red)] transition-colors"
                          aria-label={`Eliminar ${snapshot.name}`}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>

                      {snapshot.size_label && (
                        <span className="text-xs font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)]">
                          Talla {snapshot.size_label}
                        </span>
                      )}

                      <div className="mt-auto flex items-center justify-between">
                        {/* Selector cantidad */}
                        <div className="inline-flex items-center gap-1 bg-[var(--color-ink-deep)] rounded-lg border border-[var(--color-card)]">
                          <button
                            onClick={() =>
                              updateQuantity(product_id, quantity - 1)
                            }
                            className="px-2 py-1 text-[var(--color-mid)] hover:text-[var(--color-cream)] disabled:opacity-40 disabled:cursor-not-allowed"
                            disabled={quantity <= 1}
                            aria-label="Disminuir cantidad"
                          >
                            <Minus size={14} aria-hidden="true" />
                          </button>
                          <span className="min-w-[24px] text-center font-[var(--font-cond)] text-sm text-[var(--color-cream)] tabular-nums">
                            {quantity}
                          </span>
                          <button
                            onClick={() =>
                              updateQuantity(product_id, quantity + 1)
                            }
                            className="px-2 py-1 text-[var(--color-mid)] hover:text-[var(--color-cream)] disabled:opacity-40 disabled:cursor-not-allowed"
                            disabled={!canIncrease}
                            aria-label="Aumentar cantidad"
                            title={
                              !canIncrease
                                ? 'Stock máximo alcanzado'
                                : undefined
                            }
                          >
                            <Plus size={14} aria-hidden="true" />
                          </button>
                        </div>
                        {/* Línea total */}
                        <span className="font-[var(--font-display)] text-base text-[var(--color-lavender)] tracking-wide tabular-nums">
                          {fmtEuros(lineTotalCents)} €
                        </span>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>

            {/* Footer */}
            <footer className="border-t border-[var(--color-card)] px-5 py-4 space-y-3 bg-[var(--color-ink-deep)]">
              <div className="flex items-baseline justify-between">
                <span className="font-[var(--font-cond)] text-sm uppercase tracking-widest text-[var(--color-mid)]">
                  Subtotal
                </span>
                <span className="font-[var(--font-display)] text-2xl text-[var(--color-cream)] tracking-wide tabular-nums">
                  {fmtEuros(subtotalCents)} €
                </span>
              </div>
              <p className="text-[11px] font-[var(--font-cond)] text-[var(--color-mid)] tracking-wide">
                Envío e impuestos calculados en el checkout.
              </p>
              <div className="flex flex-col gap-2 pt-1">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={goToCart}
                  className="w-full font-[var(--font-display)] tracking-widest"
                >
                  Tramitar pedido
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={closeCart}
                  className="w-full"
                >
                  Seguir comprando
                </Button>
              </div>
            </footer>
          </>
        )}
      </aside>
    </>
  )
}
