-- 0075_quote_first_message_trigger.sql
-- El mensaje original de la consulta pasa a sembrarse SOLO, en la propia BD.
--
-- EL FALLO: 0073 creó el hilo y rellenó (backfill) el primer mensaje de las
-- consultas que ya existían, pero nadie lo insertaba para las NUEVAS:
-- quote-submit escribe en quote_requests y nunca en quote_messages. Resultado:
-- toda consulta posterior a 0073 nace con el hilo vacío y el panel enseña
-- «Sin mensajes» — el comercio recibe la consulta y NO puede leerla.
--
-- POR QUÉ UN TRIGGER Y NO UN INSERT EN quote-submit:
--   · Atomicidad. El trigger va dentro de la misma transacción que el INSERT:
--     o existen la consulta y su primer mensaje, o no existe ninguno de los
--     dos. Un segundo insert en la edge function puede fallar DESPUÉS de que
--     el cliente ya tenga su 200 y de que salga el aviso por correo, y deja el
--     hilo vacío en silencio: el mismo fallo de hoy con una ventana más
--     estrecha.
--   · No vuelve a divergir. La invariante «el mensaje del cliente es el primer
--     mensaje del hilo» es del modelo de datos, no de quien llame. Hoy solo
--     inserta quote-submit (0014 revocó el insert público), pero esa misma
--     suposición —«ya lo hace el único que escribe»— es la que rompió 0073.
--     El trigger la sostiene también para un insert manual, un import futuro o
--     una segunda edge function.
--   · Lo que se pierde: deja de verse desde el TypeScript. Se compensa con un
--     comentario en quote-submit que apunta aquí.
--
-- IDEMPOTENCIA (estructural, no textual):
-- Se reutiliza el índice único parcial de 0074 sobre email_id. El mensaje
-- original se marca con email_id = 'quote:<uuid>', un tercer espacio de ids
-- junto a los de Resend (salientes) y los de Gmail (entrantes), que no colisiona
-- con ninguno: ni Resend ni Gmail emiten ids con el prefijo 'quote:'. Así el
-- índice único GARANTIZA que el mensaje original no puede duplicarse jamás,
-- ejecute el backfill las veces que se ejecute. No depende de comparar el texto
-- del cuerpo, que sería frágil.

-- ─── 1. Marcar los originales que ya sembró el backfill de 0073 ────────────
-- Sin esto, el paso 3 no los reconocería como «ya existe el original» y crearía
-- un duplicado de cada uno. Son las filas 'in' sin email_id cuyo cuerpo es el
-- mensaje de la consulta.
-- Idempotente: en la segunda pasada ya no quedan email_id nulos que casen.
--
-- OJO CON EL `limit 1` (arreglo posterior, encontrado en verificación): si un
-- hilo tuviera DOS filas 'in' sin email_id con el MISMO cuerpo —el original de
-- 0073 más una entrante sin message_id de texto idéntico, p. ej. un cliente que
-- reenvía su propia consulta—, el UPDATE intentaría poner el mismo
-- 'quote:<uuid>' en las dos, violaría el índice único de 0074 (23505) y la
-- MIGRACIÓN ENTERA fallaría. No es que quedara un duplicado feo: es que no se
-- aplica. Marcando solo la primera (la más antigua, que es el original), la
-- segunda se queda con email_id NULL y no rompe nada.
-- (En producción hoy no pasa —sin_email_id = 0—, pero un `supabase db reset` o
-- un clonado a staging sí lo dispararían.)
update quote_messages m
   set email_id = 'quote:' || m.quote_id
  from quote_requests q
 where m.quote_id   = q.id
   and m.direction  = 'in'
   and m.email_id is null
   and m.body       = q.message
   and m.id = (
     select m2.id
       from quote_messages m2
      where m2.quote_id  = q.id
        and m2.direction = 'in'
        and m2.email_id is null
        and m2.body      = q.message
      order by m2.created_at, m2.id
      limit 1
   );

-- ─── 2. El trigger: el hilo se siembra solo ────────────────────────────────
create or replace function quote_requests_seed_thread() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sin texto no hay nada que sembrar. Y si naciera ya anonimizada (retención),
  -- no se le crea hilo: el art. 5.1.e manda borrarlo, no recrearlo.
  if new.message is not null and new.message <> '' and new.anonymized_at is null then
    insert into quote_messages (quote_id, direction, body, created_at, email_id)
    values (new.id, 'in', new.message, new.created_at, 'quote:' || new.id)
    on conflict (email_id) where email_id is not null do nothing;
  end if;
  return null;  -- AFTER trigger: el valor de retorno se ignora
end;
$$;

comment on function quote_requests_seed_thread() is
  '0075: siembra el mensaje del cliente como primer mensaje del hilo '
  '(direction=in) en el mismo INSERT de la consulta. Marca la fila con '
  'email_id=quote:<uuid> para que el índice único de 0074 impida duplicarla.';

drop trigger if exists quote_requests_seed_thread_trg on quote_requests;
create trigger quote_requests_seed_thread_trg
  after insert on quote_requests
  for each row
  execute function quote_requests_seed_thread();

-- ─── 3. Backfill: consultas nacidas entre 0073 y este arreglo ──────────────
-- Son las que se quedaron sin su primer mensaje. Ojo: NO se detectan con «no
-- tiene ningún mensaje» (el predicado que usó 0073), porque en cuanto el
-- comercio contesta o el cliente responde por correo, el hilo ya tiene filas
-- —pero le sigue faltando el original—. Se detectan por la ausencia de su
-- marca 'quote:<uuid>'.
-- created_at = el de la consulta, para que ordene ANTES de las respuestas que
-- ya estén en el hilo. Se excluyen las anonimizadas (RGPD art. 5.1.e).
insert into quote_messages (quote_id, direction, body, created_at, email_id)
select q.id, 'in', q.message, q.created_at, 'quote:' || q.id
  from quote_requests q
 where q.message is not null
   and q.message <> ''
   and q.anonymized_at is null
   and not exists (
     select 1 from quote_messages m
      where m.quote_id = q.id
        and m.email_id = 'quote:' || q.id
   )
on conflict (email_id) where email_id is not null do nothing;

comment on column quote_messages.email_id is
  'Id del correo en su origen: Resend en los salientes, Gmail en los entrantes, '
  'y quote:<uuid> en el mensaje original de la consulta (0075). Tres espacios de '
  'ids que no colisionan. El índice único parcial de 0074 los mantiene únicos.';
