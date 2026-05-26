// Validación algorítmica de identificadores fiscales españoles:
// NIF persona física, NIE y CIF empresa (incluye letra/dígito de control).
export function isValidSpanishId(id: string): boolean {
  const cleaned = id.toUpperCase().replace(/[\s-]/g, '')
  if (!/^[A-Z0-9]{9}$/.test(cleaned)) return false
  const NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE'
  const first = cleaned[0]

  // NIF persona física: 8 dígitos + letra
  if (/^\d/.test(first)) {
    if (!/^\d{8}[A-Z]$/.test(cleaned)) return false
    const number = parseInt(cleaned.slice(0, 8), 10)
    const expected = NIF_LETTERS[number % 23]
    return cleaned[8] === expected
  }

  // NIE: X/Y/Z + 7 dígitos + letra
  if (/^[XYZ]/.test(first)) {
    if (!/^[XYZ]\d{7}[A-Z]$/.test(cleaned)) return false
    const prefix = { X: '0', Y: '1', Z: '2' }[first as 'X' | 'Y' | 'Z']!
    const number = parseInt(prefix + cleaned.slice(1, 8), 10)
    const expected = NIF_LETTERS[number % 23]
    return cleaned[8] === expected
  }

  // CIF empresa: letra + 7 dígitos + control (letra o dígito)
  if (/^[A-HJNPQRSUVW]/.test(first)) {
    if (!/^[A-HJNPQRSUVW]\d{7}[A-J0-9]$/.test(cleaned)) return false
    const digits = cleaned.slice(1, 8).split('').map(Number)
    let even = 0
    let odd = 0
    digits.forEach((d, i) => {
      if (i % 2 === 0) {
        const x = d * 2
        odd += Math.floor(x / 10) + (x % 10)
      } else {
        even += d
      }
    })
    const control = (10 - ((odd + even) % 10)) % 10
    const last = cleaned[8]
    if (/[A-J]/.test(first)) {
      // Empiezan por letra y exigen dígito como control.
      return last === String(control)
    }
    if (/[KPQRSUVW]/.test(first)) {
      // Exigen letra como control.
      return last === 'JABCDEFGHI'[control]
    }
    return last === String(control) || last === 'JABCDEFGHI'[control]
  }

  return false
}
