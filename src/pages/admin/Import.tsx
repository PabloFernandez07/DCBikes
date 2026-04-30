import { ExcelImporter } from '@/components/admin/ExcelImporter'

export function Import() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest">
          IMPORTAR PRODUCTOS
        </h1>
        <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
          Sube un archivo XLS, XLSX o CSV exportado de TPVinforpyme
        </p>
      </div>

      {/* Importer */}
      <div className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6">
        <ExcelImporter />
      </div>
    </div>
  )
}
