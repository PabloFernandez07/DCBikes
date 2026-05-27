# Runbook — Rotación trimestral de secretos

**Última revisión:** 2026-05-27 (auditoría V5).
**Política aplicable:** rotación trimestral programada de secretos de larga vida + rotación inmediata ante triggers extraordinarios.
**Ámbito:** secretos productivos de DC Bikes Cantabria en Supabase y Vercel.

---

## 1. Política de rotación

### 1.1 Calendario fijo

| Trimestre | Fecha de rotación | Responsable |
|---|---|---|
| Q1 | 1 de enero | Titular |
| Q2 | 1 de abril | Titular |
| Q3 | 1 de julio | Titular |
| Q4 | 1 de octubre | Titular |

Si la fecha cae en festivo o fin de semana, se rota el siguiente día laborable. La rotación debe completarse en una ventana única para minimizar la coexistencia de secretos viejo+nuevo en producción.

### 1.2 Secretos sujetos a rotación

| Secreto | Ubicación | Notas |
|---|---|---|
| `SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API | Rotar vía "Reset service_role key". Invalida el secreto anterior al instante. |
| `ORDER_CRON_SECRET` | Supabase Vault + env var `ORDER_CRON_SECRET` en edge functions | Usado por cron de auto-cancel de pedidos. |
| `DATA_RETENTION_CRON_SECRET` | Supabase Vault + env var `DATA_RETENTION_CRON_SECRET` en edge functions | Usado por cron de retención RGPD art. 5.1.e. |
| `INTERNAL_INVOKE_SECRET` | Supabase Vault + env var `INTERNAL_INVOKE_SECRET` en edge functions | Header `x-internal-secret` entre edge functions (B-02 V5). |
| `TURNSTILE_SECRET` | Supabase Vault + env var `TURNSTILE_SECRET` en edge functions de formularios | Cloudflare Turnstile (anti-bots formularios). |

### 1.3 Triggers extraordinarios (rotación inmediata, fuera de calendario)

Rotar inmediatamente (no esperar al próximo trimestre) cuando ocurra cualquiera de los siguientes:

- **Compromiso sospechoso**: indicios de uso no autorizado en logs, alertas de Supabase/Vercel, anomalías en facturación de proveedores, denuncia de un tercero.
- **Fuga accidental**: el secreto aparece en un commit (incluso revertido), en una captura de pantalla compartida, en un email externo, en un screenshot pegado a un canal público, en un ticket de soporte de terceros.
- **Despido o baja de un colaborador con acceso**: cualquier persona que tuviera acceso operativo a Supabase Dashboard, Vercel, o al gestor de contraseñas.
- **Incidente de seguridad documentado** en `data_breaches` con afectación a credenciales o infraestructura.
- **Cambio del gestor de contraseñas** (migración entre 1Password, Bitwarden, etc.) que pueda haber dejado copias colgadas.

> Tras una rotación extraordinaria, el siguiente ciclo trimestral programado se mantiene en su fecha habitual (no se reinicia el calendario).

---

## 2. Procedimiento paso a paso (sin archivos en disco)

> **AVISO CRÍTICO:** nunca guardar secretos en archivos de texto plano en disco (ni `.txt`, ni `.env` local que no esté en `.gitignore` verificado, ni capturas de pantalla en escritorio). Usar gestor de contraseñas (Bitwarden, 1Password) si se necesita memorizar el valor temporalmente entre los pasos. Tras completar la rotación, eliminar el valor del gestor si no se requiere persistencia (Supabase Vault es la fuente única de verdad operativa).

### 2.1 Generar el nuevo valor

Opción A — Linux/macOS o WSL:
```bash
openssl rand -hex 32
```

Opción B — Windows (PowerShell, sin OpenSSL):
```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

Opción C — PowerShell puro sin Python:
```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
([System.BitConverter]::ToString($bytes) -replace '-','').ToLower()
```

> **NO usar `[System.Web.Security.Membership]::GeneratePassword()` ni `Get-Random`** — la primera genera contraseñas con sesgos para ser memorizables; la segunda no es criptográficamente segura. Usar siempre `RandomNumberGenerator` (CSPRNG) o `secrets` de Python.

Copiar el valor al portapapeles. **No pegarlo en chats, terminales compartidas, capturas, ni archivos de texto.**

### 2.2 Caso especial: `SERVICE_ROLE_KEY`

1. Acceder a **Supabase Dashboard** → seleccionar proyecto `dc-bikes-web` → **Project Settings → API**.
2. Localizar la fila `service_role` y pulsar **"Reset service_role key"**.
3. Confirmar la rotación en el diálogo. El nuevo valor aparece **una sola vez**; copiarlo inmediatamente al portapapeles.
4. El valor anterior queda invalidado al instante. Cualquier integración que lo usara debe actualizarse en el siguiente paso.
5. Saltar a la sección 2.4 (propagación).

### 2.3 Caso general: secretos custom (`ORDER_CRON_SECRET`, `DATA_RETENTION_CRON_SECRET`, `INTERNAL_INVOKE_SECRET`, `TURNSTILE_SECRET`)

1. Acceder a **Supabase Vault** (Dashboard → Project Settings → Vault) o **Supabase Edge Functions secrets** (Dashboard → Edge Functions → Manage secrets).
2. Localizar el secreto a rotar.
3. Pulsar **"Edit"** y pegar el nuevo valor (generado en 2.1).
4. Guardar. El cambio aplica de inmediato a la siguiente invocación de cada edge function que lo consume.
5. Si el secreto se replica en otra plataforma (por ejemplo, `TURNSTILE_SECRET` puede tener pareja `VITE_TURNSTILE_SITE_KEY` en Vercel), verificar la pareja y actualizar las dos partes si es coherente con su rotación.

### 2.4 Propagación a edge functions y verificación

1. Si el secreto se usa en edge functions vía `Deno.env.get('NOMBRE_SECRETO')`, normalmente no requiere redeploy: Supabase resuelve la env var en cada invocación. **Verificar igualmente** invocando el endpoint:
   - `curl -i https://<project>.supabase.co/functions/v1/cron-healthcheck -H "x-cron-secret: <nuevo_valor>"` para crons.
   - `curl -i https://<project>.supabase.co/functions/v1/quote-submit -H "Content-Type: application/json" -d '{"name":"test","email":"test@example.com","phone":"600000000","message":"healthcheck","privacy":true,"turnstileToken":"<token_test>"}'` para Turnstile (en entorno de prueba, no producción).
2. Si la edge function cachea el secreto en módulo top-level (mala práctica), forzar un nuevo despliegue: en Supabase Dashboard → Edge Functions → seleccionar función → **Redeploy**.
3. Confirmar en **Edge Function Logs** que no aparece ningún `401`/`403` por uso del valor anterior tras la propagación.

### 2.5 Caso especial: rotación coordinada con clientes externos

- **`TURNSTILE_SECRET`**: la clave secreta del backend se rota en Supabase; la clave pública (`VITE_TURNSTILE_SITE_KEY`) en Vercel se mantiene salvo que Cloudflare emita una pareja nueva. Si se cambia la pareja, actualizar las dos sin desfase.
- **`INTERNAL_INVOKE_SECRET`**: se usa entre edge functions del mismo proyecto Supabase. Como el valor reside en una sola fuente (Vault), la rotación es atómica.

### 2.6 Registro de la rotación (sin valor)

Tras completar la rotación, anotar el evento en `Docs/runbooks/historial-rotaciones.md` con:

```markdown
## 2026-04-01 — rotación Q2

- Secretos rotados: SERVICE_ROLE_KEY, ORDER_CRON_SECRET, DATA_RETENTION_CRON_SECRET, INTERNAL_INVOKE_SECRET, TURNSTILE_SECRET
- Motivo: calendario trimestral.
- Persona responsable: [Titular]
- Verificación post-rotación: healthcheck cron + quote-submit con Turnstile OK.
- Incidencias: ninguna.
```

**Nunca anotar el valor del secreto en el historial**, solo la fecha, qué se rotó, por quién y resultado de la verificación.

---

## 3. Healthchecks post-rotación

Tras cada rotación, ejecutar al menos los siguientes:

1. **Cron healthcheck**:
   ```
   curl -fsSI https://<project>.supabase.co/functions/v1/cron-healthcheck \
     -H "x-cron-secret: <nuevo_ORDER_CRON_SECRET>"
   # Esperado: HTTP 200 con cuerpo {"status":"ok"}
   ```
2. **Cron retención** (en horario laboral, modo dry-run si está disponible).
3. **Magic link**: solicitar un magic link de prueba a `/mis-pedidos` (entorno staging o cuenta interna).
4. **Quote submit**: enviar un presupuesto de prueba para verificar `TURNSTILE_SECRET`.
5. **Servicios admin**: navegar a `/admin/configuracion` con un admin real y verificar que la sesión no ha sido invalidada por la rotación del `SERVICE_ROLE_KEY` (Supabase Auth no usa esa clave para sesiones JWT; debería ser transparente).

Si alguno falla, revertir solo en último extremo (la `SERVICE_ROLE_KEY` no se puede revertir; se debe rotar de nuevo a un valor distinto y propagar). Documentar la incidencia en `historial-rotaciones.md` y abrir entrada en `data_breaches` si hubo exposición a usuarios.

---

## 4. Buenas prácticas y errores frecuentes

- **No compartir secretos por canales no cifrados** (email sin S/MIME, chat sin E2EE, Trello, Notion público).
- **No commit-ear secretos** ni siquiera temporalmente "para que el compañero los vea". Usar Supabase Vault como fuente de verdad.
- **Borrar capturas y portapapeles** tras la rotación.
- **Verificar `.gitignore`**: si se usa `.env` local en desarrollo, debe estar listado y nunca trackeado. Comprobar con `git status` antes de cualquier commit posterior a la rotación.
- **No tocar el archivo `Docs/runbooks/.secretos-generados-RECUPERAR*`**: ese archivo no debe existir nunca. Si vuelves a verlo, bórralo con `Remove-Item -Force` desde PowerShell y documenta cómo apareció.
- **Coordinar con otros desarrolladores**: avisar antes de rotar para que actualicen su `.env` local si trabajan con secretos compartidos de desarrollo (los de producción no deben estar en local).

---

## 5. Referencias

- `Docs/runbooks/cron-vault-setup.md` — alta inicial de secretos en Vault.
- `Docs/runbooks/admin-settings-checklist.md` — checklist de configuración inicial.
- `Docs/legal/procedimiento-brechas.md` — qué hacer si un secreto se filtra (notificación AEPD si afecta a datos personales).
- Supabase Docs — [Managing Edge Function secrets](https://supabase.com/docs/guides/functions/secrets).
- OWASP — [Key Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html).
