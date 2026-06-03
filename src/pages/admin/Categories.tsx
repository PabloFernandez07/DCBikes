import { useState, useEffect, useCallback } from 'react'
import { Trash2, Pencil, Check, X, Plus, ChevronUp, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'

interface Category {
  id: string
  slug: string
  name: string
  sort_order: number
  created_at: string
  products?: { count: number }[]
}

const toSlug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function productCount(cat: Category): number {
  if (!cat.products) return 0
  if (Array.isArray(cat.products) && cat.products.length > 0) {
    return (cat.products[0] as { count: number }).count ?? 0
  }
  return 0
}

export function Categories() {
  const { toasts, toast, dismiss } = useToast()

  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [movingId, setMovingId] = useState<string | null>(null)

  // Edit inline state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [editSort, setEditSort] = useState('')
  const [editError, setEditError] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  // New category form
  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [newSort, setNewSort] = useState('')
  const [newError, setNewError] = useState('')
  const [adding, setAdding] = useState(false)

  // Auto-rellena "Posición" con max(sort_order)+1 cuando se cargan/recargan
  // las categorías. Si el usuario está editando el campo manualmente, no le
  // sobrescribimos (solo lo seteamos cuando newSort está vacío o coincide con
  // el último max-1, lo que indica que es valor por defecto y no manual).
  useEffect(() => {
    const max = categories.length > 0
      ? Math.max(...categories.map(c => c.sort_order))
      : 0
    const next = String(max + 1)
    setNewSort(prev => (prev === '' || prev === String(max) ? next : prev))
  }, [categories])

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, slug, sort_order, created_at, products(count)')
      .order('sort_order', { ascending: true })

    if (error) {
      toast.error('Error al cargar categorías: ' + error.message)
    } else {
      setCategories((data as Category[]) ?? [])
    }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  // ── NEW CATEGORY ─────────────────────────────────────────────────────────────

  function handleNewNameChange(val: string) {
    setNewName(val)
    setNewSlug(toSlug(val))
  }

  async function handleAdd() {
    setNewError('')
    const name = newName.trim()
    const slug = newSlug.trim()
    const sort = parseInt(newSort, 10)

    if (!name) { setNewError('El nombre es obligatorio'); return }
    if (!slug) { setNewError('El slug es obligatorio'); return }
    if (isNaN(sort)) { setNewError('El orden debe ser un número'); return }

    setAdding(true)

    // Auto-shift: incrementar todas las categorías en posición >= sort
    const toShift = categories.filter(c => c.sort_order >= sort)
    if (toShift.length > 0) {
      const shiftErrors = await Promise.all(
        toShift.map(c =>
          (supabase.from('categories') as any)
            .update({ sort_order: c.sort_order + 1 })
            .eq('id', c.id)
        )
      )
      const firstErr = shiftErrors.find(r => r.error)
      if (firstErr?.error) {
        setNewError('Error al reordenar: ' + firstErr.error.message)
        setAdding(false)
        return
      }
    }

    const { error } = await (supabase.from('categories') as any)
      .insert({ name, slug, sort_order: sort })

    if (error) {
      setNewError(error.message)
    } else {
      toast.success(`Categoría "${name}" creada en posición ${sort}`)
      setNewName('')
      setNewSlug('')
      // newSort: el useEffect lo recalcula al refetch de categories
      setNewSort('')
      await fetchCategories()
    }
    setAdding(false)
  }

  // ── EDIT INLINE ──────────────────────────────────────────────────────────────

  function startEdit(cat: Category) {
    setEditingId(cat.id)
    setEditName(cat.name)
    setEditSlug(cat.slug)
    setEditSort(String(cat.sort_order))
    setEditError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditError('')
  }

  function handleEditNameChange(val: string) {
    setEditName(val)
    setEditSlug(toSlug(val))
  }

  async function handleSave(cat: Category) {
    setEditError('')
    const name = editName.trim()
    const slug = editSlug.trim()
    const sort = parseInt(editSort, 10)

    if (!name) { setEditError('El nombre es obligatorio'); return }
    if (!slug) { setEditError('El slug es obligatorio'); return }
    if (isNaN(sort)) { setEditError('El orden debe ser un número'); return }

    setSavingId(cat.id)

    // Auto-shift si cambia la posición y hay colisión
    if (sort !== cat.sort_order) {
      const toShift = categories.filter(c => c.id !== cat.id && c.sort_order >= sort)
      if (toShift.length > 0) {
        await Promise.all(
          toShift.map(c =>
            (supabase.from('categories') as any)
              .update({ sort_order: c.sort_order + 1 })
              .eq('id', c.id)
          )
        )
      }
    }

    const { error } = await (supabase.from('categories') as any)
      .update({ name, slug, sort_order: sort })
      .eq('id', cat.id)

    if (error) {
      setEditError(error.message)
    } else {
      toast.success(`Categoría "${name}" actualizada`)
      setEditingId(null)
      await fetchCategories()
    }
    setSavingId(null)
  }

  // ── MOVE UP / DOWN ───────────────────────────────────────────────────────────

  async function handleMove(cat: Category, idx: number, direction: 'up' | 'down') {
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    const swapCat = categories[swapIdx]
    if (!swapCat) return

    setMovingId(cat.id)
    const [r1, r2] = await Promise.all([
      (supabase.from('categories') as any)
        .update({ sort_order: swapCat.sort_order })
        .eq('id', cat.id),
      (supabase.from('categories') as any)
        .update({ sort_order: cat.sort_order })
        .eq('id', swapCat.id),
    ])

    if (r1.error || r2.error) {
      toast.error('Error al mover la categoría')
    } else {
      await fetchCategories()
    }
    setMovingId(null)
  }

  // ── DELETE ───────────────────────────────────────────────────────────────────

  async function handleDelete(cat: Category) {
    const count = productCount(cat)
    if (count > 0) {
      toast.error(`No se puede eliminar: tiene ${count} producto${count !== 1 ? 's' : ''}`)
      return
    }
    const confirmed = window.confirm(`¿Eliminar la categoría "${cat.name}"? Esta acción no se puede deshacer.`)
    if (!confirmed) return

    const { error } = await (supabase.from('categories') as any)
      .delete()
      .eq('id', cat.id)

    if (error) {
      toast.error('Error al eliminar: ' + error.message)
    } else {
      toast.success(`Categoría "${cat.name}" eliminada`)
      setCategories(prev => prev.filter(c => c.id !== cat.id))
    }
  }

  // ── RENDER ───────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-xl md:text-2xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest">
            CATEGORÍAS
          </h1>
          <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
            Gestiona las categorías de productos
          </p>
        </div>

        {/* Table */}
        <div className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-12 flex justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-[var(--color-lavender)] border-t-transparent animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-card-hover)]">
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide w-20">
                      Pos.
                    </th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">
                      Nombre
                    </th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide hidden sm:table-cell">
                      Slug
                    </th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide w-24 text-right">
                      Productos
                    </th>
                    <th className="px-4 py-3.5 text-right text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide w-36">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {categories.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-sm text-[var(--color-mid)] font-[var(--font-body)]">
                        No hay categorías todavía.
                      </td>
                    </tr>
                  )}

                  {categories.map((cat, idx) => (
                    <tr
                      key={cat.id}
                      className="border-b border-[var(--color-card-hover)]/40 last:border-0 transition-colors hover:bg-[var(--color-card-hover)]/20"
                    >
                      {editingId === cat.id ? (
                        // ── EDIT MODE ──────────────────────────────────────────
                        <>
                          <td className="px-4 py-2.5">
                            <input
                              type="number"
                              value={editSort}
                              onChange={e => setEditSort(e.target.value)}
                              className="w-16 text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-ink)] px-2 py-1.5 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="space-y-1">
                              <input
                                type="text"
                                value={editName}
                                onChange={e => handleEditNameChange(e.target.value)}
                                className="w-full text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-ink)] px-2 py-1.5 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors"
                                placeholder="Nombre"
                              />
                              {editError && (
                                <p className="text-xs text-[var(--color-brand-red)] font-[var(--font-body)]">
                                  {editError}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 hidden sm:table-cell">
                            <input
                              type="text"
                              value={editSlug}
                              onChange={e => setEditSlug(e.target.value)}
                              className="w-full text-sm text-[var(--color-cream-dim)] font-[var(--font-body)] bg-[var(--color-ink)] px-2 py-1.5 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors font-mono"
                              placeholder="slug"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <span className="text-[var(--color-cream-dim)] font-[var(--font-body)]">
                              {productCount(cat)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleSave(cat)}
                                disabled={savingId === cat.id}
                                className="p-1.5 rounded-lg text-green-400 hover:bg-green-400/10 transition-colors disabled:opacity-50"
                                aria-label="Guardar"
                              >
                                {savingId === cat.id
                                  ? <div className="w-4 h-4 rounded-full border-2 border-green-400 border-t-transparent animate-spin" />
                                  : <Check size={15} aria-hidden="true" />
                                }
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="p-1.5 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[var(--color-card-hover)] transition-colors"
                                aria-label="Cancelar"
                              >
                                <X size={15} aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        // ── READ MODE ──────────────────────────────────────────
                        <>
                          <td className="px-4 py-3 text-[var(--color-mid)] font-[var(--font-body)]">
                            {cat.sort_order}
                          </td>
                          <td
                            className="px-4 py-3 text-[var(--color-cream)] font-[var(--font-cond)] font-medium tracking-wide cursor-pointer"
                            onClick={() => startEdit(cat)}
                          >
                            {cat.name}
                          </td>
                          <td className="px-4 py-3 text-[var(--color-mid)] font-mono text-xs hidden sm:table-cell">
                            {cat.slug}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full bg-[var(--color-card-hover)] text-[var(--color-cream-dim)] text-xs font-[var(--font-cond)] font-medium">
                              {productCount(cat)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-0.5">
                              {/* ↑↓ reorder */}
                              <button
                                type="button"
                                onClick={() => handleMove(cat, idx, 'up')}
                                disabled={idx === 0 || movingId === cat.id}
                                className="p-1.5 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-lavender)] hover:bg-[var(--color-lavender)]/10 transition-colors disabled:opacity-20 disabled:pointer-events-none"
                                aria-label="Subir"
                              >
                                {movingId === cat.id
                                  ? <div className="w-3.5 h-3.5 rounded-full border-2 border-[var(--color-lavender)] border-t-transparent animate-spin" />
                                  : <ChevronUp size={14} aria-hidden="true" />
                                }
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMove(cat, idx, 'down')}
                                disabled={idx === categories.length - 1 || movingId === cat.id}
                                className="p-1.5 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-lavender)] hover:bg-[var(--color-lavender)]/10 transition-colors disabled:opacity-20 disabled:pointer-events-none"
                                aria-label="Bajar"
                              >
                                <ChevronDown size={14} aria-hidden="true" />
                              </button>

                              {/* divider */}
                              <span className="w-px h-4 bg-[var(--color-card-hover)] mx-0.5" />

                              {/* edit / delete */}
                              <button
                                type="button"
                                onClick={() => startEdit(cat)}
                                className="p-1.5 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-lavender)] hover:bg-[var(--color-lavender)]/10 transition-colors"
                                aria-label="Editar"
                              >
                                <Pencil size={14} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(cat)}
                                className="p-1.5 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-brand-red)] hover:bg-[var(--color-brand-red)]/10 transition-colors"
                                aria-label="Eliminar"
                              >
                                <Trash2 size={14} aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add new category form */}
        <div className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-5">
          <h2 className="text-sm font-[var(--font-cond)] font-semibold text-[var(--color-lavender)] tracking-widest uppercase mb-1">
            Añadir categoría
          </h2>
          <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)] mb-4">
            Si introduces una posición ocupada, las categorías existentes se desplazarán hacia abajo automáticamente.
          </p>

          <div className="flex flex-wrap gap-3 items-start">
            <div className="flex-1 min-w-[180px]">
              <Field
                label="Nombre"
                value={newName}
                onChange={e => handleNewNameChange((e.target as HTMLInputElement).value)}
                placeholder="Ej: Mountain Bike"
                error={newError}
              />
            </div>

            <div className="flex-1 min-w-[160px]">
              <Field
                label="Slug"
                value={newSlug}
                onChange={e => setNewSlug((e.target as HTMLInputElement).value)}
                placeholder="mountain-bike"
              />
            </div>

            <div className="w-28">
              <Field
                label="Posición"
                value={newSort}
                onChange={e => setNewSort((e.target as HTMLInputElement).value)}
                placeholder="1"
              />
            </div>

            <div className="flex items-end pb-0.5">
              <Button
                variant="primary"
                size="sm"
                onClick={handleAdd}
                disabled={adding}
                className="gap-2 whitespace-nowrap"
              >
                {adding
                  ? <div className="w-4 h-4 rounded-full border-2 border-white/60 border-t-transparent animate-spin" />
                  : <Plus size={14} aria-hidden="true" />
                }
                Añadir
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </>
  )
}
