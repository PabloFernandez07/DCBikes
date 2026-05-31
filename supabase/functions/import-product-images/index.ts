// supabase/functions/import-product-images/index.ts
//
// Descarga imágenes desde URLs externas (server-side, sin CORS), las sube al
// bucket `product-images` y crea las filas en `product_images` para un producto.
// Pensado para el modo "Importar desde Excel de URLs" de /admin/imagenes.
//
// Auth: JWT Supabase + tabla admin_users (mismo patrón que admin-notify-stock).
//
// Body: {
//   product_id: string,            // UUID del producto
//   product_name?: string,         // para el alt
//   urls: string[],                // URLs de imagen (máx 10)
//   replace?: boolean              // si true, borra las imágenes existentes antes
// }
// Respuesta: { ok, uploaded, skipped, errors: [{url, error}] }
//
// Variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsPreflightResponse, jsonOk, jsonError } from '../_shared/email-utils.ts'

const BUCKET = 'product-images'
const MAX_URLS = 10
const MAX_BYTES = 10 * 1024 * 1024
const FETCH_TIMEOUT_MS = 20000

function extFromContentType(ct: string | null, url: string): string | null {
  const t = (ct ?? '').toLowerCase()
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg'
  if (t.includes('png')) return 'png'
  if (t.includes('webp')) return 'webp'
  if (t.includes('avif')) return 'avif'
  if (t.includes('gif')) return 'gif'
  // Fallback por extensión de la URL
  const m = url.split('?')[0].toLowerCase().match(/\.(jpe?g|png|webp|avif|gif)$/)
  if (m) return m[1] === 'jpeg' ? 'jpg' : m[1]
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  // ── 1. Auth admin ──────────────────────────────────────────────────────────
  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  try {
    const authHeader = req.headers.get('authorization') ?? ''
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return jsonError('missing bearer token', 401, req)
    }
    const jwt = authHeader.slice(7).trim()
    const { data: userData, error: userErr } = await service.auth.getUser(jwt)
    if (userErr || !userData?.user) return jsonError('unauthorized', 401, req)
    const { data: adminRow } = await service
      .from('admin_users')
      .select('id')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (!adminRow) return jsonError('forbidden', 403, req)
  } catch (err) {
    console.error(`[${ts()}] import-product-images: auth exception:`, String(err))
    return jsonError('auth check failed', 500, req)
  }

  if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

  // ── 2. Body ──────────────────────────────────────────────────────────────────
  const body = (await req.json().catch(() => ({}))) as {
    product_id?: string
    product_name?: string
    urls?: string[]
    replace?: boolean
  }
  const productId = body.product_id ?? ''
  const productName = (body.product_name ?? '').slice(0, 300)
  const urls = Array.isArray(body.urls) ? body.urls.slice(0, MAX_URLS) : []
  const replace = body.replace === true

  if (!/^[0-9a-f-]{36}$/i.test(productId)) return jsonError('product_id inválido', 400, req)
  if (urls.length === 0) return jsonError('sin urls', 400, req)

  // ── 3. ¿Reemplazar o saltar si ya tiene imágenes? ────────────────────────────
  const { data: existing } = await service
    .from('product_images')
    .select('id, storage_path')
    .eq('product_id', productId)

  if (existing && existing.length > 0) {
    if (!replace) {
      return jsonOk({ uploaded: 0, skipped: existing.length, errors: [], note: 'ya tiene imágenes' }, req)
    }
    // replace: borrar storage + filas
    const paths = existing.map((e) => e.storage_path).filter(Boolean) as string[]
    if (paths.length > 0) await service.storage.from(BUCKET).remove(paths)
    await service.from('product_images').delete().eq('product_id', productId)
  }

  // ── 4. Descargar + subir cada URL ─────────────────────────────────────────────
  let uploaded = 0
  const errors: Array<{ url: string; error: string }> = []

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    if (!/^https?:\/\//i.test(url)) { errors.push({ url, error: 'url inválida' }); continue }
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DCBikesImporter/1.0)' },
      })
      clearTimeout(timer)
      if (!res.ok) { errors.push({ url, error: `HTTP ${res.status}` }); continue }
      const ct = res.headers.get('content-type')
      const ext = extFromContentType(ct, url)
      if (!ext) { errors.push({ url, error: `tipo no imagen (${ct ?? '??'})` }); continue }
      const buf = new Uint8Array(await res.arrayBuffer())
      if (buf.byteLength === 0) { errors.push({ url, error: 'vacío' }); continue }
      if (buf.byteLength > MAX_BYTES) { errors.push({ url, error: 'supera 10MB' }); continue }

      const id = crypto.randomUUID()
      const path = `${productId}/${id}.${ext}`
      const up = await service.storage.from(BUCKET).upload(path, buf, {
        contentType: ext === 'jpg' ? 'image/jpeg' : `image/${ext}`,
        upsert: false,
      })
      if (up.error) { errors.push({ url, error: up.error.message }); continue }

      const ins = await service.from('product_images').insert({
        id,
        product_id: productId,
        storage_path: path,
        alt: productName || null,
        sort_order: i,
      })
      if (ins.error) {
        // limpia el objeto subido si la fila falla
        await service.storage.from(BUCKET).remove([path])
        errors.push({ url, error: ins.error.message })
        continue
      }
      uploaded++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push({ url, error: msg })
    }
  }

  console.log(`[${ts()}] import-product-images: product=${productId} uploaded=${uploaded} errors=${errors.length}`)
  return jsonOk({ uploaded, skipped: 0, errors }, req)
})
