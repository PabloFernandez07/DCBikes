import { forwardRef } from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement> {
  label: string
  error?: string
  required?: boolean
  as?: 'input' | 'textarea'
  rows?: number
  className?: string
}

export const Field = forwardRef<HTMLInputElement & HTMLTextAreaElement, FieldProps>(
  ({ label, error, required, as: Tag = 'input', rows = 4, className, id, ...props }, ref) => {
    const fieldId = id ?? label.toLowerCase().replace(/\s+/g, '-')

    const inputClasses = twMerge(
      clsx(
        'w-full bg-[var(--color-ink)] border rounded-lg px-4 py-2.5 text-[var(--color-cream)] placeholder-[var(--color-mid)]',
        'font-[var(--font-body)] text-sm transition-colors duration-200',
        'focus:outline-none focus:ring-2 focus:ring-[var(--color-lavender)]/50 focus:border-[var(--color-lavender)]',
        error
          ? 'border-[var(--color-brand-red)]'
          : 'border-[var(--color-card)] hover:border-[var(--color-mid)]/60',
        className,
      ),
    )

    return (
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={fieldId}
          className="text-sm font-[var(--font-cond)] font-medium text-[var(--color-cream-dim)] tracking-wide"
        >
          {label}
          {required && <span className="text-[var(--color-brand-red)] ml-0.5">*</span>}
        </label>

        {Tag === 'textarea' ? (
          <textarea
            ref={ref as React.Ref<HTMLTextAreaElement>}
            id={fieldId}
            rows={rows}
            className={twMerge(inputClasses, 'resize-none')}
            aria-invalid={!!error}
            aria-describedby={error ? `${fieldId}-error` : undefined}
            {...(props as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <input
            ref={ref as React.Ref<HTMLInputElement>}
            id={fieldId}
            className={inputClasses}
            aria-invalid={!!error}
            aria-describedby={error ? `${fieldId}-error` : undefined}
            {...(props as React.InputHTMLAttributes<HTMLInputElement>)}
          />
        )}

        {error && (
          <p id={`${fieldId}-error`} className="text-xs text-[var(--color-brand-red)] font-[var(--font-body)]">
            {error}
          </p>
        )}
      </div>
    )
  },
)

Field.displayName = 'Field'
