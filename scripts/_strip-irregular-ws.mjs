// scripts/_strip-irregular-ws.mjs — uso interno
// Reemplaza caracteres de espacio "irregular" (NBSP, ZWSP, line sep, etc.)
// por espacios ASCII normales en los archivos pasados como argumento.
import { readFileSync, writeFileSync } from 'node:fs'

const IRREGULAR = [
  ' ', // no-break space
  ' ', // ogham space mark
  ' ', ' ', ' ', ' ', ' ',
  ' ', ' ', ' ', ' ', ' ', ' ',
  '​', // zero-width space
  '‌', '‍', // ZWNJ, ZWJ
  ' ', // narrow no-break
  ' ', // medium math space
  '　', // ideographic space
  '﻿', // BOM / zero-width no-break
]
const LINESEP = [' ', ' '] // line/paragraph separator

const files = process.argv.slice(2)
let total = 0
for (const f of files) {
  const before = readFileSync(f, 'utf8')
  let after = before
  for (const c of IRREGULAR) after = after.split(c).join(' ')
  for (const c of LINESEP) after = after.split(c).join('\n')
  if (after !== before) {
    writeFileSync(f, after)
    const diff = before.length - after.length
    total += diff
    console.log(f, 'cambiado · diff bytes:', diff)
  } else {
    console.log(f, 'sin cambios')
  }
}
console.log('Total bytes recortados:', total)
