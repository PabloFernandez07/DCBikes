# Docs/historic

Archivos conservados por trazabilidad. **NO ejecutar.**

Contienen templates de migraciones (con placeholders `<PROJECT_REF>`,
`<SERVICE_ROLE_KEY>`, `<CRON_SECRET>`) que ya fueron aplicados al proyecto
Supabase con sus valores reales (sustituidos manualmente en el momento del
deploy). Se movieron aquí desde `supabase/migrations/` para evitar que
herramientas de aplicación masiva (CLI Supabase, Management API) los
ejecuten como migraciones reales — fallarían por los placeholders.

Movido en auditoría legal V5 (Sprint 2 · Q-13).
