# Configuración de envío de emails (Resend) — verificar dominio

## Estado actual (2026-05-28)

- Cuenta Resend en **modo sandbox**: NINGÚN dominio verificado.
- `RESEND_FROM_EMAIL` (secret de Supabase) = `onboarding@resend.dev` (remitente de pruebas).
- **Consecuencia**: Resend SOLO entrega emails a la dirección del titular de la
  cuenta Resend (`pablofr070703@gmail.com`), y suelen caer en SPAM. A cualquier
  otro destinatario (clientes reales), Resend RECHAZA el envío.
- **Esto bloquea la apertura al público**: los clientes no reciben confirmaciones
  de pedido, magic links de "Mis pedidos", avisos, ni facturas por email.

El flujo técnico de envío está verificado y funciona (test directo a
`send-customer-magic-link` → `200` + `email_id`, `last_event: delivered`).
El único punto pendiente es la entregabilidad a terceros, que exige dominio propio.

## Pasos para habilitar emails a clientes reales

### 1. Comprar un dominio
- Ej. `dcbikescantabria.es` (~10-15 €/año). Registradores: Namecheap, IONOS,
  Dynadot, Cloudflare Registrar, etc.
- (Opcional pero recomendado) usar el mismo dominio para la web cuando se migre
  de `dc-bikes-cantabria.vercel.app` al dominio propio.

### 2. Añadir y verificar el dominio en Resend
1. https://resend.com → **Domains** → **Add Domain** → escribir el dominio.
2. Resend muestra varios registros DNS a añadir en el panel del registrador / DNS:
   - **SPF**: un registro TXT (`v=spf1 include:...`).
   - **DKIM**: 1-3 registros TXT/CNAME (`resend._domainkey...`).
   - **(Opcional) MX** para tracking de respuestas.
3. Añadir esos registros en el DNS del dominio (en el registrador o en Cloudflare
   si se delega el DNS ahí).
4. Volver a Resend y pulsar **Verify**. La propagación DNS puede tardar de minutos
   a unas horas. El dominio debe quedar en estado **Verified** (verde).

### 3. Configurar el remitente en Supabase
Cambiar el secret `RESEND_FROM_EMAIL` al buzón del dominio verificado:

```
RESEND_FROM_EMAIL = pedidos@dcbikescantabria.es
```

Vía panel: Supabase → Project Settings → Edge Functions → Secrets → editar
`RESEND_FROM_EMAIL`. (O vía Management API / CLI con el access token.)

No hace falta redesplegar las funciones: los secrets se propagan en caliente
(se recomienda esperar ~1 min o redeplegar las `send-*` para refresco inmediato).

### 4. Verificar
- Hacer un pedido de prueba con un email DISTINTO al del titular.
- Confirmar que llega el email de confirmación (revisar también spam la primera vez).
- Con SPF/DKIM correctos, la entregabilidad a inbox mejora mucho frente al sandbox.

## Notas
- El display name del remitente ("DC Bikes Cantabria") se construye en
  `_shared/email-utils.ts::buildFromAddress()`; solo cambia la parte del email
  vía `RESEND_FROM_EMAIL`.
- Mientras siga el sandbox, para PROBAR el flujo se puede usar el email del
  titular como destinatario (llega, aunque a spam).
- Relacionado: cuando se compre el dominio, también procede actualizar el
  whitelist CORS de las edge functions (`_shared/email-utils.ts` ALLOWED_ORIGINS)
  y `SITE_URL` para apuntar al dominio propio.
