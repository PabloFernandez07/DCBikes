import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Search,
  Layers,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  X,
  Unlink,
  Save,
  ArrowRightLeft,
  Lock,
} from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'
import type { Product } from '@/lib/database.types'

// ─── Persistencia local de grupos "confirmados" ────────────────────────
const CONFIRMED_KEY = 'dcbikes_confirmed_groups'

function readConfirmed(): Set<string> {
  try {
    const raw = localStorage.getItem(CONFIRMED_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (Array.isArray(arr)) return new Set(arr.filter(x => typeof x === 'string'))
    return new Set()
  } catch {
    return new Set()
  }
}

function writeConfirmed(set: Set<string>) {
  localStorage.setItem(CONFIRMED_KEY, JSON.stringify(Array.from(set)))
}

// ─── Tipos ──────────────────────────────────────────────────────────────

interface GroupSummary {
  model_group: string
  count: number
}

type FilterMode = 'all' | 'pending' | 'confirmed'

// ─── Página ─────────────────────────────────────────────────────────────

export default function Groupings() {
  const { toasts, toast, dismiss } = useToast()

  const [groups, setGroups] = useState<GroupSummary[]>([])
  const [ungroupedCount, setUngroupedCount] = useState(0)
  const [loadingGroups, setLoadingGroups] = useState(true)

  const [confirmedSet, setConfirmedSet] = useState<Set<string>>(() => readConfirmed())
  const [search, setSearch] = useState('')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [ungroupedOpen, setUngroupedOpen] = useState(false)

  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [variants, setVariants] = useState<Product[]>([])
  const [loadingVariants, setLoadingVariants] = useState(false)
  const [sizeEdits, setSizeEdits] = useState<Record<string, string>>({})
  const [savingProductId, setSavingProductId] = useState<string | null>(null)

  // Modales
  const [breakOpen, setBreakOpen] = useState(false)
  const [breakRunning, setBreakRunning] = useState(false)
  const [moveTarget, setMoveTarget] = useState<Product | null>(null)
  const [moveQuery, setMoveQuery] = useState('')
  const [moveRunning, setMoveRunning] = useState(false)

  // ─── Fetch sumario de grupos ─────────────────────────────────────────
  const fetchGroups = useCallback(async () => {
    setLoadingGroups(true)
    // No hay agregaciones nativas con sintaxis simple; bajamos solo model_group
    // de todos los productos y agrupamos en cliente. Para 1.816 productos es OK.
    const { data, error } = await supabase
      .from('products')
      .select('model_group')
      .order('model_group', { ascending: true })

    if (error) {
      toast.error('Error cargando grupos: ' + error.message)
      setLoadingGroups(false)
      return
    }

    const counts = new Map<string, number>()
    let ungrouped = 0
    for (const row of data ?? []) {
      const g = (row as { model_group: string | null }).model_group
      if (g && g.trim()) {
        counts.set(g, (counts.get(g) ?? 0) + 1)
      } else {
        ungrouped++
      }
    }
    const list: GroupSummary[] = Array.from(counts.entries())
      .map(([model_group, count]) => ({ model_group, count }))
      .sort((a, b) => a.model_group.localeCompare(b.model_group))

    setGroups(list)
    // Conteo real de sin-agrupar: el fetch de arriba tope 1000 filas, así que el
    // conteo en memoria se quedaba corto con >1000 productos. Lo pedimos exacto.
    const { count: ungroupedReal } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .is('model_group', null)
    setUngroupedCount(ungroupedReal ?? ungrouped)
    setLoadingGroups(false)
  }, [toast])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  // ─── Fetch variantes del grupo seleccionado ──────────────────────────
  const fetchVariants = useCallback(
    async (group: string) => {
      setLoadingVariants(true)
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('model_group', group)
        .order('size_label', { ascending: true, nullsFirst: true })

      if (error) {
        toast.error('Error cargando variantes: ' + error.message)
        setLoadingVariants(false)
        return
      }
      const rows = (data as Product[]) ?? []
      setVariants(rows)
      setSizeEdits(
        Object.fromEntries(rows.map(r => [r.id, r.size_label ?? ''])),
      )
      setLoadingVariants(false)
    },
    [toast],
  )

  useEffect(() => {
    if (selectedGroup) {
      fetchVariants(selectedGroup)
    } else {
      setVariants([])
      setSizeEdits({})
    }
  }, [selectedGroup, fetchVariants])

  // ─── Filtrado de grupos en sidebar ───────────────────────────────────
  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    return groups.filter(g => {
      if (q && !g.model_group.toLowerCase().includes(q)) return false
      if (filterMode === 'confirmed' && !confirmedSet.has(g.model_group)) return false
      if (filterMode === 'pending' && confirmedSet.has(g.model_group)) return false
      return true
    })
  }, [groups, search, filterMode, confirmedSet])

  // ─── Acciones ────────────────────────────────────────────────────────

  const handleConfirmGroup = () => {
    if (!selectedGroup) return
    const next = new Set(confirmedSet)
    if (next.has(selectedGroup)) {
      next.delete(selectedGroup)
      toast.info('Grupo marcado como pendiente')
    } else {
      next.add(selectedGroup)
      toast.success('Grupo confirmado')
    }
    setConfirmedSet(next)
    writeConfirmed(next)
  }

  const handleSaveSize = async (product: Product) => {
    const newSize = sizeEdits[product.id]?.trim() ?? ''
    if ((product.size_label ?? '') === newSize) return
    setSavingProductId(product.id)
    const { error } = await supabase
      .from('products')
      .update({ size_label: newSize === '' ? null : newSize })
      .eq('id', product.id)
    setSavingProductId(null)
    if (error) {
      toast.error('Error guardando talla: ' + error.message)
    } else {
      toast.success('Talla actualizada')
      setVariants(prev =>
        prev.map(p =>
          p.id === product.id
            ? { ...p, size_label: newSize === '' ? null : newSize }
            : p,
        ),
      )
    }
  }

  const handleRemoveFromGroup = async (product: Product) => {
    setSavingProductId(product.id)
    const { error } = await supabase
      .from('products')
      .update({ model_group: null })
      .eq('id', product.id)
    setSavingProductId(null)
    if (error) {
      toast.error('Error: ' + error.message)
      return
    }
    toast.success(`"${product.name}" sacado del grupo`)
    setVariants(prev => prev.filter(p => p.id !== product.id))
    // Refresca sumario en background
    fetchGroups()
  }

  const handleBreakGroup = async () => {
    if (!selectedGroup) return
    setBreakRunning(true)
    const { error } = await supabase
      .from('products')
      .update({ model_group: null })
      .eq('model_group', selectedGroup)
    setBreakRunning(false)
    setBreakOpen(false)
    if (error) {
      toast.error('Error rompiendo grupo: ' + error.message)
      return
    }
    toast.success(`Grupo "${selectedGroup}" disuelto`)
    // Eliminar del set confirmado si estaba
    if (confirmedSet.has(selectedGroup)) {
      const next = new Set(confirmedSet)
      next.delete(selectedGroup)
      setConfirmedSet(next)
      writeConfirmed(next)
    }
    setSelectedGroup(null)
    fetchGroups()
  }

  const handleMoveProduct = async (targetGroup: string) => {
    if (!moveTarget) return
    const trimmed = targetGroup.trim()
    if (!trimmed) {
      toast.error('Introduce un nombre de grupo válido')
      return
    }
    setMoveRunning(true)
    const { error } = await supabase
      .from('products')
      .update({ model_group: trimmed })
      .eq('id', moveTarget.id)
    setMoveRunning(false)
    if (error) {
      toast.error('Error moviendo producto: ' + error.message)
      return
    }
    toast.success(`Movido a "${trimmed}"`)
    setVariants(prev => prev.filter(p => p.id !== moveTarget.id))
    setMoveTarget(null)
    setMoveQuery('')
    fetchGroups()
  }

  // Sugerencias autocomplete para el modal de mover
  const moveSuggestions = useMemo(() => {
    const q = moveQuery.trim().toLowerCase()
    return groups
      .filter(
        g =>
          g.model_group !== selectedGroup &&
          (q === '' || g.model_group.toLowerCase().includes(q)),
      )
      .slice(0, 6)
  }, [groups, moveQuery, selectedGroup])

  // ─── Render ──────────────────────────────────────────────────────────
  const isConfirmed = selectedGroup ? confirmedSet.has(selectedGroup) : false
  const totalConfirmed = useMemo(
    () => groups.filter(g => confirmedSet.has(g.model_group)).length,
    [groups, confirmedSet],
  )

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest">
              AGRUPACIONES
            </h1>
            <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)]">
              Revisa y corrige las variantes detectadas automáticamente · {groups.length} grupos · {totalConfirmed} confirmados · {ungroupedCount} sin agrupar
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 lg:min-h-[600px]">
          {/* ─── Sidebar ──────────────────────────────────────── */}
          <aside className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl flex flex-col overflow-hidden max-h-[60vh] lg:max-h-[calc(100vh-180px)]">
            <div className="p-3 border-b border-[var(--color-card-hover)] space-y-2">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-mid)]"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  placeholder="Buscar grupo..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-[var(--color-ink)] border border-[var(--color-card-hover)] rounded-lg pl-8 pr-3 py-2 text-xs text-[var(--color-cream)] placeholder-[var(--color-mid)] focus:outline-none focus:border-[var(--color-lavender)] transition-colors"
                />
              </div>

              <div className="flex gap-1">
                {(
                  [
                    { v: 'all', label: 'Todos' },
                    { v: 'pending', label: 'Pendientes' },
                    { v: 'confirmed', label: 'Confirmados' },
                  ] as { v: FilterMode; label: string }[]
                ).map(opt => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setFilterMode(opt.v)}
                    className={clsx(
                      'flex-1 px-2 py-1.5 rounded-md text-[10px] font-[var(--font-cond)] tracking-wider uppercase transition-colors',
                      filterMode === opt.v
                        ? 'bg-[var(--color-lavender)] text-[var(--color-ink)]'
                        : 'bg-[var(--color-ink)] text-[var(--color-mid)] hover:text-[var(--color-cream)]',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingGroups ? (
                <div className="p-8 flex justify-center">
                  <div className="w-5 h-5 rounded-full border-2 border-[var(--color-lavender)] border-t-transparent animate-spin" />
                </div>
              ) : filteredGroups.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-[var(--color-mid)] font-[var(--font-body)]">
                  No hay grupos {search || filterMode !== 'all' ? 'con esos filtros' : 'detectados aún'}.
                </p>
              ) : (
                <ul className="py-1">
                  {filteredGroups.map(g => {
                    const active = g.model_group === selectedGroup
                    const confirmed = confirmedSet.has(g.model_group)
                    return (
                      <li key={g.model_group}>
                        <button
                          type="button"
                          onClick={() => setSelectedGroup(g.model_group)}
                          className={clsx(
                            'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
                            active
                              ? 'bg-[var(--color-lavender)]/15 text-[var(--color-cream)]'
                              : 'text-[var(--color-cream-dim)] hover:bg-[var(--color-card-hover)]/40',
                          )}
                        >
                          {confirmed ? (
                            <CheckCircle2
                              size={13}
                              className="shrink-0 text-emerald-400"
                              aria-label="Confirmado"
                            />
                          ) : (
                            <Clock
                              size={13}
                              className="shrink-0 text-[var(--color-mid)]"
                              aria-label="Pendiente"
                            />
                          )}
                          <span className="flex-1 truncate text-xs font-mono">
                            {g.model_group}
                          </span>
                          <span
                            className={clsx(
                              'text-[10px] px-1.5 py-0.5 rounded-md font-[var(--font-cond)] font-semibold',
                              active
                                ? 'bg-[var(--color-lavender)]/30 text-[var(--color-lavender)]'
                                : 'bg-[var(--color-ink)] text-[var(--color-mid)]',
                            )}
                          >
                            {g.count}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Sin agrupar */}
            <div className="border-t border-[var(--color-card-hover)]">
              <button
                type="button"
                onClick={() => setUngroupedOpen(o => !o)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs font-[var(--font-cond)] tracking-wide text-[var(--color-cream-dim)] hover:bg-[var(--color-card-hover)]/40 transition-colors"
              >
                {ungroupedOpen ? (
                  <ChevronDown size={13} className="text-[var(--color-mid)]" aria-hidden="true" />
                ) : (
                  <ChevronRight size={13} className="text-[var(--color-mid)]" aria-hidden="true" />
                )}
                <span className="flex-1">Sin agrupar</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--color-ink)] text-[var(--color-mid)] font-semibold">
                  {ungroupedCount}
                </span>
              </button>
              {ungroupedOpen && (
                <UngroupedList
                  onRefresh={() => {
                    fetchGroups()
                    if (selectedGroup) fetchVariants(selectedGroup)
                  }}
                  groups={groups}
                  toast={toast}
                />
              )}
            </div>
          </aside>

          {/* ─── Main panel ──────────────────────────────────── */}
          <main className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl overflow-hidden">
            {!selectedGroup ? (
              <EmptyState />
            ) : (
              <div className="flex flex-col h-full">
                {/* Header del panel */}
                <div className="px-5 py-4 border-b border-[var(--color-card-hover)] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Layers size={16} className="text-[var(--color-lavender)] shrink-0" aria-hidden="true" />
                    <h2 className="font-mono text-sm text-[var(--color-cream)] truncate">
                      {selectedGroup}
                    </h2>
                    {isConfirmed && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-[var(--font-cond)] uppercase tracking-wider">
                        <Lock size={10} aria-hidden="true" />
                        Confirmado
                      </span>
                    )}
                    <span className="text-xs text-[var(--color-mid)] font-[var(--font-body)]">
                      · {variants.length} {variants.length === 1 ? 'variante' : 'variantes'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant={isConfirmed ? 'ghost' : 'primary'}
                      size="sm"
                      onClick={handleConfirmGroup}
                    >
                      <CheckCircle2 size={14} aria-hidden="true" />
                      {isConfirmed ? 'Marcar pendiente' : 'Confirmar grupo'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setBreakOpen(true)}
                    >
                      <Unlink size={14} aria-hidden="true" />
                      Romper grupo
                    </Button>
                  </div>
                </div>

                {/* Lista de variantes */}
                <div className="flex-1 overflow-y-auto">
                  {loadingVariants ? (
                    <div className="p-12 flex justify-center">
                      <div className="w-6 h-6 rounded-full border-2 border-[var(--color-lavender)] border-t-transparent animate-spin" />
                    </div>
                  ) : variants.length === 0 ? (
                    <p className="px-6 py-12 text-center text-sm text-[var(--color-mid)] font-[var(--font-body)]">
                      El grupo está vacío.
                    </p>
                  ) : (
                    <>
                      {/* Modelo padre virtual (primera variante) */}
                      <ParentModelPreview product={variants[0]} />

                      <div className="border-t border-[var(--color-card-hover)]">
                        <div className="px-5 py-3 bg-[var(--color-ink)]/40 text-[10px] font-[var(--font-cond)] tracking-[0.2em] uppercase text-[var(--color-mid)]">
                          Variantes
                        </div>
                        <ul className="divide-y divide-[var(--color-card-hover)]/40">
                          {variants.map(v => (
                            <VariantRow
                              key={v.id}
                              product={v}
                              sizeValue={sizeEdits[v.id] ?? ''}
                              onSizeChange={value =>
                                setSizeEdits(prev => ({ ...prev, [v.id]: value }))
                              }
                              onSaveSize={() => handleSaveSize(v)}
                              onRemove={() => handleRemoveFromGroup(v)}
                              onMove={() => {
                                setMoveTarget(v)
                                setMoveQuery('')
                              }}
                              saving={savingProductId === v.id}
                            />
                          ))}
                        </ul>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Modal: confirmar romper grupo */}
      <Modal
        open={breakOpen}
        onClose={() => (breakRunning ? undefined : setBreakOpen(false))}
        title="¿Romper este grupo?"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)] leading-relaxed">
            Todas las variantes de <span className="font-mono text-[var(--color-lavender)]">{selectedGroup}</span> ({variants.length}) pasarán a ser productos individuales. Esta acción no se puede deshacer fácilmente — habría que reagrupar manualmente.
          </p>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--color-card-hover)]">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setBreakOpen(false)}
              disabled={breakRunning}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={breakRunning}
              onClick={handleBreakGroup}
            >
              <Unlink size={14} aria-hidden="true" />
              Sí, romper grupo
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: mover producto a otro grupo */}
      <Modal
        open={moveTarget !== null}
        onClose={() => (moveRunning ? undefined : setMoveTarget(null))}
        title="Mover a otro grupo"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide uppercase mb-1">
              Producto
            </p>
            <p className="text-sm text-[var(--color-cream)] font-[var(--font-body)]">
              {moveTarget?.name}
            </p>
          </div>

          <div>
            <label className="text-xs font-[var(--font-cond)] font-medium text-[var(--color-cream-dim)] tracking-wide uppercase">
              Grupo destino
            </label>
            <input
              type="text"
              value={moveQuery}
              onChange={e => setMoveQuery(e.target.value)}
              placeholder="Ej. casco-met-aleph"
              className="w-full mt-1.5 bg-[var(--color-ink)] border border-[var(--color-card-hover)] rounded-lg px-3 py-2 text-sm font-mono text-[var(--color-cream)] placeholder-[var(--color-mid)] focus:outline-none focus:border-[var(--color-lavender)] transition-colors"
              autoFocus
            />
            {moveSuggestions.length > 0 && (
              <ul className="mt-2 max-h-44 overflow-y-auto border border-[var(--color-card-hover)] rounded-lg divide-y divide-[var(--color-card-hover)]/40">
                {moveSuggestions.map(s => (
                  <li key={s.model_group}>
                    <button
                      type="button"
                      onClick={() => setMoveQuery(s.model_group)}
                      className="w-full flex items-center justify-between px-3 py-2 text-left text-xs hover:bg-[var(--color-card-hover)]/40 transition-colors"
                    >
                      <span className="font-mono text-[var(--color-cream-dim)]">
                        {s.model_group}
                      </span>
                      <span className="text-[10px] text-[var(--color-mid)]">
                        {s.count}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--color-card-hover)]">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMoveTarget(null)}
              disabled={moveRunning}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={moveRunning}
              onClick={() => handleMoveProduct(moveQuery)}
              disabled={!moveQuery.trim()}
            >
              <ArrowRightLeft size={14} aria-hidden="true" />
              Mover
            </Button>
          </div>
        </div>
      </Modal>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </>
  )
}

// ─── Sub-componentes ────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="h-full min-h-[500px] flex flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[var(--color-lavender)]/10 flex items-center justify-center">
        <Layers size={26} className="text-[var(--color-lavender)]" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-[var(--font-display)] text-[var(--color-cream)] tracking-widest">
        SELECCIONA UN GRUPO
      </h3>
      <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)] max-w-sm">
        Elige uno de la izquierda para ver y editar sus variantes, ajustar tallas o confirmar la agrupación detectada.
      </p>
    </div>
  )
}

function ParentModelPreview({ product }: { product: Product }) {
  const [thumb, setThumb] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('product_images')
      .select('storage_path')
      .eq('product_id', product.id)
      .order('sort_order')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const { data: url } = supabase.storage
            .from('product-images')
            .getPublicUrl(data.storage_path)
          setThumb(url.publicUrl)
        }
      })
  }, [product.id])

  return (
    <div className="px-5 py-4 bg-[var(--color-ink)]/40">
      <div className="flex items-start gap-4">
        <div className="w-20 h-20 rounded-xl bg-[var(--color-ink)] overflow-hidden shrink-0 flex items-center justify-center border border-[var(--color-card-hover)]">
          {thumb ? (
            <img src={thumb} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-[var(--color-mid)] text-xs">Sin imagen</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-mid)] font-[var(--font-cond)]">
            Modelo padre (referencia visual)
          </p>
          <h4 className="text-base font-[var(--font-body)] font-medium text-[var(--color-cream)] mt-1 leading-tight">
            {product.name}
          </h4>
          {product.brand && (
            <p className="text-xs text-[var(--color-mid)] mt-0.5">{product.brand}</p>
          )}
          {product.short_description && (
            <p className="text-xs text-[var(--color-cream-dim)] mt-2 line-clamp-2 max-w-2xl">
              {product.short_description}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function VariantRow({
  product,
  sizeValue,
  onSizeChange,
  onSaveSize,
  onRemove,
  onMove,
  saving,
}: {
  product: Product
  sizeValue: string
  onSizeChange: (v: string) => void
  onSaveSize: () => void
  onRemove: () => void
  onMove: () => void
  saving: boolean
}) {
  const [thumb, setThumb] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('product_images')
      .select('storage_path')
      .eq('product_id', product.id)
      .order('sort_order')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const { data: url } = supabase.storage
            .from('product-images')
            .getPublicUrl(data.storage_path)
          setThumb(url.publicUrl)
        }
      })
  }, [product.id])

  const dirty = (product.size_label ?? '') !== sizeValue.trim()

  return (
    <li className="px-5 py-3 hover:bg-[var(--color-card-hover)]/20 transition-colors">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-lg bg-[var(--color-ink)] overflow-hidden flex items-center justify-center shrink-0">
          {thumb ? (
            <img src={thumb} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-[var(--color-mid)] text-[10px]">—</span>
          )}
        </div>

        <div className="flex-1 min-w-[180px]">
          <p className="text-sm text-[var(--color-cream)] font-[var(--font-body)] leading-tight">
            {product.name}
          </p>
          {product.sku && (
            <p className="text-[10px] text-[var(--color-mid)] mt-0.5">{product.sku}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-[10px] uppercase tracking-wider text-[var(--color-mid)] font-[var(--font-cond)]">
            Talla
          </label>
          <input
            type="text"
            value={sizeValue}
            onChange={e => onSizeChange(e.target.value)}
            placeholder="—"
            className="w-20 bg-[var(--color-ink)] border border-[var(--color-card-hover)] rounded-md px-2 py-1 text-xs text-[var(--color-cream)] focus:outline-none focus:border-[var(--color-lavender)] transition-colors text-center font-mono"
          />
          {dirty && (
            <button
              type="button"
              onClick={onSaveSize}
              disabled={saving}
              className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/15 transition-colors disabled:opacity-50"
              aria-label="Guardar talla"
              title="Guardar talla"
            >
              <Save size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="hidden md:flex items-center gap-3 text-xs text-[var(--color-cream-dim)] font-[var(--font-body)]">
          <span>
            <span className="text-[var(--color-mid)]">Stock</span>{' '}
            <span className="font-mono">{product.stock}</span>
          </span>
          <span>
            <span className="text-[var(--color-mid)]">PVP</span>{' '}
            <span className="font-mono">
              {product.retail_price.toLocaleString('es-ES', {
                minimumFractionDigits: 2,
              })}{' '}
              €
            </span>
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onMove}
            disabled={saving}
            className="p-2 rounded-md text-[var(--color-mid)] hover:text-[var(--color-lavender)] hover:bg-[var(--color-lavender)]/10 transition-colors disabled:opacity-50"
            aria-label="Mover a otro grupo"
            title="Mover a otro grupo"
          >
            <ArrowRightLeft size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={saving}
            className="p-2 rounded-md text-[var(--color-mid)] hover:text-[var(--color-brand-red)] hover:bg-[var(--color-brand-red)]/10 transition-colors disabled:opacity-50"
            aria-label="Sacar de este grupo"
            title="Sacar de este grupo"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  )
}

function UngroupedList({
  onRefresh,
  groups,
  toast,
}: {
  onRefresh: () => void
  groups: GroupSummary[]
  toast: ReturnType<typeof useToast>['toast']
}) {
  const [items, setItems] = useState<Product[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [moveTarget, setMoveTarget] = useState<Product | null>(null)
  const [moveQuery, setMoveQuery] = useState('')
  const [moveRunning, setMoveRunning] = useState(false)

  // Búsqueda en SERVIDOR. Antes cargaba solo los 200 primeros sin agrupar y
  // filtraba en memoria → con >1000 sin agrupar, un producto fuera de esos 200
  // no aparecía aunque lo buscaras. Ahora, al teclear, consulta el servidor por
  // nombre o SKU (con debounce) y encuentra cualquiera.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const q = search.trim()
    const timer = setTimeout(() => {
      let query = supabase
        .from('products')
        .select('id, name, sku, retail_price, stock, slug, brand, model_group')
        .is('model_group', null)
        .order('name', { ascending: true })
        .limit(q ? 100 : 200)
      if (q) {
        // Escapa los caracteres que rompen el filtro .or de PostgREST.
        const safe = q.replace(/[%,()]/g, ' ')
        query = query.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%`)
      }
      query.then(({ data }) => {
        if (cancelled) return
        setItems(((data as unknown) as Product[]) ?? [])
        setLoading(false)
      })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [search])

  // El servidor ya filtra y limita; aquí solo exponemos lo recibido.
  const filtered = useMemo(() => items ?? [], [items])

  const handleAssign = async (group: string) => {
    if (!moveTarget) return
    const trimmed = group.trim()
    if (!trimmed) return
    setMoveRunning(true)
    const { error } = await supabase
      .from('products')
      .update({ model_group: trimmed })
      .eq('id', moveTarget.id)
    setMoveRunning(false)
    if (error) {
      toast.error('Error: ' + error.message)
      return
    }
    toast.success(`Asignado a "${trimmed}"`)
    setItems(prev => (prev ? prev.filter(p => p.id !== moveTarget.id) : prev))
    setMoveTarget(null)
    setMoveQuery('')
    onRefresh()
  }

  const suggestions = useMemo(() => {
    const q = moveQuery.trim().toLowerCase()
    return groups
      .filter(g => q === '' || g.model_group.toLowerCase().includes(q))
      .slice(0, 6)
  }, [groups, moveQuery])

  return (
    <div className="max-h-72 overflow-y-auto border-t border-[var(--color-card-hover)]">
      <div className="p-2 sticky top-0 bg-[var(--color-card)] border-b border-[var(--color-card-hover)]">
        <input
          type="text"
          placeholder="Buscar producto sin agrupar..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-[var(--color-ink)] border border-[var(--color-card-hover)] rounded-md px-2 py-1.5 text-[11px] text-[var(--color-cream)] placeholder-[var(--color-mid)] focus:outline-none focus:border-[var(--color-lavender)]"
        />
      </div>

      {loading ? (
        <div className="p-4 flex justify-center">
          <div className="w-4 h-4 rounded-full border-2 border-[var(--color-lavender)] border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="px-3 py-4 text-center text-[11px] text-[var(--color-mid)]">
          Sin resultados.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-card-hover)]/40">
          {filtered.map(p => (
            <li key={p.id} className="px-3 py-2 flex items-center gap-2 text-[11px]">
              <span className="flex-1 truncate text-[var(--color-cream-dim)]" title={p.name}>
                {p.name}
              </span>
              <button
                type="button"
                onClick={() => {
                  setMoveTarget(p)
                  setMoveQuery('')
                }}
                className="p-1 rounded-md text-[var(--color-mid)] hover:text-[var(--color-lavender)] hover:bg-[var(--color-lavender)]/10 transition-colors"
                aria-label="Asignar a grupo"
                title="Asignar a grupo"
              >
                <ArrowRightLeft size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={moveTarget !== null}
        onClose={() => (moveRunning ? undefined : setMoveTarget(null))}
        title="Asignar a un grupo"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-mid)]">{moveTarget?.name}</p>
          <input
            type="text"
            value={moveQuery}
            onChange={e => setMoveQuery(e.target.value)}
            placeholder="Ej. casco-met-aleph"
            className="w-full bg-[var(--color-ink)] border border-[var(--color-card-hover)] rounded-lg px-3 py-2 text-sm font-mono text-[var(--color-cream)] focus:outline-none focus:border-[var(--color-lavender)]"
            autoFocus
          />
          {suggestions.length > 0 && (
            <ul className="max-h-44 overflow-y-auto border border-[var(--color-card-hover)] rounded-lg divide-y divide-[var(--color-card-hover)]/40">
              {suggestions.map(s => (
                <li key={s.model_group}>
                  <button
                    type="button"
                    onClick={() => setMoveQuery(s.model_group)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left text-xs hover:bg-[var(--color-card-hover)]/40 transition-colors"
                  >
                    <span className="font-mono text-[var(--color-cream-dim)]">
                      {s.model_group}
                    </span>
                    <span className="text-[10px] text-[var(--color-mid)]">{s.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--color-card-hover)]">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMoveTarget(null)}
              disabled={moveRunning}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={moveRunning}
              onClick={() => handleAssign(moveQuery)}
              disabled={!moveQuery.trim()}
            >
              Asignar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
