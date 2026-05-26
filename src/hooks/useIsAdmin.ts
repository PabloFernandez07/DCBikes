import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type IsAdminState = { loading: true; isAdmin: null } | { loading: false; isAdmin: boolean }

// Cast a any porque la RPC is_admin no está en database.types.ts hasta que se
// regeneren los tipos (la migración 0013 la crea). Sin cast da TS2345.
type RpcClient = { rpc: (fn: string) => Promise<{ data: unknown; error: { message: string } | null }> }

export function useIsAdmin(): IsAdminState {
  const [state, setState] = useState<IsAdminState>({ loading: true, isAdmin: null })

  useEffect(() => {
    let alive = true
    ;(supabase as unknown as RpcClient).rpc('is_admin').then(({ data, error }) => {
      if (!alive) return
      if (error) {
        console.warn('[useIsAdmin] rpc error:', error.message)
        setState({ loading: false, isAdmin: false })
      } else {
        setState({ loading: false, isAdmin: data === true })
      }
    })
    return () => { alive = false }
  }, [])

  return state
}
