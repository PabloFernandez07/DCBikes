import { clsx } from 'clsx'
import { CheckCircle, XCircle, Info, X } from 'lucide-react'
import type { Toast as ToastItem, ToastType } from '@/hooks/useToast'

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={18} className="shrink-0" aria-hidden="true" />,
  error: <XCircle size={18} className="shrink-0" aria-hidden="true" />,
  info: <Info size={18} className="shrink-0" aria-hidden="true" />,
}

const colors: Record<ToastType, string> = {
  success: 'bg-green-900/80 border-green-500/40 text-green-200',
  error: 'bg-red-900/80 border-red-500/40 text-red-200',
  info: 'bg-[var(--color-card)] border-[var(--color-lavender)]/40 text-[var(--color-cream)]',
}

interface ToastItemProps {
  toast: ToastItem
  onDismiss: (id: string) => void
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className={clsx(
        'flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-sm',
        'animate-[fadeup_0.3s_ease_forwards] w-full sm:w-auto sm:min-w-[260px] sm:max-w-sm',
        colors[toast.type],
      )}
    >
      {icons[toast.type]}
      <p className="text-sm font-[var(--font-body)] flex-1">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="ml-2 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Cerrar notificación"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

interface ToastContainerProps {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div
      aria-label="Notificaciones"
      className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 z-[100] flex flex-col gap-3 pointer-events-none"
    >
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  )
}
