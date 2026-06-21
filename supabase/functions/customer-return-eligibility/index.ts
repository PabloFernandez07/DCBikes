// supabase/functions/customer-return-eligibility/index.ts
//
// Devoluciones — Paso 1: el cliente (logged in via magic link) consulta si un
// pedido es elegible para devolución y qué líneas puede devolver.
//
// Acepta:
//   POST { token, order_id }
//
// Verifica:
//   1. Token válido (no expirado) → email de la sesión.
//   2. El pedido pertenece a ese email (y no está soft-deleted).
//
// Elegibilidad (eligible=false si CUALQUIERA falla):
//   - status === 'delivered'
//   - delivered_at no es null
//   - dentro de plazo: now <= delivered_at + 15 días
//   - al menos un item elegible (categoría is_returnable Y max_qty > 0)
//
// max_qty por línea = comprada - ya_devuelta, donde "ya_devuelta" suma las
// cantidades de RMAs cuyo estado NO sea rechazado/cancelado (esas liberan el
// cupo de nuevo).
//
// image_url se resuelve con el mismo patrón que order-public-get:
// product_images (primera por sort_order) + getPublicUrl del bucket público
// 'product-images'.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { jsonError, jsonOk, corsPreflightResponse, maskEmail } from '../_shared/email-utils.ts'
import { verifyCustomerSession } from '../_shared/customer-session.ts'

// Ventana de devolución: 15 días naturales desde la entrega.
const RETURN_WINDOW_DAYS = 15
const RETURN_WINDOW_MS = RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000

// Estados de RMA que NO consumen cupo (la línea vuelve a estar disponible).
// El resto (requested, approved, received, refunded, completed...) sí cuentan.
const NON_CONSUMING_RETURN_STATUSES = ['rejected', 'cancelled']

interface EligibleItem {
  order_item_id: string
  product_name: string
  product_size_label: string | null
  image_url: string | null
  max_qty: number
  unit_price_cents: number
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    const body = (await req.json().catch(() => ({}))) as {
      token?: string
      order_id?: string
    }
    const token = body.token ?? ''
    const orderId = body.order_id ?? ''

    if (!token) return jsonError('token requerido', 400, req)
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return jsonError('order_id inválido', 400, req)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1) Verifica sesión.
    const session = await verifyCustomerSession(supabase, token)
    if (!session) return jsonError('Sesión expirada o inválida', 401, req)

    // 2) Carga pedido + items + categoría de cada producto (para is_returnable).
    //    products → categories es el join que decide si una línea es devolvible.
    const { data: order, error: oErr } = await supabase
      .from('orders')
      .select(
        'id, order_number, status, customer_email, deleted_at, delivered_at, ' +
          'order_items(id, product_id, product_name, product_size_label, ' +
          'quantity, unit_price_cents, ' +
          'products(category_id, categories(is_returnable)))',
      )
      .eq('id', orderId)
      .maybeSingle()

    if (oErr) {
      console.error(`[${ts()}] customer-return-eligibility read error:`, oErr.message)
      return jsonError('error leyendo el pedido', 500, req)
    }
    if (!order) return jsonError('forbidden', 403, req)

    // 403 sin diferenciar: pedido borrado o de otro cliente.
    if (
      order.deleted_at !== null ||
      String(order.customer_email).toLowerCase() !== session.email
    ) {
      console.warn(
        `[${ts()}] customer-return-eligibility forbidden · session=${maskEmail(session.email)} · order=${order.order_number}`,
      )
      return jsonError('forbidden', 403, req)
    }

    const deliveredAt = order.delivered_at ? new Date(order.delivered_at) : null
    const deadline = deliveredAt
      ? new Date(deliveredAt.getTime() + RETURN_WINDOW_MS).toISOString()
      : null

    // Checks de elegibilidad a nivel pedido. Cortocircuitamos con items=[]
    // para no exponer datos de líneas de un pedido no devolvible.
    if (order.status !== 'delivered') {
      return jsonOk(
        { eligible: false, reason: 'El pedido aún no ha sido entregado', deadline: null, items: [] },
        req,
      )
    }
    if (!deliveredAt) {
      return jsonOk(
        { eligible: false, reason: 'No consta fecha de entrega del pedido', deadline: null, items: [] },
        req,
      )
    }
    if (Date.now() > deliveredAt.getTime() + RETURN_WINDOW_MS) {
      return jsonOk(
        {
          eligible: false,
          reason: `El plazo de devolución (${RETURN_WINDOW_DAYS} días) ha expirado`,
          deadline,
          items: [],
        },
        req,
      )
    }

    const rawItems = (order as { order_items?: Array<Record<string, unknown>> }).order_items ?? []

    // 3) Calcula la cantidad ya devuelta por order_item (RMAs que consumen cupo).
    //    Una sola query batch sobre order_return_items de este pedido, unida a
    //    order_returns para filtrar por estado.
    const orderItemIds = rawItems
      .map((i) => i.id as string | null)
      .filter((id): id is string => !!id)

    const returnedByItem = new Map<string, number>()
    if (orderItemIds.length > 0) {
      const { data: returnedRows, error: rErr } = await supabase
        .from('order_return_items')
        .select('order_item_id, quantity, order_returns!inner(status)')
        .in('order_item_id', orderItemIds)
      if (rErr) {
        console.error(`[${ts()}] customer-return-eligibility returns read error:`, rErr.message)
        return jsonError('error calculando devoluciones', 500, req)
      }
      for (const row of returnedRows ?? []) {
        const r = row as {
          order_item_id: string
          quantity: number
          order_returns?: { status?: string } | { status?: string }[]
        }
        // El join puede llegar como objeto o array según la cardinalidad inferida.
        const rel = Array.isArray(r.order_returns) ? r.order_returns[0] : r.order_returns
        const status = rel?.status ?? ''
        if (NON_CONSUMING_RETURN_STATUSES.includes(status)) continue
        const prev = returnedByItem.get(r.order_item_id) ?? 0
        returnedByItem.set(r.order_item_id, prev + (r.quantity ?? 0))
      }
    }

    // 4) Filtra líneas elegibles: categoría devolvible Y max_qty > 0.
    const eligibleRaw = rawItems.filter((i) => {
      const products = i.products as
        | { categories?: { is_returnable?: boolean } | { is_returnable?: boolean }[] }
        | null
      const cat = Array.isArray(products?.categories) ? products?.categories[0] : products?.categories
      const isReturnable = cat?.is_returnable === true
      if (!isReturnable) return false
      const bought = (i.quantity as number) ?? 0
      const returned = returnedByItem.get(i.id as string) ?? 0
      return bought - returned > 0
    })

    // 5) image_url batch (mismo patrón que order-public-get): primera imagen por
    //    sort_order del producto, getPublicUrl del bucket 'product-images'.
    const productIds = eligibleRaw
      .map((i) => i.product_id as string | null)
      .filter((pid): pid is string => !!pid)

    const imageMap = new Map<string, string>()
    if (productIds.length > 0) {
      const { data: imgs } = await supabase
        .from('product_images')
        .select('product_id, storage_path')
        .in('product_id', productIds)
        .order('sort_order', { ascending: true })
      for (const img of imgs ?? []) {
        const pid = (img as { product_id: string }).product_id
        if (imageMap.has(pid)) continue // primera por sort_order = portada
        const { data: urlData } = supabase.storage
          .from('product-images')
          .getPublicUrl((img as { storage_path: string }).storage_path)
        imageMap.set(pid, urlData.publicUrl)
      }
    }

    const items: EligibleItem[] = eligibleRaw.map((i) => {
      const bought = (i.quantity as number) ?? 0
      const returned = returnedByItem.get(i.id as string) ?? 0
      const pid = i.product_id as string | null
      return {
        order_item_id: i.id as string,
        product_name: (i.product_name as string) ?? '',
        product_size_label: (i.product_size_label as string | null) ?? null,
        image_url: pid ? imageMap.get(pid) ?? null : null,
        max_qty: bought - returned,
        unit_price_cents: (i.unit_price_cents as number) ?? 0,
      }
    })

    // 6) eligible final: tras todos los checks de pedido OK, depende de que
    //    quede al menos una línea devolvible.
    if (items.length === 0) {
      return jsonOk(
        {
          eligible: false,
          reason: 'Ninguno de los productos de este pedido es elegible para devolución',
          deadline,
          items: [],
        },
        req,
      )
    }

    console.log(
      `[${ts()}] ✓ return-eligibility · email=${maskEmail(session.email)} · order=${order.order_number} · items=${items.length}`,
    )
    return jsonOk({ eligible: true, deadline, items }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ customer-return-eligibility:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
