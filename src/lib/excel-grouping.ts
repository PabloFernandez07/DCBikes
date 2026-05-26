/**
 * Heurística de extracción de talla + model_group desde el nombre del producto.
 *
 * Reglas (aplicadas EN ORDEN sobre el nombre original):
 *   1. Talla letra al final  (XXXL|XXL|XL|L|M|S|XS|XXS).
 *   2. Talla numérica calzado al final (28–50), opcionalmente seguida de un color.
 *   3. Talla letra en medio (entre nombre y color final).
 *   4. Si nada detecta talla → producto individual (size_label = null, model_group = null).
 *
 * El `model_group` se obtiene como slugify(nombre sin la talla y, cuando aplique,
 * sin el color final). Si el slug resultante queda demasiado corto (< 3 chars),
 * descartamos la agrupación.
 *
 * Casos cubiertos:
 *   "CASCO AGILIS M"                 → talla="M",  group="casco-agilis"
 *   "CASCO AGILIS M BLANCO"          → talla="M",  group="casco-agilis-blanco"
 *   "ZAPATILLA MTB 42"               → talla="42", group="zapatilla-mtb"
 *   "ZAPATILLA MTB 42 NEGRO"         → talla="42", group="zapatilla-mtb"
 *   "BIDÓN 750ML"                    → talla=null (no se confunde con MM, ML, etc.)
 *   "TIJA 27.2MM 350MM"              → talla=null (sufijo MM excluye)
 *   "DISCO 160MM"                    → talla=null
 *
 * Casos que NO se intentan resolver aquí (admin lo corrige en /admin/agrupaciones):
 *   - Tallas raras tipo "38/40", "S-M", "T-M" (poco frecuentes en el Excel).
 *   - Modelos cuyo nombre acaba accidentalmente en S/M/L sin ser talla (raros;
 *     el regex con espacio inicial los reduce a casos limítrofes).
 */

// Colores comunes que pueden aparecer junto a la talla en el nombre.
// Incluimos formas en inglés ("BLACK", "WHITE") porque el Excel del cliente
// mezcla nombres ES/EN, y variantes femenino/plural ("BLANCA", "BLANCAS").
const COLOR_TOKENS = [
  'BLANCO', 'BLANCA', 'BLANCOS', 'BLANCAS',
  'NEGRO', 'NEGRA', 'NEGROS', 'NEGRAS',
  'GRIS', 'GRISES',
  'ROJO', 'ROJA', 'ROJOS', 'ROJAS',
  'AZUL', 'AZULES',
  'VERDE', 'VERDES',
  'AMARILLO', 'AMARILLA',
  'BURDEOS',
  'NARANJA',
  'MARRON', 'MARRÓN',
  'ROSA',
  'BLACK', 'WHITE', 'SILVER', 'GREY', 'GRAY',
] as const

const COLOR_RE = COLOR_TOKENS.join('|')

// Sufijos NO-talla que pueden confundirse con tallas de letra (M, L, S sueltas).
// Se usa como guarda negativa: si la letra va seguida de uno de estos sin espacio
// no es una talla. El regex base con `\s(letra)\s*$` ya evita la mayoría, pero
// añadimos chequeo extra para casos como "MIPS", "MM" pegados.
//
// Más importante: requerimos `\s` antes de la letra para evitar "MM" → "M".

// 1. Letra al final del nombre: "... XL" o "... M".
const RE_LETTER_END = /\s(XXXL|XXL|XL|L|M|S|XS|XXS)\s*$/i

// 2. Talla numérica de calzado al final, con o sin decimal (",5" o ".5"),
//    opcionalmente precedida o seguida de un color, y opcionalmente seguida
//    de adjetivos como "ANCHA". Cubre los casos del Excel:
//      "RINCON 43 GRIS", "STYLUS 44 BLANCO", "ZAPATILLA RC502 BLANCO 42",
//      "ZAPATILLA RC7 N 44,5 NEGRO", "ZAPATILLA RC703 BLANCO 43,5".
//
//    Rango aceptado: 28–50 (con o sin ,5 / .5).
const NUM_SIZE = '(?:2[8-9]|[34][0-9]|50)(?:[,.]\\s*5)?'
const TRAILING_QUALIFIER = `(?:\\s+(?:${COLOR_RE}|ANCHA|ANCHO|TALLA))*`
const RE_NUMBER_END = new RegExp(
  `\\s(?:N\\s*)?(${NUM_SIZE})${TRAILING_QUALIFIER}\\s*$`,
  'i',
)

// 3. Letra en medio del nombre, seguida de uno o más tokens de color/cualificadores.
//    Cubre: "AGILIS M BLANCO", "CASCO LAZER STRADA M BLANCO MATE",
//           "CHAQUETA GOR 76 GORE TEX M AZUL", "TALLA M NEGRO".
//    Permitimos cualquier secuencia de tokens detrás de la letra siempre que el
//    PRIMER token tras la letra sea un color reconocido (ancla de confianza).
const RE_LETTER_MID = new RegExp(
  `\\s(XXXL|XXL|XL|L|M|S|XS|XXS)\\s+(${COLOR_RE})(?:\\s+\\S+)*\\s*$`,
  'i',
)

// 4. "TALLA 44" o "TALLA M" explícito (alta confianza).
const RE_TALLA_PREFIX = new RegExp(
  `\\bTALLA\\s+((?:XXXL|XXL|XL|L|M|S|XS|XXS)|${NUM_SIZE})\\b`,
  'i',
)

export interface SizeDetection {
  /** Talla normalizada (mayúsculas para letras; string para números). null si no se detectó. */
  size_label: string | null
  /** Slug del modelo común. null si producto individual. */
  model_group: string | null
  /** Nombre del producto sin la talla, útil para debug/preview. */
  cleaned_name: string
  /** Regla aplicada (para reporting/dry-run). */
  rule: 'letter_end' | 'number_end' | 'letter_mid' | 'talla_prefix' | 'none'
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

/** Normaliza "44,5" / "44.5" → "44.5". Letras → upper. */
function normalizeSize(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, '')
  if (/^[a-z]+$/i.test(cleaned)) return cleaned.toUpperCase()
  return cleaned.replace(',', '.')
}

/**
 * Procesa un nombre y devuelve la talla detectada + model_group.
 *
 * Orden de aplicación (cada paso tiene precedencia decreciente):
 *   1. "TALLA X" explícito (alta confianza).
 *   2. Letra al final ("... M").
 *   3. Letra en medio ("... M BLANCO ...").
 *   4. Talla numérica calzado en cualquier posición (con o sin decimal).
 */
export function detectSize(nameRaw: string): SizeDetection {
  const name = (nameRaw ?? '').trim()
  if (!name) {
    return { size_label: null, model_group: null, cleaned_name: '', rule: 'none' }
  }

  // 1. "TALLA X" explícito (más fiable que cualquier otra heurística).
  const mTallaPrefix = name.match(RE_TALLA_PREFIX)
  if (mTallaPrefix) {
    const size = normalizeSize(mTallaPrefix[1])
    // Quitamos "TALLA X" del nombre.
    const cleaned = name.replace(mTallaPrefix[0], ' ').replace(/\s+/g, ' ').trim()
    return buildResult(size, cleaned, 'talla_prefix')
  }

  // 2. Letra al final.
  const mLetterEnd = name.match(RE_LETTER_END)
  if (mLetterEnd) {
    const size = normalizeSize(mLetterEnd[1])
    const cleaned = name.slice(0, mLetterEnd.index).trim()
    return buildResult(size, cleaned, 'letter_end')
  }

  // 3. Letra en medio (entre nombre y color/cualificadores finales).
  const mLetterMid = name.match(RE_LETTER_MID)
  if (mLetterMid) {
    const size = normalizeSize(mLetterMid[1])
    // Quitamos solo la talla, dejando el resto (color + adjetivos) al final.
    const before = name.slice(0, mLetterMid.index).trim()
    const rest = name.slice(mLetterMid.index! + mLetterMid[0].indexOf(mLetterMid[2]))
    const cleaned = `${before} ${rest}`.replace(/\s+/g, ' ').trim()
    return buildResult(size, cleaned, 'letter_mid')
  }

  // 4. Talla numérica de calzado al final, con o sin color/qualifier después.
  const mNumberEnd = name.match(RE_NUMBER_END)
  if (mNumberEnd) {
    const size = normalizeSize(mNumberEnd[1])
    const cleaned = name.slice(0, mNumberEnd.index).trim()
    return buildResult(size, cleaned, 'number_end')
  }

  return { size_label: null, model_group: null, cleaned_name: name, rule: 'none' }
}

function buildResult(
  size: string,
  cleanedName: string,
  rule: SizeDetection['rule'],
): SizeDetection {
  const group = slugify(cleanedName)
  // Si el slug queda muy corto, abortamos la agrupación: probablemente
  // el "nombre sin talla" no tiene suficiente sustancia para identificar un modelo.
  if (group.length < 3) {
    return {
      size_label: null,
      model_group: null,
      cleaned_name: cleanedName,
      rule: 'none',
    }
  }
  return {
    size_label: size,
    model_group: group,
    cleaned_name: cleanedName,
    rule,
  }
}
