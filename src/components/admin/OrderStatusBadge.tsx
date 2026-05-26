import { clsx } from 'clsx'
import { Bell } from 'lucide-react'

export type OrderStatus =
  | 'pending'
  | 'authorized'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'ready_pickup'
  | 'shipped'
  | 'delivered'
  | 'returned'
  | 'payment_failed'

interface StatusMeta {
  label: string
  className: string
  highlight?: boolean
}

export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
  pending: {
    label: 'Pendiente pago',
    className: 'bg-[var(--color-card-hover)] text-[var(--color-cream-dim)] border-[var(--color-mid)]/20',
  },
  authorized: {
    label: 'Pendiente aprobación',
    className: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
    highlight: true,
  },
  accepted: {
    label: 'Aceptado',
    className: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  },
  rejected: {
    label: 'Rechazado',
    className: 'bg-[var(--color-brand-red)]/15 text-[var(--color-brand-red)] border-[var(--color-brand-red)]/30',
  },
  cancelled: {
    label: 'Cancelado',
    className: 'bg-[var(--color-ink)] text-[var(--color-mid)] border-[var(--color-mid)]/30',
  },
  ready_pickup: {
    label: 'Listo para recoger',
    className: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  },
  shipped: {
    label: 'Enviado',
    className: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  },
  delivered: {
    label: 'Entregado',
    className: 'bg-green-500/15 text-green-400 border-green-500/30',
  },
  returned: {
    label: 'Devuelto',
    className: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  },
  payment_failed: {
    label: 'Pago fallido',
    className: 'bg-red-900/30 text-red-300 border-red-700/40',
  },
}

interface OrderStatusBadgeProps {
  status: OrderStatus
  size?: 'sm' | 'md'
  className?: string
}

export function OrderStatusBadge({ status, size = 'sm', className }: OrderStatusBadgeProps) {
  const meta = ORDER_STATUS_META[status]
  if (!meta) {
    return (
      <span
        className={clsx(
          'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-[var(--font-cond)] font-medium tracking-wide border',
          'bg-[var(--color-card-hover)] text-[var(--color-cream-dim)] border-[var(--color-mid)]/20',
          className,
        )}
      >
        {status}
      </span>
    )
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-[var(--font-cond)] font-medium tracking-wide border',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
        meta.className,
        className,
      )}
    >
      {meta.highlight && <Bell size={size === 'sm' ? 11 : 13} className="shrink-0" />}
      {meta.label}
    </span>
  )
}
