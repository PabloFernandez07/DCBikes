// supabase/functions/customer-order-update-address/index.ts
//
// Feature O — El cliente actualiza la dirección de envío de un pedido en
// estado pending/authorized/accepted con delivery_method='shipping'.
//
// Flujo:
//   1. Verifica session token (magic link).
//   2. Carga pedido. Valida pertenencia (email) + no soft-deleted +
//      delivery_method='shipping' + status IN (pending|authorized|accepted).
//   3. Valida shape de la nueva dirección (manual, sin zod — coherente con
//      order-place que también lo hace manual).
//   4. Calcula diff de auditoría (campo a campo).
//   5. UPDATE orders SET shipping_*=…, client_modified_at=NOW.
//   6. INSERT order_status_history (from=to=status, changed_by=NULL,
//      reason='Dirección actualizada por el cliente: {diff}').
//   7. Dispara email a admin con el diff (send-order-address-changed-admin).
//
// Estados permitidos:
//   - pending      : pedido recién creado, todavía no se ha cobrado pre-auth.
//   - authorized   : pre-auth Redsys OK, esperando aprobación admin.
//   - accepted     : admin lo aceptó pero todavía no se ha enviado.
//
// Estados NO permitidos:
//   - ready_pickup : pedido para recoger en tienda (no aplica).
//   - shipped      : ya está en manos del transportista.
//   - delivered    : ya entregado.
//   - cancelled / rejected : pedido cerrado.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { buildCorsHeaders, jsonError, jsonOk,
  corsPreflightResponse,
} from '../_shared/email-utils.ts'
import { internalSecretHeader } from '../_shared/security.ts'
import { verifyCustomerSession } from '../_shared/customer-session.ts'

/* ─────────────────── Validación ─────────────────── */

interface ShippingInput {
  address: string
  city: string
  postal_code: string
  province: string
  notes?: string | null
}

interface ValidationResult {
  ok: boolean
  error?: string
  value?: Required<ShippingInput>
}

/**
 * Validación manual (consistente con order-place). Comprueba:
 *   - address  : ≥ 3 chars (calle + número).
 *   - city     : ≥ 2 chars.
 *   - postal_code: exactamente 5 dígitos, empezando 0-5 (Península/Baleares).
 *     Excluimos 51-52 (Ceuta/Melilla) y 35/38 (Canarias) por logística IVA.
 *     Para mantenerlo simple aceptamos cualquier CP que empiece por 0-5 — el
 *     filtro fino de zona se hace en checkout, no aquí.
 *   - province : ≥ 2 chars.
 *   - notes    : opcional, ≤ 500 chars.
 */
function validateShipping(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'shipping inválido' }
  }
  const s = input as Partial<ShippingInput>

  const address = typeof s.address === 'string' ? s.address.trim() : ''
  if (address.length < 3) return { ok: false, error: 'Dirección demasiado corta' }
  if (address.length > 200) return { ok: false, error: 'Dirección demasiado larga' }

  const city = typeof s.city === 'string' ? s.city.trim() : ''
  if (city.length < 2) return { ok: false, error: 'Ciudad inválida' }
  if (city.length > 100) return { ok: false, error: 'Ciudad demasiado larga' }

  const postal_code = typeof s.postal_code === 'string' ? s.postal_code.trim() : ''
  if (!/^[0-5]\d{4}$/.test(postal_code)) {
    return {
      ok: false,
      error: 'Código postal inválido (5 dígitos, solo Península y Baleares)',
    }
  }

  const province = typeof s.province === 'string' ? s.province.trim() : ''
  if (province.length < 2) return { ok: false, error: 'Provincia inválida' }
  if (province.length > 100) return { ok: false, error: 'Provincia demasiado larga' }

  const notesRaw = s.notes == null ? '' : String(s.notes)
  const notes = notesRaw.trim().slice(0, 500)

  return { ok: true, value: { address, city, postal_code, province, notes } }
}

/* ─────────────────── Diff de auditoría ─────────────────── */

interface OrderShipping {
  shipping_address: string | null
  shipping_city: string | null
  shipping_postal_code: string | null
  shipping_province: string | null
  shipping_notes: string | null
}

function buildDiff(
  prev: OrderShipping,
  next: Required<ShippingInput>,
): string {
  const parts: string[] = []
  const cmp = (label: string, a: string | null, b: string) => {
    const aClean = (a ?? '').trim()
    const bClean = b.trim()
    if (aClean !== bClean) {
      parts.push(`${label}: "${aClean || '(vacío)'}" → "${bClean || '(vacío)'}"`)
    }
  }
  cmp('Dirección', prev.shipping_address, next.address)
  cmp('Ciudad', prev.shipping_city, next.city)
  cmp('CP', prev.shipping_postal_code, next.postal_code)
  cmp('Provincia', prev.shipping_province, next.province)
  cmp('Notas', prev.shipping_notes, next.notes)
  return parts.length > 0 ? parts.join(' · ') : 'sin cambios'
}

/* ─────────────────── Handler ─────────────────── */

const MODIFIABLE_STATUSES = new Set(['pending', 'authorized', 'accepted'])

serve(async (req) => {
  const cors = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    const body = (await req.json().catch(() => ({}))) as {
      token?: string
      order_id?: string
      shipping?: unknown
    }
    const token = body.token ?? ''
    const orderId = body.order_id ?? ''

    if (!token) return jsonError('token requerido', 400, req)
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return jsonError('order_id inválido', 400, req)
    }

    // 1) Validación de la nueva dirección antes de tocar BD.
    const validation = validateShipping(body.shipping)
    if (!validation.ok || !validation.value) {
      return jsonError(validation.error ?? 'shipping inválido', 400, req)
    }
    const newShipping = validation.value

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 2) Sesión.
    const session = await verifyCustomerSession(supabase, token)
    if (!session) return jsonError('Sesión expirada o inválida', 401, req)

    // 3) Carga pedido con shipping_* + status + deleted_at.
    const { data: order, error: oErr } = await supabase
      .from('orders')
      .select(
        'id, order_number, status, delivery_method, customer_email, deleted_at, ' +
          'shipping_address, shipping_city, shipping_postal_code, shipping_province, ' +
          'shipping_notes',
      )
      .eq('id', orderId)
      .maybeSingle<{
        id: string
        order_number: string
        status: string
        delivery_method: string
        customer_email: string
        deleted_at: string | null
      } & OrderShipping>()

    if (oErr) {
      console.error(`[${ts()}] customer-order-update-address read:`, oErr.message)
      return jsonError('error leyendo el pedido', 500, req)
    }
    if (!order) return jsonError('forbidden', 403, req)

    if (
      order.deleted_at !== null ||
      String(order.customer_email).toLowerCase() !== session.email
    ) {
      console.warn(
        `[${ts()}] update-address forbidden · session=${session.email} · order=${order.order_number}`,
      )
      return jsonError('forbidden', 403, req)
    }

    // 4) Solo aplica a envío a domicilio.
    if (order.delivery_method !== 'shipping') {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            'Este pedido es para recogida en tienda, no tiene dirección de envío',
        }),
        {
          status: 422,
          headers: { 'Content-Type': 'application/json', ...cors },
        },
      )
    }

    // 5) Estados que permiten modificar dirección.
    if (!MODIFIABLE_STATUSES.has(order.status)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `No se puede modificar la dirección en estado ${order.status}`,
        }),
        {
          status: 422,
          headers: { 'Content-Type': 'application/json', ...cors },
        },
      )
    }

    // 6) Diff (para auditoría + email admin).
    const diff = buildDiff(order, newShipping)
    if (diff === 'sin cambios') {
      // No hay nada que cambiar — no escribimos en BD pero respondemos OK
      // (idempotencia: el usuario podría haber pulsado guardar sin tocar nada).
      console.log(`[${ts()}] update-address sin cambios · ${order.order_number}`)
      return jsonOk({ updated: false, diff }, req)
    }

    // 7) UPDATE.
    const now = new Date().toISOString()
    const { error: uErr } = await supabase
      .from('orders')
      .update({
        shipping_address: newShipping.address,
        shipping_city: newShipping.city,
        shipping_postal_code: newShipping.postal_code,
        shipping_province: newShipping.province,
        shipping_notes: newShipping.notes || null,
        client_modified_at: now,
      })
      .eq('id', order.id)

    if (uErr) {
      console.error(`[${ts()}] update-address update:`, uErr.message)
      return jsonError('error actualizando el pedido', 500, req)
    }

    // 8) Historial. changed_by=NULL → identifica acción del cliente.
    await supabase.from('order_status_history').insert({
      order_id: order.id,
      from_status: order.status,
      to_status: order.status,
      changed_by: null,
      reason: `Dirección actualizada por el cliente: ${diff}`,
    })

    // 9) Email admin (fire-and-forget).
    supabase.functions
      .invoke('send-order-address-changed-admin', {
        body: { order_id: order.id, diff },
        headers: internalSecretHeader(),
      })
      .catch((err) =>
        console.warn(
          `[${ts()}] send-order-address-changed-admin invoke:`,
          String(err),
        ),
      )

    console.log(
      `[${ts()}] ✓ customer-order-update-address · ${order.order_number} · diff="${diff}"`,
    )
    return jsonOk({ updated: true, diff }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ customer-order-update-address:`, String(err))
    return jsonError(String(err), 500, req)
  }
})
