import { create } from 'zustand'

/**
 * Store ligero de estado UI global (no persistido).
 * Por ahora solo controla apertura del CartDrawer.
 */
interface UiState {
  isCartOpen: boolean
  openCart: () => void
  closeCart: () => void
  toggleCart: () => void
}

export const useUiStore = create<UiState>(set => ({
  isCartOpen: false,
  openCart: () => set({ isCartOpen: true }),
  closeCart: () => set({ isCartOpen: false }),
  toggleCart: () => set(s => ({ isCartOpen: !s.isCartOpen })),
}))
