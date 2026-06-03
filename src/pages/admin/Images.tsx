import { useState } from 'react'
import { clsx } from 'clsx'
import { FolderUp, Link2 } from 'lucide-react'
import { BulkImageUploader } from '@/components/admin/BulkImageUploader'
import { UrlImageImporter } from '@/components/admin/UrlImageImporter'

type Tab = 'files' | 'urls'

export function Images() {
  const [tab, setTab] = useState<Tab>('files')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest">
          IMÁGENES DE PRODUCTOS
        </h1>
        <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
          Sube fotos desde tu equipo o impórtalas automáticamente desde un Excel de URLs
        </p>
      </div>

      <div className="flex gap-2 border-b border-[var(--color-card-hover)] overflow-x-auto">
        <TabBtn active={tab === 'files'} onClick={() => setTab('files')} icon={FolderUp} label="Subir archivos" />
        <TabBtn active={tab === 'urls'} onClick={() => setTab('urls')} icon={Link2} label="Importar desde Excel de URLs" />
      </div>

      <div className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6">
        {tab === 'files' ? <BulkImageUploader /> : <UrlImageImporter />}
      </div>
    </div>
  )
}

function TabBtn({
  active, onClick, icon: Icon, label,
}: {
  active: boolean
  onClick: () => void
  icon: typeof FolderUp
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        '-mb-px flex items-center gap-2 px-4 py-2.5 text-sm font-[var(--font-cond)] tracking-wide border-b-2 transition-colors whitespace-nowrap shrink-0',
        active
          ? 'border-[var(--color-lavender)] text-[var(--color-lavender)]'
          : 'border-transparent text-[var(--color-mid)] hover:text-[var(--color-cream)]',
      )}
    >
      <Icon size={15} aria-hidden="true" />
      {label}
    </button>
  )
}
