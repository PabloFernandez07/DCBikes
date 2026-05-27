# Resend Webhook Setup (acción operativa — L-07)

## Objetivo

Detectar rebotes (bounce) y quejas (spam) en los emails transaccionales y alertar
al DPO / responsable de la tienda para limpiar la lista y cumplir con las
buenas prácticas de envío (GDPR art. 5.1.f, requisitos de reputación de dominio).

## Pasos

### 1. Crear el webhook en el Dashboard de Resend

1. Accede a [Resend Dashboard → Webhooks](https://resend.com/webhooks).
2. Haz clic en **Add webhook**.
3. **Endpoint URL**: `https://<tu-proyecto>.supabase.co/functions/v1/resend-bounce-handler`
   (la Edge Function debe crearse — ver paso 3).
4. **Events**: selecciona al menos:
   - `email.bounced`
   - `email.complained`
   - `email.delivery_delayed` (opcional, informativo)
5. Guarda y copia el **Signing Secret** que genera Resend.

### 2. Guardar el signing secret en Supabase Vault

```bash
supabase secrets set RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxx
```

O desde el Dashboard de Supabase → Edge Functions → Secrets.

### 3. Crear la Edge Function `resend-bounce-handler`

Crea `supabase/functions/resend-bounce-handler/index.ts` con la siguiente lógica:

```ts
// supabase/functions/resend-bounce-handler/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // 1. Verificar firma HMAC-SHA256 de Resend
  const signature = req.headers.get('svix-signature') ?? req.headers.get('resend-signature') ?? ''
  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET') ?? ''
  // TODO: implementar verificación de firma según docs de Resend
  // https://resend.com/docs/dashboard/webhooks/introduction#verify-webhook-signature

  const payload = await req.json()
  const eventType: string = payload?.type ?? ''
  const email: string = payload?.data?.email ?? ''

  if (!email) return new Response('ok', { status: 200 })

  if (eventType === 'email.bounced' || eventType === 'email.complained') {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Registrar el evento en una tabla de auditoría (crea la tabla si no existe)
    await supabase.from('email_bounce_log').insert({
      email,
      event_type: eventType,
      payload,
      created_at: new Date().toISOString(),
    })

    // Notificar al DPO por email (usa la dirección configurada en settings)
    const { data: settings } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'store_contact_email')
      .single()
    const dpoEmail = (settings?.value as string | null) ?? 'info@dcbikescantabria.es'

    // Envía alerta vía Resend a dpoEmail
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      },
      body: JSON.stringify({
        from: 'noreply@dcbikescantabria.es',
        to: [dpoEmail],
        subject: `[Alerta] Email ${eventType} — ${email}`,
        html: `<p>Se ha registrado un evento <strong>${eventType}</strong> para <strong>${email}</strong>.</p>
               <p>Revisa la tabla <code>email_bounce_log</code> en Supabase y considera eliminar este email de futuros envíos.</p>`,
      }),
    })
  }

  return new Response('ok', { status: 200 })
})
```

### 4. Desplegar la Edge Function

```bash
supabase functions deploy resend-bounce-handler --no-verify-jwt
```

El flag `--no-verify-jwt` es necesario porque Resend no envía JWT de Supabase.
La seguridad la proporciona la verificación de firma HMAC del paso 3.

### 5. Verificar

Usa el botón **Test** del Dashboard de Resend para enviar un evento de prueba
y comprueba que se inserta un registro en `email_bounce_log`.

## Referencias

- [Resend Webhooks](https://resend.com/docs/dashboard/webhooks/introduction)
- [Verificar firma de Resend](https://resend.com/docs/dashboard/webhooks/introduction#verify-webhook-signature)
