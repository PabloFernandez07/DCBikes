import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * Snapshot del producto al momento de añadirlo al carrito.
 *
 * Guardamos los datos necesarios para mostrar el item en el drawer/checkout
 * sin tener que volver a consultar la BD (si el producto cambia de precio
 * después, el carrito mantiene el snapshot — la validación de stock y precio
 * real se hace al crear el pedido en `order-place` Edge Function de Fase E).
 */
export interface CartItemSnapshot {
  name: string
  size_label: string | null
  unit_price_cents: number
  image_url: string | null
  sku: string | null
  slug: string
  stock_at_add: number
}

export interface CartItem {
  product_id: string
  quantity: number
  snapshot: CartItemSnapshot
}

interface CartState {
  items: CartItem[]
  /** Añade un item — si ya existe, incrementa quantity (respetando stock_at_add). */
  addItem: (productId: string, snapshot: CartItemSnapshot, quantity?: number) => void
  /** Elimina un item del carrito. */
  removeItem: (productId: string) => void
  /** Actualiza cantidad — si <=0, elimina. Si > stock, lo capa a stock. */
  updateQuantity: (productId: string, qty: number) => void
  /** Vacía el carrito completo. */
  clear: () => void
  /** Suma total de quantities de todos los items. */
  getItemCount: () => number
  /** Suma de unit_price_cents * quantity de todos los items. */
  getSubtotalCents: () => number
}

const CART_STORAGE_KEY = 'dcbikes_cart'
const CART_VERSION = 1

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (productId, snapshot, quantity = 1) => {
        const items = get().items
        const existing = items.find(i => i.product_id === productId)
        if (existing) {
          // Si ya existe, incrementa respetando stock_at_add del snapshot original.
          const newQty = Math.min(
            existing.quantity + quantity,
            existing.snapshot.stock_at_add,
          )
          set({
            items: items.map(i =>
              i.product_id === productId ? { ...i, quantity: newQty } : i,
            ),
          })
        } else {
          // Nuevo item — capa la quantity inicial al stock disponible.
          const safeQty = Math.max(1, Math.min(quantity, snapshot.stock_at_add))
          set({
            items: [
              ...items,
              { product_id: productId, quantity: safeQty, snapshot },
            ],
          })
        }
      },

      removeItem: productId => {
        set({ items: get().items.filter(i => i.product_id !== productId) })
      },

      updateQuantity: (productId, qty) => {
        const items = get().items
        if (qty <= 0) {
          set({ items: items.filter(i => i.product_id !== productId) })
          return
        }
        set({
          items: items.map(i =>
            i.product_id === productId
              ? { ...i, quantity: Math.min(qty, i.snapshot.stock_at_add) }
              : i,
          ),
        })
      },

      clear: () => set({ items: [] }),

      getItemCount: () =>
        get().items.reduce((acc, item) => acc + item.quantity, 0),

      getSubtotalCents: () =>
        get().items.reduce(
          (acc, item) => acc + item.snapshot.unit_price_cents * item.quantity,
          0,
        ),
    }),
    {
      name: CART_STORAGE_KEY,
      version: CART_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Si en el futuro cambiamos shape, podemos migrar aquí:
      // migrate: (persistedState, version) => { ... }
    },
  ),
)
