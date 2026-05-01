import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'

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
  'quote_destination_email',
  'reply_from_email',
  'social_instagram',
  'social_facebook',
] as const

type SettingKey = typeof SETTINGS_KEYS[number]

export function Settings() {
  const { toasts, toast, dismiss } = useToast()
  const [values, setValues] = useState<SettingsMap>({})
  const [original, setOriginal] = useState<SettingsMap>({})
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
          // value is stored as JSON stringified string, parse it
          try {
            map[row.key] = typeof row.value === 'string' ? JSON.parse(row.value) : String(row.value ?? '')
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

  const handleSave = async () => {
    setSaving(true)
    const changed = SETTINGS_KEYS.filter(k => values[k] !== original[k])

    type UpsertResult = { error: { message: string } | null }
    type SettingsBuilder = {
      upsert: (row: { key: string; value: string }) => Promise<UpsertResult>
    }
    const settingsBuilder = supabase.from('settings') as unknown as SettingsBuilder
    const results = await Promise.all(
      changed.map(key => {
        const val: string = JSON.stringify(values[key] ?? '')
        return settingsBuilder.upsert({ key, value: val })
      }),
    )

    setSaving(false)
    const anyError = results.find(r => r.error)
    if (anyError?.error) {
      toast.error('Error al guardar: ' + anyError.error.message)
    } else {
      setOriginal({ ...values })
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
                  label="Horarios"
                  value={v('store_hours')}
                  onChange={e => set('store_hours', (e.target as HTMLInputElement).value)}
                />
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
