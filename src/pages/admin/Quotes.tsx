import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { clsx } from 'clsx'
import { X, Mail, Send, RotateCcw, CheckCheck, Archive, Loader2, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'
import { notifyBadgeRefresh } from '@/lib/adminBadges'
import type { QuoteRequest, QuoteMessage } from '@/lib/database.types'

type StatusFilter = 'all' | 'new' | 'read' | 'replied' | 'archived'

interface QuoteWithProduct extends QuoteRequest {
  products: { name: string } | null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function truncate(text: string | null, max: number): string {
  if (!text) return '—'
  if (text.length <= max) return text
  return text.slice(0, max) + '…'
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Nueva',
  read: 'Leída',
  replied: 'Respondida',
  archived: 'Archivada',
}

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-[var(--color-lavender)]/20 text-[var(--color-lavender)] border-[var(--color-lavender)]/30',
  read: 'bg-[var(--color-card-hover)] text-[var(--color-cream-dim)] border-[var(--color-mid)]/20',
  replied: 'bg-green-500/15 text-green-400 border-green-500/25',
  archived: 'bg-[var(--color-brand-red)]/10 text-[var(--color-mid)] border-[var(--color-brand-red)]/20',
}

function buildReplyTemplate(quote: QuoteWithProduct): { subject: string; body: string } {
  const subject = quote.products?.name
    ? `Re: Consulta sobre ${quote.products.name} – DC Bikes Cantabria`
    : 'Re: Consulta de presupuesto – DC Bikes Cantabria'

  // Sin citar el mensaje original: el hilo ya lo tienes delante en el panel y
  // el email que recibe el cliente lleva la referencia al producto en su
  // cabecera. Citarlo aquí solo ensuciaría el correo y el cuerpo que se guarda
  // en el hilo. Además, en la segunda respuesta en adelante citar el mensaje
  // original sería directamente engañoso.
  const body = [
    'Hola,',
    '',
    'Gracias por contactar con DC Bikes Cantabria.',
    '',
    '[Escribe aquí tu respuesta al cliente]',
    '',
    '---',
    'DC Bikes Cantabria',
    'El Astillero, Cantabria',
    'dcbikescantabria.com',
  ].join('\n')

  return { subject, body }
}

export function Quotes() {
  const { toasts, toast, dismiss } = useToast()
  const [quotes, setQuotes] = useState<QuoteWithProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [selected, setSelected] = useState<QuoteWithProduct | null>(null)
  const [newCount, setNewCount] = useState(0)

  // ── Selección múltiple + papelera ──────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showTrash, setShowTrash] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  // Reply compose state
  const [replyOpen, setReplyOpen] = useState(false)
  const [replySubject, setReplySubject] = useState('')
  const [replyBody, setReplyBody] = useState('')
  const [replySending, setReplySending] = useState(false)

  // Hilo de la consulta seleccionada
  const [thread, setThread] = useState<QuoteMessage[]>([])
  const [threadLoading, setThreadLoading] = useState(false)

  // Token de la última petición en vuelo. Sin esto hay una carrera con
  // consecuencias de privacidad: si el admin salta rápido de la consulta A a la
  // B y la petición de A resuelve DESPUÉS que la de B, el `setThread` de A gana
  // con B seleccionada → se pinta el hilo de OTRO cliente bajo la cabecera de B.
  // Solo se acepta la respuesta de la consulta que sigue abierta.
  const threadReq = useRef(0)

  const fetchThread = useCallback(async (quoteId: string) => {
    const req = ++threadReq.current
    setThreadLoading(true)
    const { data, error } = await supabase
      .from('quote_messages')
      .select('*')
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: true })
    if (req !== threadReq.current) return  // llegó tarde: hay otra consulta abierta
    if (error) {
      console.error('[THREAD]', error)
      toast.error('No se pudo cargar la conversación: ' + error.message)
    }
    setThread(data ?? [])
    setThreadLoading(false)
  }, [toast])

  const fetchQuotes = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('quote_requests')
      .select('*, products(name)')
      .order('created_at', { ascending: false })
    // Si esto falla (RLS, sesión caducada, red) y no se mira el error, la
    // pantalla enseña «No hay consultas» y el dueño concluye que no tiene
    // trabajo pendiente. Un error tiene que verse.
    if (error) {
      console.error('[QUOTES]', error)
      toast.error('No se pudieron cargar las consultas: ' + error.message)
      setLoading(false)
      return
    }
    const rows = (data as QuoteWithProduct[]) ?? []
    setQuotes(rows)
    setNewCount(rows.filter(q => q.status === 'new' && !q.deleted_at).length)
    setLoading(false)
  }, [toast])

  useEffect(() => { fetchQuotes() }, [fetchQuotes])

  // Reset compose when switching selected quote
  useEffect(() => {
    setReplyOpen(false)
    setReplySubject('')
    setReplyBody('')
  }, [selected?.id])

  // Cargar el hilo de la consulta abierta
  useEffect(() => {
    if (!selected) { setThread([]); return }
    fetchThread(selected.id)
  }, [selected?.id, fetchThread])

  // Red de seguridad. El primer mensaje del hilo lo siembra un trigger en la BD
  // (migración 0075), así que una consulta con texto SIEMPRE debería traerlo. Si
  // aun así falta, pintamos el texto de quote_requests.message en vez de dejar
  // al comercio con la consulta ilegible: el mensaje del cliente es el único
  // dato que esta pantalla existe para enseñar, y perderlo cuesta un cliente.
  //
  // LA CONDICIÓN ES «FALTA EL ORIGINAL», NO «EL HILO ESTÁ VACÍO». Antes esto
  // hacía `if (thread.length > 0) return thread`, o sea que solo saltaba con el
  // hilo COMPLETAMENTE vacío… y las dos consultas que estaban de verdad rotas en
  // producción tenían hilo [out, in, out]: NO estaban vacías, solo les faltaba el
  // original. La red no habría saltado en ninguna de las dos. Es el mismo
  // predicado falso-negativo que se descartó (con razón) al escribir el backfill
  // de 0075 —«buscar consultas SIN NINGUNA fila da cero afectadas y parece que
  // no hay nada roto»— y que se había colado otra vez aquí.
  //
  // El original se reconoce por su marca email_id='quote:<uuid>' (0075), que es
  // el mismo discriminador que usa la BD. Si no está, se antepone.
  //
  // Efecto colateral buscado: en una consulta anonimizada por retención (hilo
  // borrado, message = «[anonimizado…]») se ve el aviso de la purga en lugar de
  // un vacío que parece pérdida de datos.
  const displayThread = useMemo<QuoteMessage[]>(() => {
    if (!selected?.message) return thread
    if (thread.some(m => m.email_id === `quote:${selected.id}`)) return thread

    console.warn(
      '[THREAD] falta el mensaje original en el hilo — ¿falta el trigger 0075?',
      selected.id,
    )
    const original: QuoteMessage = {
      id: `fallback-${selected.id}`,
      quote_id: selected.id,
      direction: 'in',
      body: selected.message,
      body_raw: null,
      subject: null,
      email_id: null,
      created_at: selected.created_at,
    }
    return [original, ...thread]
  }, [thread, selected])

  // Bandeja activa vs papelera. En la papelera mostramos TODAS las eliminadas
  // (las pestañas de estado no aplican ahí); en la bandeja filtramos por estado.
  const filtered = showTrash
    ? quotes.filter(q => q.deleted_at)
    : filter === 'all'
      ? quotes.filter(q => !q.deleted_at)
      : quotes.filter(q => !q.deleted_at && q.status === filter)

  const trashCount = quotes.filter(q => q.deleted_at).length

  // ── Selección ──────────────────────────────────────────────────
  const allVisibleSelected = filtered.length > 0 && filtered.every(q => selectedIds.has(q.id))
  const someVisibleSelected = filtered.some(q => selectedIds.has(q.id)) && !allVisibleSelected

  const toggleOne = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAllVisible = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      const allSelected = filtered.length > 0 && filtered.every(q => next.has(q.id))
      if (allSelected) {
        for (const q of filtered) next.delete(q.id)
      } else {
        for (const q of filtered) next.add(q.id)
      }
      return next
    })
  }, [filtered])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const selectedCount = selectedIds.size

  const updateStatus = useCallback(async (quote: QuoteWithProduct, newStatus: string) => {
    type QuoteBuilder = {
      update: (v: { status: string }) => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> }
    }
    const builder = supabase.from('quote_requests') as unknown as QuoteBuilder
    const result = await builder.update({ status: newStatus }).eq('id', quote.id)
    const error = result.error

    if (error) {
      toast.error('Error al actualizar: ' + error.message)
    } else {
      toast.success('Estado actualizado')
      const updated = { ...quote, status: newStatus }
      setQuotes(prev => prev.map(q => (q.id === quote.id ? updated : q)))
      setNewCount(prev => {
        if (quote.status === 'new' && newStatus !== 'new') return prev - 1
        if (quote.status !== 'new' && newStatus === 'new') return prev + 1
        return prev
      })
      notifyBadgeRefresh('quotes')
      if (selected?.id === quote.id) setSelected(updated)
    }
  }, [toast, selected])

  // ── Acciones en lote ───────────────────────────────────────────
  // Todas se apoyan en la policy UPDATE existente (auth_quotes_u). "Eliminar" es
  // un borrado lógico (deleted_at), reversible desde la papelera.
  type QuoteBulkBuilder = {
    update: (v: Record<string, unknown>) => {
      in: (col: string, vals: string[]) => Promise<{ error: { message: string } | null }>
    }
  }
  const runBulk = useCallback(async (patch: Record<string, unknown>, successMsg: string) => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    setBulkBusy(true)
    const builder = supabase.from('quote_requests') as unknown as QuoteBulkBuilder
    const { error } = await builder.update(patch).in('id', ids)
    setBulkBusy(false)
    if (error) {
      toast.error('Error al actualizar: ' + error.message)
      return
    }
    toast.success(successMsg)
    notifyBadgeRefresh('quotes')
    if (selected && ids.includes(selected.id)) setSelected(null)
    clearSelection()
    fetchQuotes()
  }, [selectedIds, toast, clearSelection, selected, fetchQuotes])

  const bulkMarkRead      = () => runBulk({ status: 'read' }, `${selectedCount} marcada(s) como leída(s)`)
  const bulkArchive       = () => runBulk({ status: 'archived' }, `${selectedCount} archivada(s)`)
  const bulkRestoreStatus = () => runBulk({ status: 'new' }, `${selectedCount} restaurada(s) a Nueva`)
  const bulkDelete        = () => runBulk({ deleted_at: new Date().toISOString() }, `${selectedCount} enviada(s) a la papelera`)
  const bulkRestoreTrash  = () => runBulk({ deleted_at: null }, `${selectedCount} restaurada(s) de la papelera`)

  // ── Borrado / restauración por fila (papelera reversible) ──────
  const setDeleted = useCallback(async (quote: QuoteWithProduct, deleted: boolean) => {
    type QuoteBuilder = {
      update: (v: { deleted_at: string | null }) => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> }
    }
    const builder = supabase.from('quote_requests') as unknown as QuoteBuilder
    const newVal = deleted ? new Date().toISOString() : null
    const { error } = await builder.update({ deleted_at: newVal }).eq('id', quote.id)
    if (error) {
      toast.error('Error: ' + error.message)
      return
    }
    toast.success(deleted ? 'Consulta enviada a la papelera' : 'Consulta restaurada')
    setQuotes(prev => prev.map(q => (q.id === quote.id ? { ...q, deleted_at: newVal } : q)))
    setNewCount(prev => {
      if (quote.status !== 'new') return prev
      if (deleted && !quote.deleted_at) return prev - 1
      if (!deleted && quote.deleted_at) return prev + 1
      return prev
    })
    // Papelera y restauración cambian el badge del menú sin cambiar de ruta: hay que
    // avisar al AdminShell o el punto rojo se queda pegado hasta el refresco de 60 s.
    // Al restaurar una consulta sin leer, vuelve a contar sola (sigue siendo 'new').
    notifyBadgeRefresh('quotes')
    if (selected?.id === quote.id) {
      if (deleted) setSelected(null)
      else setSelected({ ...quote, deleted_at: newVal })
    }
  }, [toast, selected])

  function openReplyCompose(quote: QuoteWithProduct) {
    // Auto-mark as read when compose is opened
    if (quote.status === 'new') updateStatus(quote, 'read')
    const { subject, body } = buildReplyTemplate(quote)
    setReplySubject(subject)
    setReplyBody(body)
    setReplyOpen(true)
  }

  async function sendReply(quote: QuoteWithProduct) {
    if (!replySubject.trim() || !replyBody.trim()) {
      toast.error('El asunto y el mensaje no pueden estar vacíos')
      return
    }
    setReplySending(true)
    try {
      const { error } = await supabase.functions.invoke('send-reply-email', {
        body: { quote_id: quote.id, subject: replySubject, body: replyBody },
      })
      if (error) throw error

      toast.success(`Respuesta enviada a ${quote.email}`)
      setReplyOpen(false)
      fetchThread(quote.id)   // la función ya guardó el mensaje: recárgalo en el hilo
      // La función ya actualiza el estado en BD; actualizamos también el estado local
      const updated = { ...quote, status: 'replied' }
      setQuotes(prev => prev.map(q => (q.id === quote.id ? updated : q)))
      setNewCount(prev => quote.status === 'new' ? prev - 1 : prev)
      notifyBadgeRefresh('quotes')
      if (selected?.id === quote.id) setSelected(updated)
    } catch (err) {
      console.error('[REPLY]', err)
      toast.error('Error al enviar. Revisa los logs de la Edge Function.')
    } finally {
      setReplySending(false)
    }
  }

  const tabs: Array<{ key: StatusFilter; label: string; badge?: number }> = [
    { key: 'all',      label: 'Todas' },
    { key: 'new',      label: 'Nuevas',      badge: newCount },
    { key: 'read',     label: 'Leídas' },
    { key: 'replied',  label: 'Respondidas' },
    { key: 'archived', label: 'Archivadas' },
  ]

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-xl md:text-2xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest">
            CONSULTAS
          </h1>
          <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
            Solicitudes de presupuesto recibidas
          </p>
        </div>

        {/* Tabs + toggle papelera */}
        <div className="flex flex-wrap items-center gap-3">
          {!showTrash && (
            <div className="flex flex-wrap gap-1 bg-[var(--color-card)] rounded-xl p-1 w-fit">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => { setFilter(tab.key); clearSelection() }}
                  className={clsx(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-[var(--font-cond)] font-medium tracking-wide transition-all duration-150',
                    filter === tab.key
                      ? 'bg-[var(--color-lavender)]/15 text-[var(--color-lavender)]'
                      : 'text-[var(--color-mid)] hover:text-[var(--color-cream)]',
                  )}
                >
                  {tab.label}
                  {tab.badge != null && tab.badge > 0 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--color-brand-red)] text-white text-[10px] font-bold">
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {showTrash && (
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-card)] text-sm font-[var(--font-cond)] font-medium tracking-wide text-[var(--color-cream)]">
              <Trash2 size={15} aria-hidden="true" />
              Papelera
            </span>
          )}

          <button
            type="button"
            role="switch"
            aria-checked={showTrash}
            onClick={() => { setShowTrash(v => !v); clearSelection() }}
            className="flex items-center gap-2 cursor-pointer select-none group ml-auto sm:ml-0"
          >
            <span
              className={clsx(
                'relative inline-block h-5 w-10 shrink-0 rounded-full transition-colors',
                showTrash ? 'bg-[var(--color-brand-red)]/60' : 'bg-[var(--color-card-hover)]',
              )}
              aria-hidden="true"
            >
              <span
                className={clsx(
                  'absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-[var(--color-cream)] transition-all',
                  showTrash ? 'left-[1.375rem]' : 'left-[0.125rem]',
                )}
              />
            </span>
            <span className="text-xs font-[var(--font-cond)] tracking-wide text-[var(--color-cream-dim)] whitespace-nowrap group-hover:text-[var(--color-cream)] transition-colors">
              {showTrash ? 'Ver bandeja' : `Papelera${trashCount > 0 ? ` (${trashCount})` : ''}`}
            </span>
          </button>
        </div>

        {/* Table */}
        <div className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-12 flex justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-[var(--color-lavender)] border-t-transparent animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-[var(--color-mid)] font-[var(--font-body)]">
              {showTrash ? 'La papelera está vacía.' : 'No hay consultas en esta categoría.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-card-hover)]">
                    <th className="px-3 py-3.5 w-10 text-left">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todas las consultas visibles"
                        checked={allVisibleSelected}
                        ref={el => { if (el) el.indeterminate = someVisibleSelected }}
                        onChange={toggleAllVisible}
                        className="accent-[var(--color-lavender)] cursor-pointer"
                      />
                    </th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Fecha</th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Email</th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide hidden sm:table-cell">Teléfono</th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide hidden md:table-cell">Producto</th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide hidden lg:table-cell">Mensaje</th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(q => {
                    const checked = selectedIds.has(q.id)
                    return (
                    <tr
                      key={q.id}
                      onClick={() => setSelected(prev => prev?.id === q.id ? null : q)}
                      className={clsx(
                        'border-b border-[var(--color-card-hover)]/40 last:border-0 cursor-pointer transition-colors',
                        checked
                          ? 'bg-[var(--color-lavender)]/10'
                          : q.status === 'new' && !q.deleted_at
                            ? 'bg-[var(--color-lavender)]/5 hover:bg-[var(--color-lavender)]/10'
                            : 'hover:bg-[var(--color-card-hover)]/30',
                        selected?.id === q.id && 'ring-1 ring-inset ring-[var(--color-lavender)]/30',
                      )}
                    >
                      <td className="px-3 py-3 w-10" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar consulta de ${q.email}`}
                          checked={checked}
                          onChange={() => toggleOne(q.id)}
                          className="accent-[var(--color-lavender)] cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3 text-[var(--color-cream-dim)] font-[var(--font-body)] whitespace-nowrap">
                        {formatDate(q.created_at)}
                      </td>
                      <td className="px-4 py-3 font-[var(--font-body)]">
                        <span className={clsx(
                          q.status === 'new' && 'font-semibold text-[var(--color-cream)]',
                          q.status !== 'new' && 'text-[var(--color-cream)]',
                        )}>
                          {q.email}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-mid)] font-[var(--font-body)] hidden sm:table-cell">
                        {q.phone ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-cream-dim)] font-[var(--font-body)] hidden md:table-cell">
                        {q.products?.name ?? <span className="text-[var(--color-mid)]">Taller</span>}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-mid)] font-[var(--font-body)] hidden lg:table-cell">
                        {truncate(q.message, 80)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx(
                          'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-[var(--font-cond)] font-medium tracking-wide border',
                          STATUS_COLORS[q.status] ?? STATUS_COLORS.read,
                        )}>
                          {STATUS_LABELS[q.status] ?? q.status}
                        </span>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detail + Reply panel */}
        {selected && (
          <div className="bg-[var(--color-card)] border border-[var(--color-lavender)]/20 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 px-4 sm:px-6 pt-6 pb-4 border-b border-[var(--color-card-hover)]">
              <div className="min-w-0">
                <h3 className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
                  Consulta de{' '}
                  <a
                    href={`mailto:${selected.email}`}
                    className="text-[var(--color-lavender)] hover:underline"
                    onClick={e => e.stopPropagation()}
                  >
                    {selected.email}
                  </a>
                </h3>
                <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
                  {formatDate(selected.created_at)}
                  {selected.products && ` · Producto: ${selected.products.name}`}
                  {selected.phone && ` · Tel: ${selected.phone}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={clsx(
                  'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-[var(--font-cond)] font-medium tracking-wide border',
                  STATUS_COLORS[selected.status] ?? STATUS_COLORS.read,
                )}>
                  {STATUS_LABELS[selected.status] ?? selected.status}
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="p-2 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[var(--color-card-hover)] transition-colors"
                  aria-label="Cerrar panel"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Hilo de la conversación — el cliente nunca lo ve: para él son
                correos normales. Sus mensajes a la izquierda, los tuyos a la
                derecha. */}
            <div className="px-4 sm:px-6 py-4">
              <p className="text-xs font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] mb-3">
                Conversación
              </p>

              {threadLoading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-[var(--color-mid)] font-[var(--font-body)]">
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  Cargando conversación…
                </div>
              ) : displayThread.length === 0 ? (
                <div className="bg-[var(--color-ink)] rounded-xl px-4 sm:px-5 py-4">
                  <p className="text-sm italic text-[var(--color-mid)] font-[var(--font-body)]">
                    Sin mensajes.
                  </p>
                </div>
              ) : (
                <ol className="flex flex-col gap-3">
                  {displayThread.map(m => {
                    const mine = m.direction === 'out'
                    return (
                      <li key={m.id} className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
                        <div className={clsx(
                          'max-w-[85%] sm:max-w-[75%] rounded-xl px-4 py-3 border',
                          mine
                            ? 'bg-[var(--color-lavender)]/12 border-[var(--color-lavender)]/25'
                            : 'bg-[var(--color-ink)] border-[var(--color-card-hover)]',
                        )}>
                          <p className="text-[11px] font-[var(--font-cond)] tracking-wide uppercase text-[var(--color-mid)] mb-1.5">
                            {mine ? 'Tú' : selected.email} · {formatDate(m.created_at)}
                          </p>
                          <p className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)] leading-relaxed whitespace-pre-wrap">
                            {m.body}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>

            {/* Actions */}
            <div className="px-4 sm:px-6 pb-4 flex flex-wrap gap-2">
              {selected.deleted_at ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setDeleted(selected, false)}
                  className="gap-2"
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  Restaurar de la papelera
                </Button>
              ) : (
                <>
                  {/* Reply button — primary action */}
                  {selected.status !== 'archived' && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => replyOpen ? setReplyOpen(false) : openReplyCompose(selected)}
                      className="gap-2"
                    >
                      <Mail size={14} aria-hidden="true" />
                      {replyOpen ? 'Cancelar respuesta' : 'Responder por email'}
                    </Button>
                  )}
                  {selected.status === 'new' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => updateStatus(selected, 'read')}
                      className="gap-2"
                    >
                      <CheckCheck size={14} aria-hidden="true" />
                      Marcar leída
                    </Button>
                  )}
                  {selected.status !== 'archived' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => updateStatus(selected, 'archived')}
                      className="gap-2"
                    >
                      <Archive size={14} aria-hidden="true" />
                      Archivar
                    </Button>
                  )}
                  {selected.status === 'archived' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => updateStatus(selected, 'new')}
                      className="gap-2"
                    >
                      <RotateCcw size={14} aria-hidden="true" />
                      Restaurar
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleted(selected, true)}
                    className="gap-2 text-[var(--color-brand-red)] hover:bg-[var(--color-brand-red)]/10 ml-auto"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    Eliminar
                  </Button>
                </>
              )}
            </div>

            {/* Compose reply area */}
            {replyOpen && (
              <div className="border-t border-[var(--color-lavender)]/20 px-4 sm:px-6 py-5 space-y-4 bg-[var(--color-ink)]/40">
                <p className="text-xs font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-lavender)]">
                  Redactar respuesta
                </p>

                {/* To: */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide w-14 shrink-0">
                    Para:
                  </span>
                  <span className="text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-card)] px-3 py-1.5 rounded-lg border border-[var(--color-card-hover)]">
                    {selected.email}
                  </span>
                </div>

                {/* Subject */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide w-14 shrink-0">
                    Asunto:
                  </span>
                  <input
                    type="text"
                    value={replySubject}
                    onChange={e => setReplySubject(e.target.value)}
                    className="flex-1 text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-card)] px-3 py-1.5 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors"
                  />
                </div>

                {/* Body */}
                <textarea
                  value={replyBody}
                  onChange={e => setReplyBody(e.target.value)}
                  rows={10}
                  className="w-full text-sm text-[var(--color-cream-dim)] font-[var(--font-body)] bg-[var(--color-card)] px-4 py-3 rounded-xl border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors resize-y leading-relaxed"
                  placeholder="Escribe tu respuesta aquí…"
                />

                {/* Send */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)]">
                    El email se enviará a{' '}
                    <span className="text-[var(--color-cream)]">{selected.email}</span>{' '}
                    y la consulta quedará marcada como{' '}
                    <span className="text-green-400">Respondida</span>.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => sendReply(selected)}
                    disabled={replySending}
                    className="gap-2 shrink-0"
                  >
                    {replySending
                      ? <><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Enviando…</>
                      : <><Send size={14} aria-hidden="true" /> Enviar respuesta</>
                    }
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Espacio extra para que la barra flotante no tape contenido */}
        {selectedCount > 0 && <div aria-hidden="true" className="h-20" />}
      </div>

      {/* Barra de acciones en lote (sticky bottom) */}
      {selectedCount > 0 && (
        <div
          role="region"
          aria-label="Acciones en lote sobre consultas"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-4xl"
        >
          <div className="flex flex-wrap items-center gap-3 bg-[var(--color-card)]/95 backdrop-blur-md border border-[var(--color-lavender)]/50 rounded-2xl px-4 py-3 shadow-2xl shadow-black/40">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-[var(--color-lavender)] text-[var(--color-ink)] text-xs font-bold">
                {selectedCount}
              </span>
              <span className="text-sm font-[var(--font-cond)] text-[var(--color-cream)] tracking-wide">
                {selectedCount === 1 ? 'consulta seleccionada' : 'consultas seleccionadas'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto">
              {showTrash ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={bulkRestoreTrash}
                  disabled={bulkBusy}
                  className="flex-1 sm:flex-none justify-center gap-1.5"
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  Restaurar
                </Button>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={bulkMarkRead}
                    disabled={bulkBusy}
                    className="flex-1 sm:flex-none justify-center gap-1.5"
                  >
                    <CheckCheck size={14} aria-hidden="true" />
                    Marcar leídas
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={bulkArchive}
                    disabled={bulkBusy}
                    className="flex-1 sm:flex-none justify-center gap-1.5"
                  >
                    <Archive size={14} aria-hidden="true" />
                    Archivar
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={bulkRestoreStatus}
                    disabled={bulkBusy}
                    className="flex-1 sm:flex-none justify-center gap-1.5"
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    Restaurar a Nueva
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={bulkDelete}
                    disabled={bulkBusy}
                    className="flex-1 sm:flex-none justify-center gap-1.5"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    Eliminar
                  </Button>
                </>
              )}
              <button
                type="button"
                onClick={clearSelection}
                disabled={bulkBusy}
                className="p-1.5 rounded-md text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[var(--color-card-hover)] transition-colors disabled:opacity-50"
                aria-label="Limpiar selección"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </>
  )
}
