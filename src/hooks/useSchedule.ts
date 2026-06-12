import { useState, useEffect } from 'react'
import type { DaySchedule } from '@/lib/schedule'
import { SCHEDULE, computeIsOpen, computeTodayLabel } from '@/lib/schedule'
import { getSettings, parseSettingValue } from '@/lib/settings-cache'

/**
 * Horario de la tienda desde `settings.store_schedule`, con el horario
 * estático SCHEDULE como fallback mientras carga o si la key no existe.
 *
 * PERF-M1: consume la caché compartida de `settings`
 * (src/lib/settings-cache.ts) en vez de lanzar su propia query.
 */
export function useSchedule() {
  const [schedule, setSchedule] = useState<DaySchedule[]>(SCHEDULE)

  useEffect(() => {
    let cancelled = false

    getSettings()
      .then(byKey => {
        if (cancelled || !byKey.has('store_schedule')) return
        const parsed = parseSettingValue(byKey.get('store_schedule')) as DaySchedule[]
        if (Array.isArray(parsed) && parsed.length === 7) {
          setSchedule(parsed)
        }
      })
      .catch(() => {
        // Error de red/RLS: se mantiene el SCHEDULE por defecto.
      })

    return () => {
      cancelled = true
    }
  }, [])

  return {
    schedule,
    isOpen: computeIsOpen(schedule),
    today: computeTodayLabel(schedule),
  }
}
