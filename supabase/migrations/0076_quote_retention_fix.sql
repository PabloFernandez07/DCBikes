-- 0076_quote_retention_fix.sql
-- Arregla la retención RGPD de consultas, que estaba MUERTA en producción, y
-- añade la red de seguridad del recortador de correo.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- FALLO 1 — LA PURGA REVIENTA SIEMPRE (nunca se ha ejecutado)
--
-- `anonymize_old_quote_messages()` (0040 → 0063 → 0073) hace
--     update quote_requests set email = '[purgado]'
-- y la tabla tiene, desde 0048, el CHECK
--     quote_requests_email_format_check:
--       email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
-- «[purgado]» NO es un email → 23514 → la función aborta. Y como el DELETE de
-- quote_messages va en la MISMA transacción, se hace rollback: NO PURGA NADA.
-- Verificado contra producción: '[purgado]' ~ <el regex> = false.
--
-- Lo mismo en el cron real (data-retention-cron), que hace su propio UPDATE con
-- el mismo literal. Allí el error ni siquiera se lanza: se traga en
-- `{ name, count: 0, error }` → falla EN SILENCIO.
--
-- Arreglo: un centinela que SÍ pasa el CHECK. Verificado contra producción:
--   'purgado@anonimizado.invalid' ~ <el regex>  = true
--   'purgado@anonimizado.invalid' = lower(...)  = true  (pasa quote_requests_email_lower)
-- Se prefiere esto a relajar el CHECK: el CHECK es correcto y protege el resto
-- de la tabla. Además es el patrón que YA usa el proyecto en otras tablas
-- (customer_sessions y orders purgan a 'anonimizado@anonimizado.local'). El TLD
-- .invalid está reservado por la RFC 2606 justo para esto.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- FALLO 2 — quote_messages NO SE PURGA NUNCA (fuga de PII, art. 5.1.e)
--
-- `anonymize_old_quote_messages()` es CÓDIGO MUERTO: no la llama nadie.
--   · grep -rn anonymize_old_quote_messages supabase/functions/ → 0 resultados
--   · select jobname from cron.job → el único job de retención es
--     data-retention-cron-job, que hace POST a la edge function; y la edge
--     function no invoca esa RPC (su único .rpc es try_data_retention_lock).
-- El cron purga quote_requests por su cuenta y NO TOCA quote_messages jamás.
--
-- Antes de 0073 daba igual (la tabla no existía). Pero 0073 copió ahí los
-- mensajes, y el trigger de 0075 GARANTIZA que cada consulta nueva deje una
-- copia literal de la PII más rica del sistema (nombre, teléfono, dirección, lo
-- que el cliente cuente) en una tabla que la retención ignora.
--
-- Arreglo: UNA sola purga, aquí, en SQL, transaccional — borra el hilo Y
-- anonimiza la consulta o no hace ninguna de las dos cosas. El cron pasa a
-- llamarla por RPC en vez de tener su propio UPDATE paralelo.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- FALLO 3 — LOS DOS MECANISMOS MIRABAN COLUMNAS DISTINTAS
--
-- El cron marca `purged_at`. La función miraba `anonymized_at`. Dos mecanismos
-- que se ignoran mutuamente: uno cree que ya está hecho y el otro no. Y los
-- guardas RGPD del trigger de 0075 miran `anonymized_at`, una columna que en
-- producción NO SETEA NADIE (0 filas) → el guarda era inerte.
--
-- Arreglo: se marcan y se comprueban LAS DOS. Un plazo único de 13 meses, el que
-- documentó la auditoría (Q-14) y el que ya usaba el cron — no el de «1 year»
-- que llevaba la función muerta.
--
-- Aditiva e idempotente. Hoy no purga nada (0 consultas de >13 meses, 0
-- revocadas): entra en vigor cuando las haya, que es justamente cuando la
-- versión anterior habría fallado en silencio.

-- ─── 1. Red de seguridad del recortador: el cuerpo tal cual llegó ──────────
-- El recortador de historial citado es una heurística sin estándar detrás.
-- Seguirá fallando con algún cliente de correo que no conocemos. Guardando el
-- crudo, un fallo es RECUPERABLE en vez de definitivo y silencioso.
--
-- Solo se rellena cuando el recortador ha tocado algo (si no, sería una copia
-- literal de `body` y estaríamos duplicando PII sin ganar nada — art. 5.1.c,
-- minimización). Por tanto: body_raw IS NULL  ⇔  «body es exactamente lo que
-- llegó, aquí no se ha recortado nada».
--
-- Se purga solo: vive en quote_messages, y la purga de abajo BORRA la fila
-- entera. No hace falta tratarlo aparte.
alter table quote_messages
  add column if not exists body_raw text;

comment on column quote_messages.body_raw is
  'Cuerpo ORIGINAL del correo entrante, antes de recortarle el historial citado. '
  'NULL = el recortador no tocó nada y `body` ya es el original. Red de seguridad: '
  'si la heurística se come texto del cliente con algún cliente de correo raro, '
  'aquí está lo que llegó de verdad. Se borra con el hilo en la purga RGPD.';

-- ─── 2. La purga de verdad ────────────────────────────────────────────────
-- Cambia el tipo de retorno (void → integer) para que el cron pueda informar de
-- cuántas ha purgado, así que hay que soltarla antes: CREATE OR REPLACE no
-- puede cambiar la firma. Es seguro: no la llama nadie (ese era justamente el
-- fallo). El nombre se conserva porque es el que aparece en la auditoría legal.
drop function if exists public.anonymize_old_quote_messages();

create or replace function anonymize_old_quote_messages() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  ids uuid[];
begin
  -- Consultas con más de 13 meses que no se hayan purgado ya (por CUALQUIERA de
  -- los dos caminos históricos: purged_at el del cron, anonymized_at el de la
  -- función). A partir de ahora se escriben las dos, pero las filas viejas
  -- pueden tener solo una.
  select coalesce(array_agg(id), '{}')
    into ids
    from quote_requests
   where purged_at is null
     and anonymized_at is null
     and created_at < now() - interval '13 months';

  if array_length(ids, 1) is null then
    return 0;
  end if;

  -- El hilo entero: es texto libre con PII y no aporta nada estadístico que
  -- conservar. Va PRIMERO y en la misma transacción que el UPDATE: o se borra el
  -- hilo y se anonimiza la consulta, o no pasa ninguna de las dos cosas.
  delete from quote_messages where quote_id = any(ids);

  update quote_requests
     set message            = '[anonimizado por retención RGPD art. 5.1.e]',
         email              = 'purgado@anonimizado.invalid',
         phone              = null,
         consent_ip         = null,
         consent_user_agent = null,
         reply_token        = null,
         purged_at          = now(),
         anonymized_at      = now()
   where id = any(ids);

  return array_length(ids, 1);
end;
$$;

revoke all on function anonymize_old_quote_messages() from public;
grant execute on function anonymize_old_quote_messages() to service_role;

comment on function anonymize_old_quote_messages() is
  '0076: purga TODA la PII de quote_requests con >13 meses (message, email, phone, '
  'consent_ip, consent_user_agent, reply_token) Y BORRA el hilo entero de '
  'quote_messages, en una sola transacción. Marca purged_at Y anonymized_at. '
  'La invoca data-retention-cron por RPC. Devuelve cuántas consultas ha purgado. '
  'Antes de 0076 reventaba con 23514 (email=''[purgado]'' no pasa el CHECK de '
  'formato) y NADIE la llamaba: la retención de consultas no funcionaba.';

-- ─── 3. Purga por REVOCACIÓN del consentimiento (art. 17.1.b) ──────────────
-- Mismo trabajo, otro disparador: 7 días después de que el interesado revoque.
-- Antes lo hacía el cron con un UPDATE propio que (a) reventaba por el mismo
-- CHECK y (b) tampoco tocaba quote_messages.
create or replace function purge_revoked_quote_requests() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  ids uuid[];
begin
  select coalesce(array_agg(id), '{}')
    into ids
    from quote_requests
   where purged_at is null
     and anonymized_at is null
     and revoked_at is not null
     and revoked_at < now() - interval '7 days';

  if array_length(ids, 1) is null then
    return 0;
  end if;

  delete from quote_messages where quote_id = any(ids);

  update quote_requests
     set message            = '[purgado por revocación del consentimiento]',
         email              = 'purgado@anonimizado.invalid',
         phone              = null,
         consent_ip         = null,
         consent_user_agent = null,
         reply_token        = null,
         purged_at          = now(),
         anonymized_at      = now()
   where id = any(ids);

  return array_length(ids, 1);
end;
$$;

revoke all on function purge_revoked_quote_requests() from public;
grant execute on function purge_revoked_quote_requests() to service_role;

comment on function purge_revoked_quote_requests() is
  '0076: purga la PII de las consultas cuyo consentimiento se revocó hace >7 días '
  '(RGPD art. 17.1.b) y borra su hilo en quote_messages. La invoca '
  'data-retention-cron por RPC. Devuelve cuántas ha purgado.';

-- ─── 4. Autocuración: hilos de consultas ya purgadas ──────────────────────
-- Si alguna consulta se purgó por el camino viejo (el UPDATE del cron), su hilo
-- sigue vivo con toda la PII dentro. Hoy son 0 filas, pero dejarlo escrito hace
-- la migración auto-reparadora si se aplica sobre un entorno donde sí las haya.
delete from quote_messages m
 using quote_requests q
 where m.quote_id = q.id
   and (q.purged_at is not null or q.anonymized_at is not null);

-- ─── 5. El trigger de 0075: guardas correctos y created_at a prueba de nulos ──
-- DOS arreglos:
--
-- (a) El guarda RGPD miraba `anonymized_at`, que en producción no lo setea nadie
--     (el cron marca `purged_at`). Era inerte: una consulta purgada que se
--     reinsertara volvería a sembrar su hilo con la PII. Ahora mira las dos.
--
-- (b) `quote_requests.created_at` es NULLABLE (is_nullable=YES, default now()),
--     y `quote_messages.created_at` es NOT NULL. Un INSERT que pase created_at
--     explícitamente NULL —un import, un seed, un script de migración de datos,
--     una segunda edge function— provocaba 23502 DENTRO del trigger y abortaba
--     el INSERT entero: la consulta del cliente NO se guardaba. El remedio peor
--     que la enfermedad. Con coalesce(new.created_at, now()) el trigger deja de
--     poder tumbar el insert que viene a proteger.
--     (quote-submit no lo dispara porque no manda created_at, pero 0075 se
--     justificó precisamente por aguantar «un insert manual o un import futuro».)
create or replace function quote_requests_seed_thread() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.message is not null
     and new.message <> ''
     and new.anonymized_at is null
     and new.purged_at is null then
    insert into quote_messages (quote_id, direction, body, created_at, email_id)
    values (
      new.id,
      'in',
      new.message,
      coalesce(new.created_at, now()),
      'quote:' || new.id
    )
    on conflict (email_id) where email_id is not null do nothing;
  end if;
  return null;  -- AFTER trigger: el valor de retorno se ignora
end;
$$;

comment on function quote_requests_seed_thread() is
  '0075 + 0076: siembra el mensaje del cliente como primer mensaje del hilo '
  '(direction=in) en el mismo INSERT de la consulta. Marca la fila con '
  'email_id=quote:<uuid> para que el índice único de 0074 impida duplicarla. '
  'No siembra nada si la consulta nace ya purgada/anonimizada (art. 5.1.e). '
  'body_raw se deja a NULL: el original viene del formulario web, no de un '
  'cliente de correo, así que no ha pasado por el recortador.';
