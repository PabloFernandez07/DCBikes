import { forwardRef } from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variants: Record<Variant, string> = {
  primary:
    'bg-[var(--color-lavender)] text-[var(--color-ink)] font-semibold hover:brightness-110 active:brightness-95',
  secondary:
    'border border-[var(--color-lavender)] text-[var(--color-lavender)] bg-transparent hover:bg-[rgba(196,162,207,0.12)] active:bg-[rgba(196,162,207,0.2)]',
  ghost:
    'text-[var(--color-lavender)] bg-transparent hover:bg-[rgba(196,162,207,0.08)] active:bg-[rgba(196,162,207,0.16)]',
  danger:
    'bg-[var(--color-brand-red)] text-white hover:brightness-110 active:brightness-90',
}

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-md',
  md: 'px-5 py-2.5 text-base rounded-lg',
  lg: 'px-7 py-3.5 text-lg rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={twMerge(
          clsx(
            'inline-flex items-center justify-center gap-2 font-[var(--font-cond)] transition-all duration-200 cursor-pointer select-none',
            variants[variant],
            sizes[size],
            (disabled || loading) && 'opacity-50 cursor-not-allowed',
            className,
          ),
        )}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin h-4 w-4 shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'
