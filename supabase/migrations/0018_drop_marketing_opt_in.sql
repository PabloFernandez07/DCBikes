-- 0018_drop_marketing_opt_in.sql
-- Elimina la columna marketing_opt_in de orders.
-- Razón: la auditoría v2 detectó que se capturaba consentimiento sin tener
-- newsletter funcional (violación art. 5.1.b RGPD — limitación de finalidad).
-- Cuando se implemente newsletter, se recogerá en una tabla específica con
-- doble opt-in.

alter table orders drop column if exists marketing_opt_in;
