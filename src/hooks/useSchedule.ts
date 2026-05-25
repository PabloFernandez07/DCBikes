import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { DaySchedule } from '@/lib/schedule'
import { SCHEDULE, computeIsOpen, computeTodayLabel } from '@/lib/schedule'

export function useSchedule() {
  const [schedule, setSchedule] = useState<DaySchedule[]>(SCHEDULE)

  useEffect(() => {
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'store_schedule')
      .maybeSingle()
      .then(({ data }) => {
        if (!data?.value) return
        try {
          const raw = typeof data.value === 'string' ? data.value : JSON.stringify(data.value)
          const parsed = JSON.parse(raw) as DaySchedule[]
          if (Array.isArray(parsed) && parsed.length === 7) {
            setSchedule(parsed)
          }
        } catch {
          // keep default SCHEDULE
        }
      })
  }, [])

  return {
    schedule,
    isOpen: computeIsOpen(schedule),
    today: computeTodayLabel(schedule),
  }
}
