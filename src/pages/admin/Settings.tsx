import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'
import { SCHEDULE } from '@/lib/schedule'
import type { DaySchedule } from '@/lib/schedule'

type SettingsMap = Record<string, string>

interface SettingRow {
  key: string
  value: unknown
  updated_at: string
}

const SETTINGS_KEYS = [
  'store_name',
  'store_address',
  'store_phone',
  'store_hours',
  'maps_link',
  'quote_destination_email',
  'reply_from_email',
  'social_instagram',
  'social_facebook',
  'legal_nif',
  'legal_forma_juridica',
  'legal_inscripcion',
] as const

type SettingKey = typeof SETTINGS_KEYS[number]

export function Settings() {
  const { toasts, toast, dismiss } = useToast()
  const [values, setValues] = useState<SettingsMap>({})
  const [original, setOriginal] = useState<SettingsMap>({})
  const [scheduleRows, setScheduleRows] = useState<DaySchedule[]>(SCHEDULE)
  const [originalSchedule, setOriginalSchedule] = useState<DaySchedule[]>(SCHEDULE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('settings')
      .select('*')
      .then(({ data }) => {
        const map: SettingsMap = {}
        const rows = (data as SettingRow[] | null) ?? []
        for (const row of rows) {
          try {
            if (row.key === 'store_schedule') {
              const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
              if (Array.isArray(parsed) && parsed.length === 7) {
                setScheduleRows(parsed as DaySchedule[])
                setOriginalSchedule(parsed as DaySchedule[])
              }
            } else {
              map[row.key] = typeof row.value === 'string' ? JSON.parse(row.value) : String(row.value ?? '')
            }
          } catch {
            map[row.key] = String(row.value ?? '')
          }
        }
        setValues(map)
        setOriginal(map)
        setLoading(false)
      })
  }, [])

  const set = (key: SettingKey, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }))
  }

  const setSlot = (dayIdx: number, slot: 'morning' | 'afternoon', value: string) => {
    setScheduleRows(prev =>
      prev.map((d, i) => i === dayIdx ? { ...d, [slot]: value.trim() || null } : d)
    )
  }

  const handleSave = async () => {
    setSaving(true)
    const changed = SETTINGS_KEYS.filter(k => values[k] !== original[k])

    type UpsertResult = { error: { message: string } | null }
    type SettingsBuilder = {
      upsert: (row: { key: string; value: string }) => Promise<UpsertResult>
    }
    const settingsBuilder = supabase.from('settings') as unknown as SettingsBuilder

    const results = await Promise.all([
      ...changed.map(key => {
        const val: string = JSON.stringify(values[key] ?? '')
        return settingsBuilder.upsert({ key, value: val })
      }),
      JSON.stringify(scheduleRows) !== JSON.stringify(originalSchedule)
        ? settingsBuilder.upsert({ key: 'store_schedule', value: JSON.stringify(scheduleRows) })
        : Promise.resolve({ error: null }),
    ])

    setSaving(false)
    const anyError = results.find(r => r.error)
    if (anyError?.error) {
      toast.error('Error al guardar: ' + anyError.error.message)
    } else {
      setOriginal({ ...values })
      setOriginalSchedule([...scheduleRows])
      toast.success('Configuración guardada')
    }
  }

  const v = (key: SettingKey) => values[key] ?? ''

  return (
    <>
      <div className="space-y-6 max-w-2xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest">
            CONFIGURACIÓN
          </h1>
          <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
            Ajustes generales de la tienda
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-[var(--color-lavender)] border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Section 1: Store Info */}
            <section className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6 space-y-5">
              <h2 className="text-base font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
                Contacto y ubicación
              </h2>

              <Field
                label="Nombre de la tienda"
                value={v('store_name')}
                onChange={e => set('store_name', (e.target as HTMLInputElement).value)}
              />
              <Field
                label="Dirección"
                value={v('store_address')}
                onChange={e => set('store_address', (e.target as HTMLInputElement).value)}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Teléfono"
                  type="tel"
                  value={v('store_phone')}
                  onChange={e => set('store_phone', (e.target as HTMLInputElement).value)}
                />
                <Field
                  label="Horario (texto libre, opcional)"
                  helpText="Si lo rellenas, se muestra en Contacto en lugar de la tabla de horarios."
                  value={v('store_hours')}
                  onChange={e => set('store_hours', (e.target as HTMLInputElement).value)}
                />
              </div>
              <Field
                label="Enlace Google Maps (Cómo llegar)"
                type="url"
                placeholder="https://maps.app.goo.gl/..."
                helpText="URL del pin de Google Maps. Aparece en el botón 'Cómo llegar' y en el panel del mapa."
                value={v('maps_link')}
                onChange={e => set('maps_link', (e.target as HTMLInputElement).value)}
              />
            </section>

            {/* Section: Horarios semanales */}
            <section className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6 space-y-5">
              <div>
                <h2 className="text-base font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
                  Horarios semanales
                </h2>
                <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
                  Controla el indicador ABIERTO/CERRADO y la tabla de horarios en Home y Contacto. Formato: <code className="text-[var(--color-lavender)]">09:30–14:00</code>. Deja vacío para marcar ese tramo como cerrado.
                </p>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-[100px_1fr_1fr] gap-3 mb-1">
                  <span className="text-xs font-[var(--font-cond)] text-[var(--color-mid)] tracking-widest uppercase">Día</span>
                  <span className="text-xs font-[var(--font-cond)] text-[var(--color-mid)] tracking-widest uppercase">Mañana</span>
                  <span className="text-xs font-[var(--font-cond)] text-[var(--color-mid)] tracking-widest uppercase">Tarde</span>
                </div>
                {scheduleRows.map((day, i) => (
                  <div key={day.label} className="grid grid-cols-[100px_1fr_1fr] gap-3 items-center">
                    <span className="text-sm font-[var(--font-cond)] text-[var(--color-cream)] tracking-wide">
                      {day.label}
                    </span>
                    <input
                      type="text"
                      value={day.morning ?? ''}
                      placeholder="Cerrado"
                      onChange={e => setSlot(i, 'morning', e.target.value)}
                      className="h-9 px-3 rounded-lg bg-[var(--color-ink)] border border-[var(--color-card-hover)] text-sm font-[var(--font-body)] text-[var(--color-cream)] placeholder:text-[var(--color-mid)] focus:outline-none focus:border-[var(--color-lavender)] transition-colors"
                    />
                    <input
                      type="text"
                      value={day.afternoon ?? ''}
                      placeholder="Cerrado"
                      onChange={e => setSlot(i, 'afternoon', e.target.value)}
                      className="h-9 px-3 rounded-lg bg-[var(--color-ink)] border border-[var(--color-card-hover)] text-sm font-[var(--font-body)] text-[var(--color-cream)] placeholder:text-[var(--color-mid)] focus:outline-none focus:border-[var(--color-lavender)] transition-colors"
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Section 2: Email */}
            <section className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6 space-y-5">
              <div>
                <h2 className="text-base font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
                  Configuración de email
                </h2>
                <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
                  Controla cómo llegan y se envían los emails de presupuesto
                </p>
              </div>

              <Field
                label="Email donde recibes las solicitudes"
                type="email"
                required
                placeholder="tu@email.com"
                helpText="Aquí llegan los avisos cuando un cliente envía una solicitud de presupuesto."
                value={v('quote_destination_email')}
                onChange={e => set('quote_destination_email', (e.target as HTMLInputElement).value)}
              />

              <Field
                label="Email de respuesta al cliente (Reply-To)"
                type="email"
                placeholder="info@dcbikescantabria.es"
                helpText="Cuando respondas a un cliente desde el panel, este email aparece como remitente de respuesta. El cliente podrá responder directamente aquí."
                value={v('reply_from_email')}
                onChange={e => set('reply_from_email', (e.target as HTMLInputElement).value)}
              />
            </section>

            {/* Section 3: Social */}
            <section className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6 space-y-5">
              <h2 className="text-base font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
                Redes sociales
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Instagram"
                  type="url"
                  placeholder="https://instagram.com/..."
                  value={v('social_instagram')}
                  onChange={e => set('social_instagram', (e.target as HTMLInputElement).value)}
                />
                <Field
                  label="Facebook"
                  type="url"
                  placeholder="https://facebook.com/..."
                  value={v('social_facebook')}
                  onChange={e => set('social_facebook', (e.target as HTMLInputElement).value)}
                />
              </div>
            </section>

            {/* Section 4: Datos legales (aparecen en /aviso-legal) */}
            <section className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6 space-y-5">
              <div>
                <h2 className="text-base font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
                  Datos legales
                </h2>
                <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
                  Estos datos aparecen en la página de Aviso Legal. Mientras estén vacíos se muestra "pendiente".
                  El teléfono y la dirección se cogen automáticamente de la sección "Contacto y ubicación".
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="NIF / CIF"
                  placeholder="Ej: 12345678X o B12345678"
                  helpText="Documento de identidad fiscal. Obligatorio en el aviso legal (LSSI-CE art. 10)."
                  value={v('legal_nif')}
                  onChange={e => set('legal_nif', (e.target as HTMLInputElement).value)}
                />
                <Field
                  label="Forma jurídica"
                  placeholder="Ej: Autónomo / S.L. / S.A."
                  helpText="Tipo de actividad económica. Para autónomos, escribe 'Empresario individual (autónomo)'."
                  value={v('legal_forma_juridica')}
                  onChange={e => set('legal_forma_juridica', (e.target as HTMLInputElement).value)}
                />
              </div>

              <Field
                label="Inscripción registral"
                placeholder="Ej: Registro Mercantil de Cantabria, Tomo X, Folio Y, Hoja S-Z"
                helpText="Solo si eres sociedad mercantil (S.L./S.A.). Si eres autónomo, escribe 'No aplica'."
                value={v('legal_inscripcion')}
                onChange={e => set('legal_inscripcion', (e.target as HTMLInputElement).value)}
              />
            </section>

            {/* Save button */}
            <div className="flex justify-end">
              <Button variant="primary" onClick={handleSave} loading={saving}>
                Guardar configuración
              </Button>
            </div>
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </>
  )
}
