import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  ResponsiveContainer,
} from 'recharts'
import { Package, MessageSquare, Eye, Bell, ShoppingBag } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'
import { ChartCard } from '@/components/admin/ChartCard'

type Period = '7d' | '30d' | '90d'

function periodToDays(p: Period): number {
  return p === '7d' ? 7 : p === '30d' ? 30 : 90
}

interface ProductView {
  product_id: string
  name: string
  views: number
}

interface QuoteByDay {
  day: string
  count: number
}

interface SearchTerm {
  term: string
  searches: number
}

interface MetricCard {
  label: string
  value: number
  icon: React.ReactNode
}

function MetricCard({ label, value, icon }: MetricCard) {
  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-[var(--color-lavender)]/15 flex items-center justify-center text-[var(--color-lavender)] shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-[var(--font-display)] text-[var(--color-cream)] leading-none">{value}</p>
        <p className="text-xs font-[var(--font-cond)] text-[var(--color-mid)] tracking-wide mt-0.5">{label}</p>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>('30d')
  const [topProducts, setTopProducts] = useState<ProductView[]>([])
  const [quotesChart, setQuotesChart] = useState<QuoteByDay[]>([])
  const [searchTerms, setSearchTerms] = useState<SearchTerm[]>([])
  const [activeProducts, setActiveProducts] = useState(0)
  const [quotesToday, setQuotesToday] = useState(0)
  const [viewsToday, setViewsToday] = useState(0)
  const [ordersPendingApproval, setOrdersPendingApproval] = useState(0)
  const [ordersToday, setOrdersToday] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const days = periodToDays(period)
    const since = new Date(Date.now() - days * 86400000).toISOString()
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    Promise.all([
      supabase
        .from('product_views')
        .select('product_id, products!inner(name)')
        .gte('viewed_at', since),
      supabase
        .from('quote_requests')
        .select('created_at')
        .gte('created_at', since),
      supabase
        .from('search_queries')
        .select('term')
        .gte('searched_at', since),
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('active', true),
      supabase
        .from('quote_requests')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayStart.toISOString()),
      supabase
        .from('product_views')
        .select('id', { count: 'exact', head: true })
        .gte('viewed_at', todayStart.toISOString()),
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'authorized'),
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayStart.toISOString()),
    ]).then(([views, quotes, searches, activeProd, quotesT, viewsT, ordersAuth, ordersT]) => {
      type ViewRow = { product_id: string; products: { name: string } }
      const viewsData = (views.data ?? []) as ViewRow[]

      const viewsByProduct: Record<string, { name: string; count: number }> = {}
      for (const v of viewsData) {
        const id = v.product_id
        if (!viewsByProduct[id]) {
          viewsByProduct[id] = { name: v.products.name, count: 0 }
        }
        viewsByProduct[id].count++
      }
      const top = Object.entries(viewsByProduct)
        .map(([id, d]) => ({ product_id: id, name: d.name, views: d.count }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10)
      setTopProducts(top)

      const quotesByDay: Record<string, number> = {}
      for (const q of (quotes.data ?? [])) {
        const day = q.created_at.slice(0, 10)
        quotesByDay[day] = (quotesByDay[day] ?? 0) + 1
      }
      const sortedDays = Object.entries(quotesByDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, count]) => ({ day: day.slice(5), count }))
      setQuotesChart(sortedDays)

      const termCounts: Record<string, number> = {}
      for (const s of (searches.data ?? [])) {
        termCounts[s.term] = (termCounts[s.term] ?? 0) + 1
      }
      const topTerms = Object.entries(termCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20)
        .map(([term, searches]) => ({ term, searches }))
      setSearchTerms(topTerms)

      setActiveProducts(activeProd.count ?? 0)
      setQuotesToday(quotesT.count ?? 0)
      setViewsToday(viewsT.count ?? 0)
      setOrdersPendingApproval(ordersAuth.count ?? 0)
      setOrdersToday(ordersT.count ?? 0)
      setLoading(false)
    })
  }, [period])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest">
          DASHBOARD
        </h1>
        <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
          Vista general del negocio
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Productos activos"
          value={activeProducts}
          icon={<Package size={20} />}
        />
        <MetricCard
          label="Consultas hoy"
          value={quotesToday}
          icon={<MessageSquare size={20} />}
        />
        <MetricCard
          label="Visitas hoy"
          value={viewsToday}
          icon={<Eye size={20} />}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          to="/admin/pedidos?status=authorized"
          className={clsx(
            'bg-[var(--color-card)] border rounded-2xl p-5 flex items-center gap-4 transition-all hover:bg-[var(--color-card-hover)]/60',
            ordersPendingApproval > 0
              ? 'border-yellow-500/30 ring-1 ring-yellow-500/20'
              : 'border-[var(--color-card-hover)]',
          )}
        >
          <div className="w-11 h-11 rounded-xl bg-yellow-500/15 flex items-center justify-center text-yellow-300 shrink-0">
            <Bell size={20} />
          </div>
          <div>
            <p className="text-2xl font-[var(--font-display)] text-[var(--color-cream)] leading-none">
              {ordersPendingApproval}
            </p>
            <p className="text-xs font-[var(--font-cond)] text-[var(--color-mid)] tracking-wide mt-0.5">
              Pedidos pendientes de aprobación
            </p>
          </div>
        </Link>

        <Link
          to="/admin/pedidos?date=today"
          className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-5 flex items-center gap-4 transition-all hover:bg-[var(--color-card-hover)]/60"
        >
          <div className="w-11 h-11 rounded-xl bg-[var(--color-lavender)]/15 flex items-center justify-center text-[var(--color-lavender)] shrink-0">
            <ShoppingBag size={20} />
          </div>
          <div>
            <p className="text-2xl font-[var(--font-display)] text-[var(--color-cream)] leading-none">
              {ordersToday}
            </p>
            <p className="text-xs font-[var(--font-cond)] text-[var(--color-mid)] tracking-wide mt-0.5">
              Pedidos hoy
            </p>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard
          title="Top 10 productos más vistos"
          loading={loading}
          period={period}
          onPeriodChange={setPeriod}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topProducts} layout="vertical" margin={{ left: 0, right: 16 }}>
              <XAxis type="number" tick={{ fill: '#7E6E8A', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fill: '#D8DDE5', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: string) => v.length > 16 ? v.slice(0, 16) + '…' : v}
              />
              <Tooltip
                contentStyle={{
                  background: '#2B2730',
                  border: '1px solid #332B3A',
                  borderRadius: 10,
                  color: '#EEF3F8',
                  fontSize: 12,
                }}
                cursor={{ fill: 'rgba(196,162,207,0.08)' }}
              />
              <Bar dataKey="views" fill="#C4A2CF" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Consultas recibidas"
          loading={loading}
          period={period}
          onPeriodChange={setPeriod}
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={quotesChart}>
              <XAxis dataKey="day" tick={{ fill: '#7E6E8A', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#7E6E8A', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: '#2B2730',
                  border: '1px solid #332B3A',
                  borderRadius: 10,
                  color: '#EEF3F8',
                  fontSize: 12,
                }}
                cursor={{ stroke: 'rgba(196,162,207,0.3)' }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#C4A2CF"
                strokeWidth={2}
                dot={{ fill: '#C4A2CF', r: 3 }}
                activeDot={{ r: 5, fill: '#C4A2CF' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-card-hover)]">
          <h3 className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
            Términos de búsqueda más frecuentes
          </h3>
        </div>
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-[var(--color-lavender)] border-t-transparent animate-spin" />
          </div>
        ) : searchTerms.length === 0 ? (
          <p className="px-5 py-6 text-sm text-[var(--color-mid)] font-[var(--font-body)]">
            Sin datos de búsqueda en el período seleccionado.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-card-hover)]/50">
                <th className="px-5 py-3 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">#</th>
                <th className="px-5 py-3 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Término</th>
                <th className="px-5 py-3 text-right text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Búsquedas</th>
              </tr>
            </thead>
            <tbody>
              {searchTerms.map((t, i) => (
                <tr key={t.term} className="border-b border-[var(--color-card-hover)]/30 last:border-0 hover:bg-[var(--color-card-hover)]/40 transition-colors">
                  <td className="px-5 py-3 text-[var(--color-mid)] font-[var(--font-body)]">{i + 1}</td>
                  <td className="px-5 py-3 text-[var(--color-cream-dim)] font-[var(--font-body)]">{t.term}</td>
                  <td className="px-5 py-3 text-right font-[var(--font-cond)] font-medium text-[var(--color-lavender)]">
                    {t.searches}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
