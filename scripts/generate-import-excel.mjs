// scripts/generate-import-excel.mjs
//
// Lee el Excel original (estudio_rentabilidad_bicis_COMPLETO.xlsx) y genera
// un Excel listo para importar en la app, con columnas adicionales:
//   - Descripción corta (autogenerada por familia + características)
//   - Descripción completa (autogenerada por familia + características)
//   - Marca (heurística extracción del nombre)
//   - Talla (extraída del nombre — reusa la lógica de excel-grouping.ts)
//   - Grupo Modelo (slug del nombre sin talla)
//   - Peso (g) (estimación por familia, editable después)
//   - Referencia (SKU) (autogenerado si no hay)
//
// Ejecutar: node scripts/generate-import-excel.mjs
// Output: Docs/productos-importar.xlsx

import XLSX from 'xlsx'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = join(__dirname, '..')

const INPUT = join(ROOT, 'Docs/estudio_rentabilidad_bicis_COMPLETO.xlsx')
const OUTPUT = join(ROOT, 'Docs/productos-importar.xlsx')

// ─── Marcas conocidas en ciclismo (orden de prioridad) ───────────────────
const KNOWN_BRANDS = [
  'GIANT', 'LIV', 'MET', 'SHIMANO', 'SRAM', 'SCOTT', 'TREK', 'SPECIALIZED',
  'CANNONDALE', 'MERIDA', 'ORBEA', 'BH', 'CUBE', 'BIANCHI', 'PINARELLO',
  'COLNAGO', 'CERVELO', 'CASTELLI', 'ASSOS', 'GORE', 'FOX', 'TROY LEE',
  'POC', 'BELL', 'GIRO', 'KASK', 'ABUS', 'LAZER', 'ALPINESTARS', 'ENDURA',
  'GOBIK', 'INVERSE', 'GIST', 'MASSI', 'PROLOGO', 'PRO', 'SELLE', 'FIZIK',
  'BBB', 'TOPEAK', 'PARK TOOL', 'CONTINENTAL', 'MICHELIN', 'MAXXIS',
  'VITTORIA', 'SCHWALBE', 'HUTCHINSON', 'MAVIC', 'DT SWISS', 'ZIPP',
  'CRANKBROTHERS', 'TIME', 'LOOK', 'WAHOO', 'GARMIN', 'POLAR', 'SUUNTO',
  'CAMPAGNOLO', 'RACE FACE', 'CHRIS KING', 'HOPE', 'MAGURA', 'TEKTRO',
  'HAYES', 'AVID', 'TRP', 'KMC', 'ELITE', 'TACX', 'KICKR', 'ZWIFT',
  'LEZYNE', 'BLACKBURN', 'VELOX', 'WD-40', 'MUC-OFF', 'FINISH LINE',
  'PEDROS', 'HIGH5', 'POWERBAR', 'OVERSTIMS', 'PRO ACTION', 'NAMED',
  'ETIXX', 'ISOSTAR', 'OVO', 'VICTORY', 'BIORACER', 'SPORTFUL', 'AGU',
  'LEPOKO', 'ORHI', 'ARRI', 'BUSTI', 'REV', 'AGILIS', 'PANTHER', 'RINCON',
]

// Disciplinas ciclistas para inferir uso
const DISCIPLINES = {
  carretera: ['ROAD', 'CARRETERA', 'AERO', 'TT'],
  montana: ['MTB', 'MONTAÑA', 'MOUNTAIN', 'TRAIL', 'XC', 'ENDURO', 'DH', 'DOWNHILL'],
  gravel: ['GRAVEL', 'CYCLOCROSS', 'CX'],
  urbana: ['URBANO', 'CITY', 'COMMUTER'],
  ninos: ['NIÑO', 'KID', 'JUNIOR', 'CHILD'],
  electrica: ['EBIKE', 'E-BIKE', 'ELECTRIC', 'BAFANG', 'BOSCH', 'YAMAHA'],
}

// Colores conocidos (orden importante — los compuestos primero)
const COLORS = [
  'NEGRO MATE', 'BLANCO MATE', 'GRIS MATE', 'AZUL NAVY', 'VERDE OLIVA',
  'AMARILLO FLUOR', 'NARANJA FLUOR', 'ROSA PASTEL',
  'BLANCO', 'NEGRO', 'GRIS', 'ROJO', 'AZUL', 'VERDE', 'AMARILLO',
  'BURDEOS', 'NARANJA', 'MARRON', 'ROSA', 'PLATA', 'DORADO',
  'WHITE', 'BLACK', 'GREY', 'GRAY', 'SILVER',
]

// Tallas detectables (orden: combinadas primero)
const SIZE_PATTERNS = [
  /\b(XXXL|XXL|XL|L|M|S|XS|XXS)\b/i,                  // ropa
  /\b(2[8-9]|[34][0-9]|50)(?:[.,]\d)?\b/,             // calzado 28-50
]

// Palabras clave a NO confundir como talla letra
const NOT_SIZES = ['MM', 'MIPS', 'TLR', 'TL', 'EVO', 'PRO', 'RS', 'V', 'GR']

// Estimaciones de peso por familia (gramos) — el admin las puede ajustar
const WEIGHT_BY_FAMILY = {
  'Cascos': 320,
  'Calzado': 700,
  'Ropa': 250,
  'Alimentacion': 60,
  'Accesorios y recambios': 200,
  'Taller propio': 150,
  'Bicis Montaña': 12000,
  'Bicis Carretera': 8000,
  'Bicis Gravel': 9000,
  'Bicis': 10000,
  'Bicis Eléctricas': 22000,
  'Alquiler': 0,
}

// ─── Helpers de extracción ───────────────────────────────────────────────

function normalize(str) {
  return String(str || '').trim()
}

function detectBrand(name) {
  const upper = name.toUpperCase()
  for (const brand of KNOWN_BRANDS) {
    const pattern = new RegExp('\\b' + brand.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'i')
    if (pattern.test(upper)) return brand
  }
  return ''
}

function detectColor(name) {
  const upper = name.toUpperCase()
  for (const color of COLORS) {
    const pattern = new RegExp('\\b' + color + '\\b', 'i')
    if (pattern.test(upper)) {
      return color
        .toLowerCase()
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    }
  }
  return ''
}

function detectSize(name) {
  // Talla numérica calzado (28-50)
  const numMatch = name.match(/\b(2[8-9]|[34][0-9]|50)\b/)
  if (numMatch && !/MM|CM/i.test(name.substring(numMatch.index, numMatch.index + 6))) {
    return numMatch[1]
  }
  // Talla letras
  const tokens = name.toUpperCase().split(/\s+/)
  for (const token of tokens) {
    if (/^(XXXL|XXL|XL|L|M|S|XS|XXS)$/.test(token) && !NOT_SIZES.includes(token)) {
      return token
    }
  }
  return ''
}

function detectDiscipline(name) {
  const upper = name.toUpperCase()
  for (const [key, words] of Object.entries(DISCIPLINES)) {
    for (const w of words) {
      if (upper.includes(w)) return key
    }
  }
  return ''
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60)
}

function buildModelGroup(name, size, color) {
  // Quita talla y color al final/medio para obtener el modelo base
  let base = name
  if (size) {
    base = base.replace(new RegExp('\\s+' + size + '\\b', 'gi'), '')
  }
  if (color) {
    base = base.replace(new RegExp('\\s+' + color + '\\b', 'gi'), '')
  }
  const slug = slugify(base)
  return slug.length >= 3 ? slug : ''
}

function generateSku(name, ean) {
  if (ean && String(ean).trim()) return String(ean).trim().substring(0, 20)
  return slugify(name).toUpperCase().substring(0, 20)
}

// ─── Plantillas descripción por familia ──────────────────────────────────

const FAMILY_DESCRIPTIONS = {
  Cascos: {
    short: (ctx) => {
      const parts = []
      parts.push(`Casco de ciclismo${ctx.brand ? ' ' + ctx.brand : ''}`)
      if (ctx.color) parts.push(`color ${ctx.color}`)
      if (ctx.size) parts.push(`talla ${ctx.size}`)
      const mips = /MIPS/i.test(ctx.name) ? '. Sistema MIPS de seguridad.' : ''
      return (parts.join(', ') + mips).substring(0, 160)
    },
    long: (ctx) => {
      const mips = /MIPS/i.test(ctx.name)
      const disc = ctx.discipline === 'montana' ? 'BTT, descenso y enduro' : ctx.discipline === 'carretera' ? 'carretera y entrenamientos de larga distancia' : 'ciclismo en general'
      return [
        `Casco técnico${ctx.brand ? ' de la marca ' + ctx.brand : ''} diseñado para ${disc}.`,
        ctx.color ? `Acabado en color ${ctx.color.toLowerCase()}.` : '',
        ctx.size ? `Talla ${ctx.size}, regulación interna ajustable.` : '',
        mips ? 'Incorpora tecnología MIPS (Multi-directional Impact Protection System) para reducir las fuerzas rotacionales en caso de impacto.' : '',
        'Estructura ligera con ventilación optimizada. Cumple normativa europea CE EN 1078.',
        'Pruébatelo en tienda para una talla óptima.',
      ].filter(Boolean).join(' ')
    },
  },
  Calzado: {
    short: (ctx) => {
      return `Zapatillas de ciclismo${ctx.brand ? ' ' + ctx.brand : ''}${ctx.size ? ' talla ' + ctx.size : ''}${ctx.color ? ' en ' + ctx.color.toLowerCase() : ''}. Suela rígida.`.substring(0, 160)
    },
    long: (ctx) => {
      return [
        `Zapatillas técnicas de ciclismo${ctx.brand ? ' ' + ctx.brand : ''}.`,
        ctx.size ? `Número ${ctx.size} (talla española).` : '',
        ctx.color ? `Color ${ctx.color.toLowerCase()}.` : '',
        'Suela rígida para máxima transferencia de potencia al pedal.',
        'Cierre ajustable, refuerzos en zonas de fricción y materiales transpirables.',
        'Compatible con calas estándar SPD y SPD-SL (consulta compatibilidad exacta antes de comprar).',
      ].filter(Boolean).join(' ')
    },
  },
  Ropa: {
    short: (ctx) => {
      return `Prenda técnica de ciclismo${ctx.brand ? ' ' + ctx.brand : ''}${ctx.size ? ' talla ' + ctx.size : ''}${ctx.color ? ' ' + ctx.color.toLowerCase() : ''}.`.substring(0, 160)
    },
    long: (ctx) => {
      return [
        `Prenda técnica de ciclismo${ctx.brand ? ' de la marca ' + ctx.brand : ''}.`,
        ctx.size ? `Talla ${ctx.size}.` : '',
        ctx.color ? `Acabado en color ${ctx.color.toLowerCase()}.` : '',
        'Tejido transpirable de secado rápido con tratamiento anti-olor.',
        'Cortes ergonómicos para máxima libertad de movimiento sobre la bicicleta.',
        'Lavar a máquina a baja temperatura, sin suavizante.',
      ].filter(Boolean).join(' ')
    },
  },
  Alimentacion: {
    short: (ctx) => `${ctx.name}. Suplemento deportivo para hidratación y energía.`.substring(0, 160),
    long: (ctx) => [
      `${ctx.name}.`,
      'Producto pensado para deportistas: aporta carbohidratos de asimilación rápida, electrolitos y/o aminoácidos según formato.',
      'Ideal antes, durante o después del entrenamiento para mantener el rendimiento y favorecer la recuperación.',
      'Consulta la información nutricional en el envase. Conservar en lugar fresco y seco.',
    ].join(' '),
  },
  'Accesorios y recambios': {
    short: (ctx) => `${ctx.name}.${ctx.brand ? ' Marca ' + ctx.brand + '.' : ''} Repuesto original o compatible.`.substring(0, 160),
    long: (ctx) => [
      `${ctx.name}.`,
      ctx.brand ? `Fabricado por ${ctx.brand}.` : '',
      'Componente de calidad para mantenimiento, reparación o mejora de tu bicicleta.',
      'Consulta compatibilidad con tu modelo antes de comprar. Si tienes dudas, contacta con nosotros y te asesoramos.',
      'Disponible para instalación en nuestro taller (servicio aparte).',
    ].filter(Boolean).join(' '),
  },
  'Taller propio': {
    short: (ctx) => `${ctx.name}. Herramienta o servicio de taller.`.substring(0, 160),
    long: (ctx) => [
      `${ctx.name}.`,
      'Producto de uso profesional para taller o uso especializado.',
      'Si se trata de un servicio, contacta con nosotros para concertar cita y presupuesto.',
    ].join(' '),
  },
  default: {
    short: (ctx) => `${ctx.name}${ctx.brand && !ctx.name.toUpperCase().includes(ctx.brand) ? ' · ' + ctx.brand : ''}.`.substring(0, 160),
    long: (ctx) => `${ctx.name}. Consulta disponibilidad y características en tienda o contacta con nosotros para más información.`,
  },
}

function pickDescriptionTemplate(family) {
  if (FAMILY_DESCRIPTIONS[family]) return FAMILY_DESCRIPTIONS[family]
  if (family && family.toLowerCase().startsWith('bicis')) {
    return {
      short: (ctx) => {
        // Evita "Bicicleta Bicicleta X" si el nombre ya empieza por "Bicicleta"
        const prefix = /^bicicleta\b/i.test(ctx.name) ? '' : 'Bicicleta '
        return `${prefix}${ctx.name}.${ctx.brand ? ' Marca ' + ctx.brand + '.' : ''}`.substring(0, 160)
      },
      long: () => 'Bicicleta disponible para venta en tienda física. Consulta disponibilidad, geometría, talla y precio actualizado contactando con nosotros. Ofrecemos asesoramiento personalizado y prueba previa a la compra.',
    }
  }
  return FAMILY_DESCRIPTIONS.default
}

// ─── Main ────────────────────────────────────────────────────────────────

function main() {
  console.log('▶ Leyendo Excel original:', INPUT)
  const wb = XLSX.readFile(INPUT)
  const ws = wb.Sheets['Catálogo']
  if (!ws) throw new Error('No se encuentra la hoja "Catálogo".')

  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: null, header: 1 })
  // Fila 0 = título, fila 1 = vacía, fila 2 = cabeceras, fila 3+ = datos
  const dataRows = rawRows.slice(3).filter(r => r[0] && String(r[0]).trim() !== '')

  console.log(`▶ Filas de datos: ${dataRows.length}`)

  const stats = { sizesDetected: 0, brandsDetected: 0, colorsDetected: 0, groupsFormed: new Set() }

  const out = dataRows.map(r => {
    const name = normalize(r[0])
    const tipo = normalize(r[1])
    const familia = normalize(r[2])
    const pvp = r[3]
    const coste = r[4]
    const stock = r[12]
    const ean = r[13] ? String(r[13]).replace(/\.0$/, '') : ''

    const brand = detectBrand(name)
    const color = detectColor(name)
    const size = detectSize(name)
    const discipline = detectDiscipline(name)
    const modelGroup = size ? buildModelGroup(name, size, color) : ''

    if (brand) stats.brandsDetected++
    if (color) stats.colorsDetected++
    if (size) stats.sizesDetected++
    if (modelGroup) stats.groupsFormed.add(modelGroup)

    const ctx = { name, brand, color, size, discipline }
    const tpl = pickDescriptionTemplate(familia)

    return {
      'Nombre': name,
      'Familia': familia,
      'Tipo': tipo,
      'Marca': brand,
      'Descripcion Corta': tpl.short(ctx),
      'Descripcion Completa': tpl.long(ctx),
      'Referencia (SKU)': generateSku(name, ean),
      'EAN': ean,
      'PVP c/IVA': pvp ?? 0,
      'Coste s/IVA': coste ?? 0,
      'Stock': stock ?? 0,
      'Talla': size,
      'Grupo Modelo': modelGroup,
      'Color': color,
      'Peso (g)': WEIGHT_BY_FAMILY[familia] ?? 200,
      'Activo': tipo === 'Tienda' && familia !== 'Alquiler' ? 'SI' : 'NO',
      'Comprar Online': 'NO',  // admin lo activa producto a producto
    }
  })

  // Crear workbook nuevo
  const outWs = XLSX.utils.json_to_sheet(out)
  // Anchos de columna razonables
  outWs['!cols'] = [
    { wch: 50 },  // Nombre
    { wch: 22 },  // Familia
    { wch: 10 },  // Tipo
    { wch: 14 },  // Marca
    { wch: 55 },  // Desc Corta
    { wch: 80 },  // Desc Completa
    { wch: 22 },  // SKU
    { wch: 16 },  // EAN
    { wch: 10 },  // PVP
    { wch: 10 },  // Coste
    { wch: 8 },   // Stock
    { wch: 8 },   // Talla
    { wch: 30 },  // Grupo Modelo
    { wch: 14 },  // Color
    { wch: 10 },  // Peso
    { wch: 8 },   // Activo
    { wch: 14 },  // Comprar Online
  ]

  const outWb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(outWb, outWs, 'Productos')

  // Hoja README con instrucciones
  const readmeWs = XLSX.utils.aoa_to_sheet([
    ['INSTRUCCIONES DE IMPORTACIÓN — DC Bikes Cantabria'],
    [],
    ['Este archivo está listo para importar desde el admin (/admin/importar).'],
    [],
    ['COLUMNAS:'],
    ['• Nombre: nombre completo del producto. OBLIGATORIO.'],
    ['• Familia: categoría comercial. Se crea automáticamente si no existe en BD.'],
    ['• Tipo: "Tienda" (visible en catálogo público si Activo=SI) o "Taller" (interno).'],
    ['• Marca: extraída del nombre. Editable manualmente si está mal detectada.'],
    ['• Descripcion Corta: máximo 160 caracteres, aparece bajo el nombre en el catálogo.'],
    ['• Descripcion Completa: texto largo de la ficha de producto.'],
    ['• Referencia (SKU): identificador interno único. Se autogenera si no se conoce.'],
    ['• EAN: código de barras de 13 dígitos. Vacío si no se tiene.'],
    ['• PVP c/IVA: precio final con IVA incluido (€).'],
    ['• Coste s/IVA: coste interno sin IVA. Para márgenes admin.'],
    ['• Stock: unidades disponibles. 0 = agotado.'],
    ['• Talla: S/M/L/XL/XXL o talla numérica (38, 42, etc.). Vacío si producto sin tallas.'],
    ['• Grupo Modelo: agrupa todas las tallas del mismo modelo en una sola tarjeta del catálogo.'],
    ['• Color: variante de color.'],
    ['• Peso (g): para cálculo de envío (estimación inicial, ajusta si lo conoces).'],
    ['• Activo: SI/NO. Si NO, no aparece en catálogo público.'],
    ['• Comprar Online: SI/NO. Si NO, solo consulta en tienda física (sin carrito).'],
    [],
    ['NOTAS:'],
    ['• Las descripciones se han generado automáticamente. Revisa y mejora las más importantes.'],
    ['• La columna "Talla" se ha extraído del nombre con heurística. Verifica resultados.'],
    ['• Activo está en SI para productos Tienda (excluye Taller y Alquiler).'],
    ['• Comprar Online está en NO por defecto. Activa producto a producto desde admin.'],
  ])
  readmeWs['!cols'] = [{ wch: 100 }]
  XLSX.utils.book_append_sheet(outWb, readmeWs, 'README')

  console.log('▶ Escribiendo Excel:', OUTPUT)
  XLSX.writeFile(outWb, OUTPUT)

  console.log('\n✓ Generación completada')
  console.log(`  • Productos: ${out.length}`)
  console.log(`  • Marcas detectadas: ${stats.brandsDetected}`)
  console.log(`  • Colores detectados: ${stats.colorsDetected}`)
  console.log(`  • Tallas detectadas: ${stats.sizesDetected}`)
  console.log(`  • Grupos modelo formados: ${stats.groupsFormed.size}`)
  console.log(`  • Activos (visibles catálogo): ${out.filter(p => p.Activo === 'SI').length}`)
  console.log('\nOutput:', OUTPUT)
}

main()
