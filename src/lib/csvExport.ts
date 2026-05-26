/**
 * Utilidades para exportar pedidos a CSV compatible con Correos Express / DHL.
 *
 * El formato resultante:
 *   - Separador: coma (`,`).
 *   - Encierra entre comillas dobles cualquier campo con `,`, `"`, salto de línea
 *     o punto y coma. Las comillas internas se escapan duplicándolas.
 *   - Total en formato español ("12,50") porque la coma es decimal habitual en
 *     plantillas de transportistas españoles. Como el campo va entre comillas el
 *     parser respeta el contenido literal.
 *   - Se antepone BOM UTF-8 (` `) para que Excel detecte UTF-8 al abrir.
 *
 * NOTA sobre el peso: `order_items` no guarda snapshot de `weight_grams`. Para
 * calcular el peso real necesitamos hacer un join con la tabla `products` usando
 * `product_id`. Si un order_item tiene `product_id` nulo (producto eliminado) o
 * el producto no tiene `weight_grams` definido, el peso de esa línea se cuenta
 * como 0 y la fila completa puede acabar con 0. El admin deberá completar el
 * peso manualmente en el portal del transportista en esos casos.
 *
 * TODO: añadir columna `weight_grams_snapshot` a `order_items` en una migración
 * futura para no depender del estado actual de `products`.
 */

export interface CsvOrderLike {
  order_number: string
  customer_first_name: string
  customer_last_name: string
  customer_email: string
  customer_phone: string
  shipping_address: string | null
  shipping_city: string | null
  shipping_postal_code: string | null
  shipping_province: string | null
  shipping_notes: string | null
  total_cents: number
}

export interface CsvOrderItem {
  product_name: string
  product_size_label: string | null
  quantity: number
  /** Peso unitario en gramos. Si no está disponible, 0. */
  weight_grams: number | null
}

const CSV_HEADERS = [
  'Numero Pedido',
  'Nombre',
  'Apellidos',
  'Email',
  'Telefono',
  'Direccion',
  'Ciudad',
  'Codigo Postal',
  'Provincia',
  'Pais',
  'Notas',
  'Peso Total (gr)',
  'Total (EUR)',
  'Items',
]

/**
 * Escapa un campo para CSV. Si contiene caracteres especiales lo envuelve en
 * comillas dobles y duplica las comillas internas.
 */
function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",;\r\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

/**
 * Formatea cents en formato español: 1250 → "12,50".
 */
function formatTotalEs(cents: number): string {
  const eur = cents / 100
  return eur.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  })
}

/**
 * Construye el resumen de items como "Casco MET M x1 + Guantes XL x2".
 */
function buildItemsSummary(items: CsvOrderItem[]): string {
  return items
    .map(it => {
      const size = it.product_size_label ? ` ${it.product_size_label}` : ''
      return `${it.product_name}${size} x${it.quantity}`
    })
    .join(' + ')
}

/**
 * Suma peso total en gramos. Si un item tiene `weight_grams` null, cuenta como 0.
 */
function sumWeight(items: CsvOrderItem[]): number {
  return items.reduce((acc, it) => acc + (it.weight_grams ?? 0) * it.quantity, 0)
}

export interface CsvRowInput {
  order: CsvOrderLike
  items: CsvOrderItem[]
}

/**
 * Genera el CSV completo (con BOM y headers) a partir de la lista de pedidos.
 */
export function buildOrdersCsv(rows: CsvRowInput[]): string {
  const lines: string[] = []
  lines.push(CSV_HEADERS.map(csvEscape).join(','))

  for (const { order, items } of rows) {
    const fields = [
      order.order_number,
      order.customer_first_name,
      order.customer_last_name,
      order.customer_email,
      order.customer_phone,
      order.shipping_address ?? '',
      order.shipping_city ?? '',
      order.shipping_postal_code ?? '',
      order.shipping_province ?? '',
      'España',
      order.shipping_notes ?? '',
      String(sumWeight(items)),
      formatTotalEs(order.total_cents),
      buildItemsSummary(items),
    ]
    lines.push(fields.map(csvEscape).join(','))
  }

  // BOM UTF-8 + CRLF para máxima compatibilidad con Excel en Windows.
  return ' ' + lines.join('\r\n') + '\r\n'
}

/**
 * Dispara la descarga del CSV en el navegador.
 */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Liberar el blob URL en el siguiente tick.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Nombre de archivo estándar: `pedidos-envio-YYYY-MM-DD.csv`.
 */
export function defaultCsvFilename(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `pedidos-envio-${y}-${m}-${d}.csv`
}
