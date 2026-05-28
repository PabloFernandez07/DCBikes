# Runbook — Recuperación de acceso administrativo

**Última revisión:** 2026-05-27 (auditoría V5).
**Ámbito:** recuperación cuando la tabla `admin_users` queda vacía o se pierde el acceso al panel `/admin`.
**Requisito:** acceso a la `service_role` key de Supabase (que bypassa RLS) o al SQL editor del proyecto con privilegios de propietario.

---

## 1. Cuándo aplica

Este procedimiento se ejecuta cuando:

- La tabla `admin_users` se ha vaciado (borrado accidental, restauración parcial, error de migración).
- Ningún usuario puede pasar `is_admin()` y, por tanto, nadie puede leer/escribir las tablas protegidas por RLS desde el panel.
- Se necesita reaprovisionar un administrador tras una restauración desde backup.

> Recordatorio: `is_admin()` (migración 0013) devuelve `true` solo si el `user_id` está en `admin_users`. Si la tabla está vacía, todas las policies basadas en `is_admin()` deniegan el acceso, aunque el usuario esté autenticado.

## 2. Precondiciones de seguridad

- La `service_role` key **nunca** debe usarse desde el cliente ni commitearse. Úsala solo desde el SQL editor del proyecto o un entorno servidor controlado, y por el tiempo mínimo imprescindible.
- Documenta quién ejecuta la recuperación y cuándo (rendición de cuentas, art. 5.2 RGPD).

## 3. Obtener el UUID del usuario en `auth.users`

El administrador a restaurar debe existir previamente en `auth.users` (haberse registrado o haber sido invitado). Para el titular el email de referencia es **pablofr070703@gmail.com**.

Ejecuta en el SQL editor (con privilegios de propietario / service_role):

```sql
select id, email, created_at
from auth.users
where email = 'pablofr070703@gmail.com';
```

Anota el `id` (UUID) devuelto. Si no aparece, primero hay que crear/invitar al usuario desde Supabase Auth y repetir la consulta.

## 4. Reinsertar el administrador

Con el UUID obtenido, reinserta la fila en `admin_users` (idempotente):

```sql
insert into admin_users (user_id, role, notes)
values ('<UUID-de-auth.users>', 'admin', 'recovery — titular')
on conflict (user_id) do nothing;
```

> El `INSERT` directo desde el SQL editor / service_role no está sujeto a la policy `admin_users_modify_admin` (service_role bypassa RLS). Esto es lo que permite romper el círculo: no se puede ser admin para insertarse como admin, así que la recuperación pasa necesariamente por `service_role`.

## 5. Validar la recuperación

```sql
-- 1. La fila existe:
select user_id, role, granted_at from admin_users;

-- 2. is_admin() devuelve true para el UUID restaurado:
select public.is_admin('<UUID-de-auth.users>');
```

El segundo `select` debe devolver `true`. A continuación, inicia sesión en `/admin` con ese usuario y confirma que el panel carga datos protegidos por RLS (p. ej. el listado de pedidos).

## 6. Cierre

- Revoca/retira cualquier uso temporal de la `service_role` key.
- Registra la incidencia y, si la causa fue un borrado accidental o una brecha, abre el procedimiento correspondiente (`Docs/legal/procedimiento-brechas.md`).
- Si la recuperación derivó de una restauración global, sigue también `Docs/legal/plan-continuidad.md`.

## 7. Prevención

- Mantener al menos **dos** administradores activos en `admin_users` para evitar el bloqueo total.
- Ensayar este runbook al menos una vez al año (verificación art. 32.1.d RGPD).
- El mapeo real de administradores se custodia en `Docs/runbooks/admin-users-seed.md.template`.
