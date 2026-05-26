import { useEffect, useRef } from 'react'
import { clsx } from 'clsx'
import { X } from 'lucide-react'

type ModalSize = 'sm' | 'md' | 'lg'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: ModalSize
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        className={clsx(
          'relative w-full bg-[var(--color-card)] border border-[var(--color-mid)]/30 rounded-2xl shadow-2xl',
          'animate-[fadeup_0.25s_ease_forwards]',
          'max-h-[calc(100vh-2rem)] flex flex-col',
          sizeClasses[size],
        )}
      >
        {/* Header siempre presente: tiene el botón cerrar incluso sin title. */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[var(--color-mid)]/20 shrink-0">
          {title && (
            <h2
              id="modal-title"
              className="text-xl font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide"
            >
              {title}
            </h2>
          )}
          <button
            onClick={onClose}
            className="ml-auto p-1.5 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[var(--color-mid)]/20 transition-colors"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1 min-h-0">{children}</div>
      </div>
    </div>
  )
}
