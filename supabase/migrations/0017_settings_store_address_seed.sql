-- 0017_settings_store_address_seed.sql
-- Unifica la dirección oficial del titular en una sola fuente de verdad
-- para eliminar las 7 variantes hardcoded detectadas por la auditoría v2 (hallazgo N11).

insert into settings (key, value)
values (
  'store_address',
  '"Calle La Cantábrica, Bloque 2N, 1º BAJO, 39610 El Astillero, Cantabria"'::jsonb
)
on conflict (key) do update
  set value = excluded.value,
      updated_at = now();

comment on column settings.value is 'Valor JSONB para cada key. store_address es la dirección postal oficial del titular (fuente de verdad única).';
