import { useState, useCallback, useMemo } from 'react'

export type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  type: ToastType
  message: string
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => dismiss(id), 4000)
  }, [dismiss])

  // Memoizado: si no, cada render crea nueva referencia y rompe useCallback/useEffect deps de los consumidores (bucle infinito en componentes que ponen `toast` en deps).
  const toast = useMemo(() => ({
    success: (message: string) => addToast('success', message),
    error: (message: string) => addToast('error', message),
    info: (message: string) => addToast('info', message),
  }), [addToast])

  return { toasts, toast, dismiss }
}
