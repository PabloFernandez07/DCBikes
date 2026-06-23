// Utilidades para variantes de color: hex del "puntito" y limpieza del nombre
// del modelo (quitar color + talla para el título del grupo).

const HEX: Record<string, string> = {
  negro: '#1f2937',
  blanco: '#f3f4f6',
  gris: '#9ca3af',
  'gris hielo': '#d7dce0',
  rojo: '#dc2626',
  'rojo sandia': '#e34a4a',
  azul: '#2563eb',
  'azul hielo': '#bfe3f2',
  'azul marino': '#1e3a5f',
  verde: '#16a34a',
  'verde esmeralda': '#0f7a5a',
  amarillo: '#f59e0b',
  naranja: '#ea580c',
  rosa: '#ec4899',
  burdeos: '#7f1d34',
  marron: '#78350f',
  morado: '#7c3aed',
  celeste: '#38bdf8',
  lima: '#a3e635',
  mostaza: '#c99700',
  berenjena: '#5b2a4a',
  petroleo: '#0f5c6b',
  antracita: '#374151',
  plata: '#c4c8cc',
  dorado: '#d4af37',
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

/**
 * Lista de colores conocidos (los que tienen "puntito"), capitalizados, para
 * autocompletar en el admin y normalizar la entrada (evita "AZUL"/"azul"/"Azul").
 */
export const KNOWN_COLORS: string[] = Object.keys(HEX)
  .map(c => c.replace(/\b\w/g, m => m.toUpperCase()))
  .sort((a, b) => a.localeCompare(b, 'es'))

/** Devuelve el color hex para el puntito de un nombre de color. */
export function colorHex(name: string | null | undefined): string {
  if (!name) return '#888'
  const k = norm(name)
  if (HEX[k]) return HEX[k]
  for (const key of Object.keys(HEX)) {
    if (k.includes(key)) return HEX[key]
  }
  return '#888'
}

/** ¿El color es muy claro? (para ponerle borde al puntito). */
export function isLightColor(name: string | null | undefined): boolean {
  const k = norm(name ?? '')
  return /blanc|plata|hielo|lima|amarill|celeste|dorad/.test(k)
}

// Palabras de color (incluye plural/femenino e inglés) para limpiar el título.
const COLOR_WORDS =
  /\b(negr[oa]s?|blanc[oa]s?|gris(?:es)?|roj[oa]s?|azul(?:es)?|verdes?|amarill[oa]s?|naranja|rosa|burdeos|marr[oó]n|morad[oa]s?|celeste|lima|mostaza|berenjena|petr[oó]leo|antracita|sandia|titanium|plata|dorad[oa]|oro|black|white|silver|grey|gray|red|blue|green|yellow|golden|purple|pink|ice\s+(?:blue|grey)|frost\s+silver|panther\s+black)\b/gi

// Sabores + cualificadores de cafeína para limpiar el título de nutrición.
const FLAVOR_WORDS =
  /\b(cola|fresa|lim[oó]n|cereza|cherry|manzana|pl[aá]tano|mel[oó]n|neutr[oa]|neutral|regaliz|frambuesa|raspberry|lemon|orange|berries|berry|mango|mojito|yogur(?:t)?|chocolate|choco|vainilla|menta|sandia|tropical|pi[ñn]a|arandanos|piruleta|tres\s+chocolates|frutos\s+rojos)\b/gi
const CAF_WORDS = /\b(100\s*caf|off\s*caf|con\s+cafe[ií]na|sin\s+cafe[ií]na|\bcaf\b)\b/gi

/**
 * Quita color + talla + sabor/cafeína del nombre para mostrar el título limpio
 * del grupo. Ej: "MAILLOT ALDE THERMO ROJO S" → "MAILLOT ALDE THERMO";
 * "BARRITA GOMINOLA COLA" → "BARRITA GOMINOLA".
 */
export function cleanGroupName(name: string, sizeLabel?: string | null): string {
  let n = name
  if (sizeLabel) {
    const esc = sizeLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    n = n.replace(new RegExp(`\\b${esc}\\b`, 'i'), ' ')
    n = n.replace(new RegExp(`\\bT-?${esc}\\b`, 'i'), ' ')
  }
  n = n.replace(/\btalla\b/gi, ' ').replace(CAF_WORDS, ' ').replace(COLOR_WORDS, ' ').replace(FLAVOR_WORDS, ' ')
  return n.replace(/\s+/g, ' ').replace(/\s*[-_,/]\s*$/, '').trim() || name
}
