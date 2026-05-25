import { clsx } from 'clsx'

type Period = '7d' | '30d' | '90d'

interface ChartCardProps {
  title: string
  children: React.ReactNode
  loading?: boolean
  period?: Period
  onPeriodChange?: (p: Period) => void
}

const PERIODS: Period[] = ['7d', '30d', '90d']
const PERIOD_LABELS: Record<Period, string> = {
  '7d': '7 días',
  '30d': '30 días',
  '90d': '90 días',
}

export function ChartCard({
  title,
  children,
  loading,
  period,
  onPeriodChange,
}: ChartCardProps) {
  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
          {title}
        </h3>

        {period && onPeriodChange && (
          <div className="flex items-center gap-1 bg-[var(--color-ink)] rounded-lg p-0.5">
            {PERIODS.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => onPeriodChange(p)}
                className={clsx(
                  'px-3 py-1 rounded-md text-xs font-[var(--font-cond)] font-medium tracking-wide transition-all duration-150',
                  period === p
                    ? 'bg-[var(--color-lavender)] text-[var(--color-ink)]'
                    : 'text-[var(--color-mid)] hover:text-[var(--color-cream)]',
                )}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="h-48 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-[var(--color-lavender)] border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="w-full overflow-hidden">{children}</div>
      )}
    </div>
  )
}
