// supabase/functions/customer-orders-list/index.ts
//
// Feature N — Lista de pedidos del cliente "logged in" via magic link.
//
// Acepta:
//   POST { token }
//   GET  ?token=...
//
// Sin auth (la auth viene del token). Devuelve solo datos NO sensibles
// suficientes para listar: order_number, status, fecha, total, items_count.
// Para detalle completo el frontend llama a customer-order-detail.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { CORS_HEADERS, jsonError, jsonOk } from '../_shared/email-utils.ts'
import { verifyCustomerSession } from '../_shared/customer-session.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        ...CORS_HEADERS,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
    })
  }
  const ts = () => new Date().toISOString()

  try {
    let token: string | null = null
    if (req.method === 'GET') {
      token = new URL(req.url).searchParams.get('token')
    } else if (req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as { token?: string }
      token = body.token ?? null
    } else {
      return jsonError('method not allowed', 405)
    }

    if (!token) return jsonError('token requerido', 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const session = await verifyCustomerSession(supabase, token)
    if (!session) {
      return jsonError('Sesión expirada o inválida', 401)
    }

    const { data: orders, error: oErr } = await supabase
      .from('orders')
      .select(
        'id, order_number, status, delivery_method, created_at, total_cents, ' +
          'order_items(id)',
      )
      .eq('customer_email', session.email)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100)

    if (oErr) {
      console.error(`[${ts()}] customer-orders-list query error:`, oErr.message)
      return jsonError('error leyendo pedidos', 500)
    }

    const list = (orders ?? []).map((o) => {
      const items = (o as { order_items?: unknown[] }).order_items
      const itemsCount = Array.isArray(items) ? items.length : 0
      return {
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        delivery_method: o.delivery_method,
        created_at: o.created_at,
        total_cents: o.total_cents,
        items_count: itemsCount,
      }
    })

    console.log(
      `[${ts()}] ✓ orders-list · email=${session.email} · count=${list.length}`,
    )
    return jsonOk({ email: session.email, orders: list })
  } catch (err) {
    console.error(`[${ts()}] ✗ customer-orders-list:`, String(err))
    return jsonError(String(err))
  }
})
