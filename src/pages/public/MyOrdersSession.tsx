import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LogOut, Package, Calendar, Truck, Store, ChevronRight, ArrowLeft, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { SEO } from '@/components/layout/SEO'
import { OrderStatusBadge, type OrderStatus } from '@/components/public/OrderStatusBadge'

const STORAGE_KEY = 'dcbikes_customer_session'

interface CustomerOrderSummary {
  id: string
  order_number: string
  status: OrderStatus
  delivery_method: 'shipping' | 'pickup'
  total_cents: number
  items_count: number
  created_at: string
}

interface CustomerOrdersResponse {
  ok: boolean
  email?: string
  orders?: CustomerOrderSummary[]
  error?: string
}

function persistSession(token: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, savedAt: Date.now() }))
  } catch {
    // storage no disponible (modo privado / quota): seguimos en memoria
  }
}

function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function fmtEuros(cents: number) {
  return (cents / 100).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function MyOrdersSession() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''

  const [loading, setLoading] = useState(true)
  const [expired, setExpired] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [orders, setOrders] = useState<CustomerOrderSummary[]>([])

  const fetchOrders = useCallback(async (tk: string) => {
    setLoading(true)
    setExpired(false)
    try {
      const { data, error } = await supabase.functions.invoke<CustomerOrdersResponse>(
        'customer-orders-list',
        { body: { token: tk } },
      )
      if (error) {
        // supabase-js mete el status en error.context si está disponible
        const ctx = (error as unknown as { context?: { status?: number } }).context
        if (ctx?.status === 401) {
          setExpired(true)
          clearSession()
          return
        }
        throw new Error(error.message)
      }
      if (!data?.ok) {
        setExpired(true)
        clearSession()
        return
      }
      setEmail(data.email ?? null)
      setOrders(data.orders ?? [])
    } catch {
      setExpired(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!token) {
      setExpired(true)
      setLoading(false)
      return
    }
    // S-08 (fase 1): limpiar token de la URL inmediatamente tras consumirlo
    // para evitar fugas vía Referrer header o historial del navegador.
    // TODO S-08 fase 2: intercambiar token por cookie HttpOnly Secure SameSite=Strict
    // mediante Edge Function customer-session-exchange (actualmente el token reside en localStorage).
    if (window.location.search.includes('token=')) {
      window.history.replaceState({}, document.title, window.location.pathname)
    }
    persistSession(token)
    fetchOrders(token)
  }, [token, fetchOrders])

  // S-08: meta referrer=no-referrer en esta ruta — el token nunca aparecerá
  // como Referrer hacia recursos externos aunque se carguen en esta página.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'referrer'
    meta.content = 'no-referrer'
    document.head.appendChild(meta)
    return () => { document.head.removeChild(meta) }
  }, [])

  const handleLogout = () => {
    clearSession()
    navigate('/')
  }

  if (loading) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-20 text-center">
        <div className="inline-block w-6 h-6 rounded-full border-2 border-[var(--color-lavender)] border-t-transparent animate-spin" />
        <p className="mt-4 text-sm text-[var(--color-mid)] font-[var(--font-body)]">
          Verificando enlace…
        </p>
      </div>
    )
  }

  if (expired) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-16">
        <SEO title="Enlace expirado" noIndex />
        <div className="max-w-md mx-auto text-center space-y-5">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-card-hover)] text-[var(--color-mid)] mx-auto">
            <RefreshCw size={24} strokeWidth={1.5} />
          </div>
          <h1 className="font-[var(--font-display)] text-3xl text-[var(--color-cream)] tracking-wide">
            Tu enlace ha expirado o ya no es válido
          </h1>
          <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)] leading-relaxed">
            Por seguridad, los enlaces de acceso son temporales. Puedes solicitar uno nuevo y te lo enviaremos a tu correo.
          </p>
          <button
            type="button"
            onClick={() => navigate('/mis-pedidos')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--color-lavender)] text-[var(--color-ink)] font-[var(--font-cond)] font-semibold tracking-widest hover:brightness-110 transition-all"
          >
            Solicitar nuevo enlace
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-12">
      <SEO title="Mis pedidos" noIndex />

      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <header className="flex items-start justify-between gap-3 flex-wrap mb-8 pb-6 border-b border-[var(--color-card)]">
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] hover:text-[var(--color-lavender)] mb-2 transition-colors"
            >
              <ArrowLeft size={13} />
              Inicio
            </Link>
            <h1 className="font-[var(--font-display)] text-3xl sm:text-4xl text-[var(--color-cream)] tracking-wide">
              Mis pedidos
            </h1>
            {email && (
              <p className="mt-1 text-sm text-[var(--color-mid)] font-[var(--font-body)]">
                Sesión: <span className="text-[var(--color-cream-dim)]">{email}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => token && fetchOrders(token)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-[var(--font-cond)] tracking-wide text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[var(--color-card-hover)]/40 transition-colors disabled:opacity-50"
              title="Refrescar mis pedidos"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refrescar
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-[var(--font-cond)] tracking-wide text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[var(--color-card-hover)]/40 transition-colors"
            >
              <LogOut size={13} />
              Cerrar sesión
            </button>
          </div>
        </header>

        {/* Orders list */}
        {orders.length === 0 ? (
          <div className="text-center py-16 bg-[var(--color-card)] rounded-2xl border border-[var(--color-card-hover)]">
            <Package size={32} className="text-[var(--color-mid)] mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-[var(--color-cream-dim)] font-[var(--font-body)]">
              No tienes pedidos asociados a este email.
            </p>
            <Link
              to="/catalogo"
              className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 rounded-xl bg-[var(--color-lavender)] text-[var(--color-ink)] font-[var(--font-cond)] font-semibold text-sm tracking-wide hover:brightness-110 transition-all"
            >
              Explorar catálogo
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {orders.map(o => (
              <li key={o.id}>
                <Link
                  to={`/mis-pedidos/pedido/${o.id}`}
                  className="group block bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-5 hover:border-[var(--color-lavender)]/40 hover:bg-[var(--color-card-hover)]/40 transition-all"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                    <div className="min-w-0">
                      <p className="font-[var(--font-cond)] text-base text-[var(--color-lavender)] tracking-wide">
                        {o.order_number}
                      </p>
                      <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)] mt-0.5 inline-flex items-center gap-1.5">
                        <Calendar size={11} />
                        {formatDate(o.created_at)}
                      </p>
                    </div>
                    <OrderStatusBadge status={o.status} />
                  </div>

                  <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
                    <div className="flex items-center gap-3 text-[var(--color-cream-dim)] font-[var(--font-body)]">
                      <span className="inline-flex items-center gap-1.5">
                        {o.delivery_method === 'shipping' ? (
                          <Truck size={13} className="text-[var(--color-mid)]" />
                        ) : (
                          <Store size={13} className="text-[var(--color-mid)]" />
                        )}
                        {o.delivery_method === 'shipping' ? 'Envío' : 'Recogida'}
                      </span>
                      <span className="text-[var(--color-mid)]">·</span>
                      <span className="inline-flex items-center gap-1.5">
                        <Package size={13} className="text-[var(--color-mid)]" />
                        {o.items_count} {o.items_count === 1 ? 'artículo' : 'artículos'}
                      </span>
                    </div>

                    <div className="inline-flex items-center gap-2">
                      <span className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tabular-nums">
                        {fmtEuros(o.total_cents)} €
                      </span>
                      <ChevronRight
                        size={16}
                        className="text-[var(--color-mid)] group-hover:text-[var(--color-lavender)] group-hover:translate-x-0.5 transition-all"
                      />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
