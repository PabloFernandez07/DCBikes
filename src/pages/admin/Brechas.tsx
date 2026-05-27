import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'

// Columnas reales de 0010_data_breaches.sql
type Breach = {
  id: string
  detected_at: string
  description: string
  source: string | null
  affected_data_categories: string[] | null
  affected_users_estimated: number | null
  contains_special_categories: boolean
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  risk_justification: string | null
  notified_aepd: boolean
  notified_aepd_at: string | null
  aepd_case_number: string | null
  notified_users: boolean
  notified_users_at: string | null
  notification_method: string | null
  containment_measures: string | null
  resolution_status: 'open' | 'contained' | 'resolved'
  resolved_at: string | null
  reported_by: string | null
  created_at: string
  updated_at: string
}

type BreachDraft = Omit<Breach, 'id' | 'reported_by' | 'created_at' | 'updated_at'>

const EMPTY_DRAFT: BreachDraft = {
  detected_at: '',
  description: '',
  source: null,
  affected_data_categories: [],
  affected_users_estimated: null,
  contains_special_categories: false,
  risk_level: 'low',
  risk_justification: null,
  notified_aepd: false,
  notified_aepd_at: null,
  aepd_case_number: null,
  notified_users: false,
  notified_users_at: null,
  notification_method: null,
  containment_measures: null,
  resolution_status: 'open',
  resolved_at: null,
}

function riskBadge(r: Breach['risk_level']) {
  const styles: Record<Breach['risk_level'], string> = {
    low: 'text-gray-400',
    medium: 'text-amber-400',
    high: 'text-orange-500 font-semibold',
    critical: 'text-[var(--color-brand-red)] font-bold',
  }
  const labels: Record<Breach['risk_level'], string> = {
    low: 'Bajo',
    medium: 'Medio',
    high: 'Alto',
    critical: 'Crítico',
  }
  return <span className={styles[r]}>{labels[r]}</span>
}

function statusLabel(s: Breach['resolution_status']) {
  const labels: Record<Breach['resolution_status'], string> = {
    open: 'Abierta',
    contained: 'Contenida',
    resolved: 'Resuelta',
  }
  return labels[s]
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

// ─── Form ─────────────────────────────────────────────────────────────────────

function BreachForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Partial<Breach>
  onSave: (b: Partial<Breach>) => Promise<void>
  onCancel: () => void
}) {
  const isEdit = Boolean(initial.id)
  const now = new Date().toISOString().slice(0, 16)

  const [form, setForm] = useState<BreachDraft & { id?: string }>({
    ...EMPTY_DRAFT,
    detected_at: now,
    ...(isEdit ? initial : {}),
    // Asegurar que detected_at no es null cuando editamos
    detected_at: initial.detected_at?.slice(0, 16) ?? now,
  })
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await onSave(isEdit ? { ...form, id: initial.id } : form)
    setSaving(false)
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <h2 className="text-xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest mb-2">
        {isEdit ? 'EDITAR BRECHA' : 'NUEVA BRECHA'}
      </h2>

      <Field
        label="Fecha de detección"
        type="datetime-local"
        required
        value={form.detected_at}
        onChange={e => set('detected_at', (e.target as HTMLInputElement).value)}
        helpText="Inicio del plazo de 72h para notificación AEPD (art. 33 RGPD)"
      />

      <Field
        label="Descripción"
        as="textarea"
        rows={3}
        required
        value={form.description}
        onChange={e => set('description', (e.target as HTMLInputElement).value)}
        helpText="Qué ocurrió, cómo se detectó, qué sistemas se vieron afectados"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label="Fuente de detección"
          placeholder="supabase_logs, user_report, audit_internal…"
          value={form.source ?? ''}
          onChange={e => set('source', (e.target as HTMLInputElement).value || null)}
        />
        <Field
          label="Nº estimado de afectados"
          type="number"
          min={0}
          value={form.affected_users_estimated ?? ''}
          onChange={e =>
            set(
              'affected_users_estimated',
              (e.target as HTMLInputElement).value
                ? Number((e.target as HTMLInputElement).value)
                : null,
            )
          }
        />
      </div>

      <Field
        label="Categorías de datos afectados (separadas por comas)"
        placeholder="email, nombre, dirección_envío, teléfono"
        value={(form.affected_data_categories ?? []).join(', ')}
        onChange={e =>
          set(
            'affected_data_categories',
            (e.target as HTMLInputElement).value
              .split(',')
              .map(s => s.trim())
              .filter(Boolean),
          )
        }
        helpText="p.ej: email, nombre, dirección_envío"
      />

      <label className="flex items-center gap-3 text-sm text-[var(--color-cream-dim)] font-[var(--font-body)]">
        <input
          type="checkbox"
          checked={form.contains_special_categories}
          onChange={e => set('contains_special_categories', e.target.checked)}
          className="w-4 h-4 accent-[var(--color-lavender)]"
        />
        Afecta a categorías especiales (art. 9 RGPD: salud, religión, biometría…)
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-[var(--font-cond)] font-medium text-[var(--color-cream-dim)] tracking-wide">
            Nivel de riesgo <span className="text-[var(--color-brand-red)]">*</span>
          </span>
          <select
            required
            value={form.risk_level}
            onChange={e => set('risk_level', e.target.value as Breach['risk_level'])}
            className="h-9 px-3 rounded-lg bg-[var(--color-ink)] border border-[var(--color-card-hover)] text-sm font-[var(--font-body)] text-[var(--color-cream)] focus:outline-none focus:border-[var(--color-lavender)] transition-colors"
          >
            <option value="low">Bajo — solo registro interno</option>
            <option value="medium">Medio — valorar notificación AEPD</option>
            <option value="high">Alto — notificar AEPD + afectados (art. 33-34)</option>
            <option value="critical">Crítico — notificar AEPD + afectados + revisión art. 32</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-[var(--font-cond)] font-medium text-[var(--color-cream-dim)] tracking-wide">
            Estado
          </span>
          <select
            value={form.resolution_status}
            onChange={e =>
              set('resolution_status', e.target.value as Breach['resolution_status'])
            }
            className="h-9 px-3 rounded-lg bg-[var(--color-ink)] border border-[var(--color-card-hover)] text-sm font-[var(--font-body)] text-[var(--color-cream)] focus:outline-none focus:border-[var(--color-lavender)] transition-colors"
          >
            <option value="open">Abierta</option>
            <option value="contained">Contenida</option>
            <option value="resolved">Resuelta</option>
          </select>
        </div>
      </div>

      <Field
        label="Justificación del nivel de riesgo"
        as="textarea"
        rows={2}
        value={form.risk_justification ?? ''}
        onChange={e => set('risk_justification', (e.target as HTMLInputElement).value || null)}
        helpText="Factores que determinan el nivel: volumen, tipos de datos, reversibilidad…"
      />

      <Field
        label="Medidas de contención adoptadas"
        as="textarea"
        rows={3}
        value={form.containment_measures ?? ''}
        onChange={e => set('containment_measures', (e.target as HTMLInputElement).value || null)}
        helpText="Rotación de contraseñas, revocación de sesiones, parches aplicados…"
      />

      {/* AEPD */}
      <div className="border border-[var(--color-card-hover)] rounded-xl p-4 space-y-3">
        <p className="text-xs font-[var(--font-cond)] text-[var(--color-lavender)] tracking-widest uppercase">
          Notificación AEPD (art. 33)
        </p>

        <label className="flex items-center gap-3 text-sm text-[var(--color-cream-dim)] font-[var(--font-body)]">
          <input
            type="checkbox"
            checked={form.notified_aepd}
            onChange={e => set('notified_aepd', e.target.checked)}
            className="w-4 h-4 accent-[var(--color-lavender)]"
          />
          Notificada a la AEPD
        </label>

        {form.notified_aepd && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="Fecha/hora notificación AEPD"
              type="datetime-local"
              value={form.notified_aepd_at?.slice(0, 16) ?? ''}
              onChange={e =>
                set('notified_aepd_at', (e.target as HTMLInputElement).value || null)
              }
            />
            <Field
              label="Nº expediente AEPD"
              placeholder="p.ej: PS/00123/2026"
              value={form.aepd_case_number ?? ''}
              onChange={e =>
                set('aepd_case_number', (e.target as HTMLInputElement).value || null)
              }
            />
          </div>
        )}
      </div>

      {/* Afectados */}
      <div className="border border-[var(--color-card-hover)] rounded-xl p-4 space-y-3">
        <p className="text-xs font-[var(--font-cond)] text-[var(--color-lavender)] tracking-widest uppercase">
          Notificación a afectados (art. 34 — solo alto riesgo)
        </p>

        <label className="flex items-center gap-3 text-sm text-[var(--color-cream-dim)] font-[var(--font-body)]">
          <input
            type="checkbox"
            checked={form.notified_users}
            onChange={e => set('notified_users', e.target.checked)}
            className="w-4 h-4 accent-[var(--color-lavender)]"
          />
          Afectados notificados
        </label>

        {form.notified_users && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="Fecha/hora notificación a afectados"
              type="datetime-local"
              value={form.notified_users_at?.slice(0, 16) ?? ''}
              onChange={e =>
                set('notified_users_at', (e.target as HTMLInputElement).value || null)
              }
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-[var(--font-cond)] font-medium text-[var(--color-cream-dim)] tracking-wide">
                Método de notificación
              </span>
              <select
                value={form.notification_method ?? ''}
                onChange={e =>
                  set('notification_method', (e.target as HTMLInputElement).value || null)
                }
                className="h-9 px-3 rounded-lg bg-[var(--color-ink)] border border-[var(--color-card-hover)] text-sm font-[var(--font-body)] text-[var(--color-cream)] focus:outline-none focus:border-[var(--color-lavender)] transition-colors"
              >
                <option value="">-- seleccionar --</option>
                <option value="email">Email directo</option>
                <option value="website">Aviso en la web</option>
                <option value="press">Comunicado de prensa</option>
                <option value="none">No aplica</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {form.resolution_status === 'resolved' && (
        <Field
          label="Fecha de resolución"
          type="datetime-local"
          value={form.resolved_at?.slice(0, 16) ?? ''}
          onChange={e => set('resolved_at', (e.target as HTMLInputElement).value || null)}
        />
      )}

      <div className="flex gap-3 pt-2">
        <Button type="submit" variant="primary" loading={saving}>
          {isEdit ? 'Guardar cambios' : 'Registrar brecha'}
        </Button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-[var(--color-mid)] hover:text-[var(--color-cream)] transition-colors font-[var(--font-body)]"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function Brechas() {
  const [items, setItems] = useState<Breach[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<Breach> | null>(null)
  const { toasts, toast, dismiss } = useToast()

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('data_breaches')
      .select('*')
      .order('detected_at', { ascending: false })
    if (error) {
      toast.error('Error al cargar brechas: ' + error.message)
    } else if (data) {
      setItems(data as Breach[])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function save(form: Partial<Breach>) {
    const { id, created_at, updated_at, reported_by, ...payload } = form as Breach & {
      created_at?: string
      updated_at?: string
      reported_by?: string
    }

    if (id) {
      const { error } = await supabase
        .from('data_breaches')
        .update(payload)
        .eq('id', id)
      if (error) {
        toast.error('Error al guardar: ' + error.message)
        return
      }
      toast.success('Brecha actualizada')
    } else {
      const { error } = await supabase.from('data_breaches').insert(payload)
      if (error) {
        toast.error('Error al registrar: ' + error.message)
        return
      }
      toast.success('Brecha registrada')
    }

    setEditing(null)
    load()
  }

  const openBrechas = items.filter(b => b.resolution_status !== 'resolved')
  const hasHighRisk = openBrechas.some(
    b => b.risk_level === 'high' || b.risk_level === 'critical',
  )

  return (
    <>
      <div className="space-y-6 max-w-5xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest">
            BRECHAS DE SEGURIDAD
          </h1>
          <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
            Registro obligatorio RGPD art. 33-34 — audit trail inmutable
          </p>
        </div>

        {/* Banner alerta brechas abiertas de alto riesgo */}
        {hasHighRisk && (
          <div
            role="alert"
            className="rounded-2xl border-2 border-[var(--color-brand-red)] bg-[var(--color-brand-red)]/10 p-4 flex gap-3 items-start"
          >
            <ShieldAlert size={20} className="text-[var(--color-brand-red)] shrink-0 mt-0.5" />
            <div>
              <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] text-sm tracking-wide">
                BRECHA DE ALTO RIESGO ABIERTA
              </p>
              <p className="text-xs text-[var(--color-cream-dim)] mt-0.5">
                Hay una o más brechas de riesgo alto/crítico sin resolver. Revisa si debes
                notificar a la AEPD (plazo: 72h desde detección) y a los afectados (art. 34).
                Consulta las plantillas en{' '}
                <code className="text-[var(--color-lavender)]">
                  Docs/legal/procedimiento-brechas.md
                </code>
                .
              </p>
            </div>
          </div>
        )}

        {/* Procedimiento operativo */}
        <div className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-4">
          <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)] leading-relaxed">
            <span className="text-[var(--color-cream-dim)] font-semibold">Procedimiento operativo:</span>{' '}
            detección (T+0) → triaje/evaluación (≤24h) → contención → decisión AEPD
            (si riesgo ≥ medio, ≤72h) → comunicación afectados (si alto riesgo, art. 34) → cierre.
            Registro obligatorio de TODA brecha aunque no se notifique (art. 33.5 RGPD).
            Plantillas completas en{' '}
            <code className="text-[var(--color-lavender)]">
              Docs/legal/procedimiento-brechas.md
            </code>
            .
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center">
          <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)]">
            {items.length === 0
              ? 'Sin brechas registradas'
              : `${items.length} registro${items.length !== 1 ? 's' : ''} total — ${openBrechas.length} abierto${openBrechas.length !== 1 ? 's' : ''}`}
          </p>
          <Button variant="primary" onClick={() => setEditing({})}>
            Registrar brecha
          </Button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-[var(--color-lavender)] border-t-transparent animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-12 text-center">
            <p className="text-[var(--color-mid)] font-[var(--font-body)]">
              Sin brechas registradas. Si detectas un incidente, regístralo inmediatamente.
            </p>
          </div>
        ) : (
          <div className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl overflow-hidden">
            <table className="w-full text-sm font-[var(--font-body)]">
              <thead>
                <tr className="border-b border-[var(--color-card-hover)]">
                  <th className="text-left px-4 py-3 text-xs font-[var(--font-cond)] text-[var(--color-mid)] tracking-widest uppercase">
                    Detectada
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-[var(--font-cond)] text-[var(--color-mid)] tracking-widest uppercase">
                    Descripción
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-[var(--font-cond)] text-[var(--color-mid)] tracking-widest uppercase">
                    Riesgo
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-[var(--font-cond)] text-[var(--color-mid)] tracking-widest uppercase">
                    Afectados
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-[var(--font-cond)] text-[var(--color-mid)] tracking-widest uppercase">
                    AEPD
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-[var(--font-cond)] text-[var(--color-mid)] tracking-widest uppercase">
                    Estado
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.map(b => (
                  <tr
                    key={b.id}
                    className="border-b border-[var(--color-card-hover)] hover:bg-[var(--color-ink)]/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-[var(--color-cream-dim)] whitespace-nowrap">
                      {b.detected_at?.slice(0, 10)}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-cream-dim)] max-w-xs truncate">
                      {b.description}
                    </td>
                    <td className="px-4 py-3">{riskBadge(b.risk_level)}</td>
                    <td className="px-4 py-3 text-[var(--color-cream-dim)]">
                      {b.affected_users_estimated ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {b.notified_aepd ? (
                        <span className="text-green-400 font-mono text-xs">
                          ✓ {b.notified_aepd_at?.slice(0, 10)}
                        </span>
                      ) : (
                        <span className="text-[var(--color-mid)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-cream-dim)]">
                      {statusLabel(b.resolution_status)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setEditing(b)}
                        className="text-xs text-[var(--color-lavender)] hover:underline font-[var(--font-body)]"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing !== null && (
        <Modal onClose={() => setEditing(null)}>
          <BreachForm
            initial={editing}
            onSave={save}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </>
  )
}

export default Brechas
