-- 0016_data_subject_requests.sql
-- Registro de solicitudes de derechos RGPD (arts. 15-22).
-- Permite demostrar a la AEPD que se procesan las solicitudes en plazo (1 mes, art. 12.3).

create table if not exists data_subject_requests (
  id uuid primary key default gen_random_uuid(),

  -- Tipo de solicitud RGPD
  request_type text not null check (request_type in (
    'access',        -- art. 15
    'rectification', -- art. 16
    'erasure',       -- art. 17 (derecho al olvido)
    'restriction',   -- art. 18
    'portability',   -- art. 20
    'objection'      -- art. 21
  )),

  -- Solicitante
  requester_email text not null,
  requester_full_name text,
  requester_phone text,

  -- Recepción
  request_received_at timestamptz default now(),
  request_channel text default 'email',  -- 'email','form','postal','phone'
  request_text text,                      -- copia de la petición original

  -- Verificación identidad
  identity_verified boolean default false,
  identity_verified_at timestamptz,
  identity_verification_method text,      -- 'order_email_match','docs_attached','other'

  -- Pedidos afectados (referencia, no FK porque pueden estar anonimizados)
  affected_orders_ids uuid[],

  -- Resolución
  outcome text check (outcome in (
    'granted_full',
    'granted_partial',
    'denied_legal_obligation', -- conservación contable obligatoria
    'denied_other',
    'pending'
  )),
  outcome_reason text,
  actions_taken text,             -- descripción libre de qué se hizo (anonimización, etc.)

  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,

  -- Audit
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_data_subject_requests_email
  on data_subject_requests(requester_email);
create index if not exists idx_data_subject_requests_pending
  on data_subject_requests(request_received_at)
  where outcome = 'pending' or outcome is null;

alter table data_subject_requests enable row level security;
-- (la policy con is_admin la añade el agente admin-model en su migración 0013)
-- Hacemos la policy aquí también por idempotencia.
create policy data_subject_requests_admin on data_subject_requests
  for all to authenticated using (is_admin()) with check (is_admin());

create or replace function update_dsr_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists trg_dsr_updated_at on data_subject_requests;
create trigger trg_dsr_updated_at before update on data_subject_requests
  for each row execute procedure update_dsr_updated_at();

comment on table data_subject_requests is 'Registro de solicitudes de derechos RGPD (arts. 15-22). Plazo respuesta: 1 mes (art. 12.3).';
