-- 0010_data_breaches.sql
-- Tabla de registro interno de brechas de seguridad RGPD (art. 33.5).
-- OBLIGATORIA: incluso brechas no notificadas a AEPD deben constar aquí.

create table if not exists data_breaches (
  id uuid primary key default gen_random_uuid(),

  -- Detección
  detected_at timestamptz not null,
  description text not null,
  source text,                                          -- ej: 'supabase_logs', 'vercel_logs', 'user_report', 'audit_internal'

  -- Datos afectados
  affected_data_categories text[],                      -- ej: ['email','direccion_envio','telefono']
  affected_users_estimated int default 0,
  contains_special_categories boolean default false,    -- art. 9 RGPD: salud, religión, biometría, etc.

  -- Evaluación riesgo
  risk_level text not null check (risk_level in ('low','medium','high','critical')),
  risk_justification text,

  -- Notificación AEPD (art. 33)
  notified_aepd boolean default false,
  notified_aepd_at timestamptz,
  aepd_case_number text,

  -- Notificación a afectados (art. 34)
  notified_users boolean default false,
  notified_users_at timestamptz,
  notification_method text,                             -- 'email','website','press','none'

  -- Contención y resolución
  containment_measures text,
  resolution_status text default 'open' check (resolution_status in ('open','contained','resolved')),
  resolved_at timestamptz,

  -- Audit
  reported_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_data_breaches_detected_at on data_breaches(detected_at desc);
create index if not exists idx_data_breaches_risk_level on data_breaches(risk_level);
create index if not exists idx_data_breaches_status on data_breaches(resolution_status) where resolution_status != 'resolved';

-- RLS: solo admin autenticado.
alter table data_breaches enable row level security;

create policy data_breaches_admin_select on data_breaches
  for select to authenticated using (true);

create policy data_breaches_admin_insert on data_breaches
  for insert to authenticated with check (true);

create policy data_breaches_admin_update on data_breaches
  for update to authenticated using (true);

-- Trigger updated_at
create or replace function update_data_breaches_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_data_breaches_updated_at on data_breaches;
create trigger trg_data_breaches_updated_at
  before update on data_breaches
  for each row execute procedure update_data_breaches_updated_at();

comment on table data_breaches is 'Registro interno de brechas de seguridad RGPD (art. 33.5). Obligatorio aunque no se notifiquen a AEPD.';
