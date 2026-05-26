#!/usr/bin/env node
/**
 * Sustituye placeholders en las migraciones de pg_cron e imprime el SQL listo
 * para aplicar vía Management API o Studio SQL editor.
 *
 * Uso:
 *   SUPABASE_PROJECT_REF=zdfzxjnuksuyagdqoouu CRON_SECRET=xxx node scripts/deploy-crons.mjs
 *
 * Migraciones tratadas:
 *   - supabase/migrations/0005_pg_cron_auto_cancel.sql
 *   - supabase/migrations/0012_data_retention_cron.sql
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const REQUIRED = ['SUPABASE_PROJECT_REF', 'CRON_SECRET']
for (const v of REQUIRED) {
  if (!process.env[v]) {
    console.error(`✗ Falta variable de entorno: ${v}`)
    process.exit(1)
  }
}

const projectRef = process.env.SUPABASE_PROJECT_REF
const cronSecret = process.env.CRON_SECRET
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const FILES = [
  '0005_pg_cron_auto_cancel.sql',
  '0012_data_retention_cron.sql',
]

for (const file of FILES) {
  const path = join(__dir, '..', 'supabase', 'migrations', file)
  let sql = readFileSync(path, 'utf8')
  sql = sql.replaceAll('<PROJECT_REF>', projectRef)
  sql = sql.replaceAll('<CRON_SECRET>', cronSecret)
  if (serviceRoleKey) sql = sql.replaceAll('<SERVICE_ROLE_KEY>', serviceRoleKey)

  // Verifica que no quedan placeholders sin reemplazar.
  const stillHasPlaceholder = /<[A-Z_]+>/.test(sql)
  if (stillHasPlaceholder) {
    console.error(`✗ ${file}: quedan placeholders sin reemplazar. Aborto.`)
    process.exit(1)
  }

  console.log(`\n--- ${file} (ready) ---\n`)
  console.log(sql)
}

console.log('\n✓ Migraciones procesadas. Pega el SQL en Supabase Studio SQL Editor o envíalo a la Management API.')
