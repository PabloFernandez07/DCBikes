import { useEffect, useState } from 'react'
import { getSettings, parseSettingValue } from '@/lib/settings-cache'

export interface LegalIdentity {
  companyName: string | null
  cif: string | null
  address: string | null
  formaJuridica: string | null
  inscripcion: string | null
  contactEmail: string | null
}

const LEGAL_KEYS = [
  'legal_company_name',
  'legal_company_cif',
  'legal_company_address',
  'legal_forma_juridica',
  'legal_inscripcion',
  'legal_contact_email',
] as const

type LegalKey = (typeof LEGAL_KEYS)[number]

const KEY_TO_FIELD: Record<LegalKey, keyof LegalIdentity> = {
  legal_company_name: 'companyName',
  legal_company_cif: 'cif',
  legal_company_address: 'address',
  legal_forma_juridica: 'formaJuridica',
  legal_inscripcion: 'inscripcion',
  legal_contact_email: 'contactEmail',
}

function normalize(raw: unknown): string | null {
  const v = parseSettingValue(raw)
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

/**
 * Fuente única de verdad para la identidad fiscal/legal del titular.
 * Lee las claves canónicas de `settings`. Devuelve `null` mientras carga;
 * cada campo individual será `null` si no está configurado.
 *
 * PERF-M1: consume la caché compartida de `settings`
 * (src/lib/settings-cache.ts) en vez de lanzar su propia query.
 */
export function useLegalIdentity(): LegalIdentity | null {
  const [identity, setIdentity] = useState<LegalIdentity | null>(null)

  useEffect(() => {
    let cancelled = false

    const EMPTY: LegalIdentity = {
      companyName: null,
      cif: null,
      address: null,
      formaJuridica: null,
      inscripcion: null,
      contactEmail: null,
    }

    getSettings()
      .then(byKey => {
        if (cancelled) return
        const result: LegalIdentity = { ...EMPTY }
        for (const key of LEGAL_KEYS) {
          if (!byKey.has(key)) continue
          result[KEY_TO_FIELD[key]] = normalize(byKey.get(key))
        }
        setIdentity(result)
      })
      .catch(() => {
        // Error de red/RLS: resolvemos con todos los campos a null, igual
        // que hacía la versión anterior (data null → resultado vacío).
        if (!cancelled) setIdentity({ ...EMPTY })
      })

    return () => {
      cancelled = true
    }
  }, [])

  return identity
}
