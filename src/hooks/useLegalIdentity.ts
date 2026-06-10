import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
  let v: unknown = raw
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v)
    } catch {
      // valor literal sin JSON, lo usamos tal cual
    }
  }
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

/**
 * Fuente única de verdad para la identidad fiscal/legal del titular.
 * Lee las 5 claves canónicas de `settings`. Devuelve `null` mientras carga;
 * cada campo individual será `null` si no está configurado.
 */
export function useLegalIdentity(): LegalIdentity | null {
  const [identity, setIdentity] = useState<LegalIdentity | null>(null)

  useEffect(() => {
    let cancelled = false

    supabase
      .from('settings')
      .select('key, value')
      .in('key', LEGAL_KEYS as unknown as string[])
      .then(({ data }) => {
        if (cancelled) return
        const result: LegalIdentity = {
          companyName: null,
          cif: null,
          address: null,
          formaJuridica: null,
          inscripcion: null,
          contactEmail: null,
        }
        for (const row of data ?? []) {
          const field = KEY_TO_FIELD[row.key as LegalKey]
          if (!field) continue
          result[field] = normalize(row.value)
        }
        setIdentity(result)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return identity
}
