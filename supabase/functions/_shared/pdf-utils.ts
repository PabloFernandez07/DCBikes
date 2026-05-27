// supabase/functions/_shared/pdf-utils.ts
//
// Helpers reutilizables para generación de PDFs en Edge Functions.
//
// El font StandardFonts.Helvetica de pdf-lib usa codificación WinAnsi
// (CP-1252). WinAnsi cubre español completo (ñ, á, é, í, ó, ú, ü, ¡, ¿, €).
// Sin embargo, hay caracteres "smart" (curly quotes, em-dash, ellipsis, etc.)
// que NO están en WinAnsi y rompen drawText(). Esta función los normaliza
// a equivalentes seguros ANTES de renderizar.

/** Reemplaza caracteres no-WinAnsi (smart quotes, em-dash, ellipsis, etc.) por equivalentes ASCII/WinAnsi. */
export function sanitizeWinAnsi(input: string | null | undefined): string {
  if (input == null) return ''
  return String(input)
    // smart single quotes / apostrophes (U+2018..U+201B)
    .replace(/[‘’‚‛]/g, "'")
    // smart double quotes (U+201C..U+201F)
    .replace(/[“”„‟]/g, '"')
    // dashes: en-dash (U+2013), em-dash (U+2014), minus (U+2212)
    .replace(/[–—−]/g, '-')
    // ellipsis (U+2026)
    .replace(/…/g, '...')
    // various unicode spaces (NBSP U+00A0, en/em quad/space U+2000-U+200A,
    // narrow nbsp U+202F, medium math space U+205F, ideographic space U+3000)
    .replace(/[  -    ]/g, ' ')
    // bullets (U+2022, U+2023, U+25E6)
    .replace(/[•‣◦]/g, '*')
    // arrows (U+2190..U+21FF) → simple ascii
    .replace(/[←-⇿]/g, '->')
    // soft hyphen (U+00AD) → remove
    .replace(/­/g, '')
    // zero-width chars (U+200B..U+200D, U+FEFF)
    .replace(/[ -  ]/g, '')
    // any remaining char outside WinAnsi-safe set → '?' as last resort
    // (WinAnsi: ASCII 0x20-0x7E + Latin-1 Suppl 0xA0-0xFF + selected 0x80-0x9F)
    // Keep €(U+20AC), Š(U+0160) etc. that are in CP-1252.
    .replace(/[^\x20-\x7E -ÿ€ŠšŽžŒœŸ‰‹›™†‡ˆ˜ƒ]/g, '?')
}

/**
 * Formatea céntimos a string "1.234,56 €" estilo es-ES.
 * (Equivalente a Intl.NumberFormat es-ES EUR, pero sin depender de ICU.)
 */
export function formatEuroCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const euros = Math.floor(abs / 100)
  const centavos = abs % 100
  const eurosStr = euros
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const centavosStr = centavos.toString().padStart(2, '0')
  return `${sign}${eurosStr},${centavosStr} €`
}

/** Formatea ISO/Date a "DD/MM/YYYY" (UTC para evitar drift de timezone). */
export function formatDateDMY(iso: string | Date | null | undefined): string {
  if (!iso) return ''
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = d.getUTCFullYear()
  return `${dd}/${mm}/${yyyy}`
}

/** Construye número de factura `${PREFIX}-${YEAR}-${PADDED}`. Padding 4 dígitos, escala a 5+ si supera 9999. */
export function buildInvoiceNumber(prefix: string, year: number, n: number): string {
  const padded = n < 10000 ? n.toString().padStart(4, '0') : n.toString()
  return `${prefix}-${year}-${padded}`
}

/**
 * Una línea de desglose IVA agrupada por tipo impositivo.
 * C-12 — soporte multi-tipo IVA (21 %, 10 %, 4 %…).
 */
export interface TaxLine {
  /** Tipo impositivo en porcentaje entero o decimal, ej. 21 o 10. */
  rate_pct: number
  base_cents: number
  iva_cents: number
}

/**
 * Calcula el desglose IVA agrupado por tipo impositivo (multi-tipo).
 *
 * Cada item puede llevar su propio `tax_rate_pct`; si no lo tiene se usa `defaultRatePct`.
 * El envío (`shippingCents`) siempre tributa al tipo por defecto.
 *
 * Para cada línea: base = round(line_total / (1 + rate)), tax = line_total - base.
 * Los resultados se agrupan por tipo y se ordenan de mayor a menor tipo.
 *
 * @param items líneas con line_total_cents (PVP con IVA incluido) y tax_rate_pct opcional.
 * @param shippingCents envío con IVA (tributa al tipo por defecto).
 * @param defaultRatePct tipo IVA por defecto en %, ej. 21.
 */
export function computeTaxBreakdownMulti(
  items: { line_total_cents: number; tax_rate_pct?: number | null }[],
  shippingCents: number,
  defaultRatePct: number,
): TaxLine[] {
  const buckets = new Map<number, { base_cents: number; iva_cents: number }>()

  const addToBucket = (ratePct: number, lineCents: number) => {
    const rate = ratePct / 100
    const baseLine = Math.round(lineCents / (1 + rate))
    const ivaLine = lineCents - baseLine
    const prev = buckets.get(ratePct) ?? { base_cents: 0, iva_cents: 0 }
    buckets.set(ratePct, { base_cents: prev.base_cents + baseLine, iva_cents: prev.iva_cents + ivaLine })
  }

  for (const it of items) {
    addToBucket(it.tax_rate_pct ?? defaultRatePct, it.line_total_cents)
  }

  // Envío tributa siempre al tipo por defecto
  if (shippingCents > 0) {
    addToBucket(defaultRatePct, shippingCents)
  }

  return Array.from(buckets.entries())
    .map(([rate_pct, b]) => ({ rate_pct, base_cents: b.base_cents, iva_cents: b.iva_cents }))
    .sort((a, b) => b.rate_pct - a.rate_pct) // mayor tipo primero
}

/**
 * Agrega un array de TaxLine en el formato plano `{ base_cents, tax_cents, total_cents }`
 * para callers que no necesitan el desglose por tipo (backward-compat con callers existentes).
 */
export function summarizeTaxBreakdown(
  lines: TaxLine[],
): { base_cents: number; tax_cents: number; total_cents: number } {
  let baseSum = 0
  let ivaSum = 0
  for (const l of lines) {
    baseSum += l.base_cents
    ivaSum += l.iva_cents
  }
  return { base_cents: baseSum, tax_cents: ivaSum, total_cents: baseSum + ivaSum }
}

/**
 * Desglose IVA exacto en céntimos a partir de líneas con precio PVP (con IVA incluido).
 *
 * Para cada línea: base_line = round(line_total / (1 + rate)), tax_line = line_total - base_line.
 * Suma todas las líneas → totales. Garantiza base + tax = subtotal exacto al céntimo.
 *
 * Para el envío (también con IVA incluido): mismo cálculo, sumado al total.
 *
 * Backward-compat: asume un único tipo IVA (`taxRatePct`).
 * Para multi-tipo usa `computeTaxBreakdownMulti` + `summarizeTaxBreakdown`.
 *
 * @param items líneas con line_total_cents (con IVA).
 * @param shippingCents envío con IVA.
 * @param taxRatePct ej. 21 (no 0.21).
 */
export function computeTaxBreakdown(
  items: { line_total_cents: number }[],
  shippingCents: number,
  taxRatePct: number,
): { base_cents: number; tax_cents: number; total_cents: number } {
  const lines = computeTaxBreakdownMulti(items, shippingCents, taxRatePct)
  return summarizeTaxBreakdown(lines)
}
