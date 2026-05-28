// supabase/functions/cron-healthcheck/index.ts
//
// Sprint 1.4 (auditoría v2 N13) — Healthcheck de los jobs pg_cron activos.
//
// Devuelve 200 si todos los jobs registrados se han ejecutado dentro de su
// umbral de lag aceptable. Devuelve 500 si alguno supera el umbral
// (probable indicio de que pg_cron está parado, el net.http_post falla,
// o el job ha sido desprogramado).
//
// Auth:
//   - Header `Authorization: Bearer <CRON_SECRET>` (mismo secreto que usan
//     los crons). No usa JWT.
//
// Implementación:
//   - El schema `cron` no está expuesto en PostgREST por defecto, así que
//     se consulta vía RPC `public.cron_job_last_run(p_jobname)` definida
//     en la migración 0019_cron_helpers.sql.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildCorsHeaders, corsPreflightResponse, jsonError } from '../_shared/email-utils.ts'
import { timingSafeEq } from '../_shared/security.ts'

interface JobThreshold {
  jobname: string
  maxLagMinutes: number
}

const THRESHOLDS: JobThreshold[] = [
  // order-auto-cancel-job se programa cada 30 min → 1h sin ejecutarse es alerta.
  { jobname: 'order-auto-cancel-job', maxLagMinutes: 60 },
  // data-retention-cron-job es diario → 25h sin ejecutarse es alerta.
  { jobname: 'data-retention-cron-job', maxLagMinutes: 60 * 25 },
]

function authorize(req: Request): boolean {
  const expected = Deno.env.get('CRON_SECRET') ?? ''
  if (!expected) return false
  const auth = req.headers.get('authorization') ?? ''
  const prefix = 'Bearer '
  if (!auth.startsWith(prefix)) return false
  const token = auth.slice(prefix.length)
  return timingSafeEq(token, expected)
}

async function lastRunFor(
  supabase: SupabaseClient,
  jobname: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('cron_job_last_run', {
    p_jobname: jobname,
  })
  if (error) {
    console.warn(`[cron-healthcheck] RPC error for ${jobname}:`, error.message)
    return null
  }
  // RPC devuelve timestamptz (string ISO) o null si nunca ha corrido.
  return (data as string | null) ?? null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  if (!authorize(req)) {
    return jsonError('unauthorized', 401, req)
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const results: Array<{
      jobname: string
      lastRunAt: string | null
      lagMinutes: number | null
      ok: boolean
    }> = []
    let allOk = true

    for (const t of THRESHOLDS) {
      const lastRunAt = await lastRunFor(supabase, t.jobname)
      const lagMs = lastRunAt
        ? Date.now() - new Date(lastRunAt).getTime()
        : Number.POSITIVE_INFINITY
      const lagMinutes = Number.isFinite(lagMs) ? Math.floor(lagMs / 60000) : null
      const ok = lagMinutes !== null && lagMinutes <= t.maxLagMinutes
      if (!ok) allOk = false
      results.push({ jobname: t.jobname, lastRunAt, lagMinutes, ok })
    }

    console.log(
      `[${ts()}] cron-healthcheck · ok=${allOk} · ${results
        .map((r) => `${r.jobname}:${r.lagMinutes}m`)
        .join(' · ')}`,
    )

    return new Response(JSON.stringify({ ok: allOk, jobs: results }), {
      status: allOk ? 200 : 500,
      headers: {
        ...buildCorsHeaders(req),
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error(`[${ts()}] ✗ cron-healthcheck fatal:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
