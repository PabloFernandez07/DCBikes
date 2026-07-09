/**
 * Genera public/sitemap.xml con lastmod dinámico = fecha actual (UTC ISO).
 *
 * Se ejecuta en `prebuild` para que el sitemap publicado siempre tenga
 * la fecha del despliegue.
 *
 * Para añadir rutas dinámicas (p.ej. /producto/:slug desde Supabase),
 * extender el array `urls` con una llamada async a la API (Fase 2).
 */

import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const out = join(__dir, '..', 'public', 'sitemap.xml')

const BASE = process.env.SITE_URL || 'https://dcbikescantabria.com'
const today = new Date().toISOString().split('T')[0]

// URLs indexables del sitio. Excluimos las páginas con <meta robots="noindex">
// (privacidad, cookies, aviso-legal) — incluirlas desperdicia crawl budget
// y envía señal contradictoria a buscadores.
//
// Incluimos las informacionales (devoluciones, terminos-venta) porque sí
// queremos que Google las descubra como soporte de confianza.
const urls = [
  { loc: '/',              changefreq: 'weekly',  priority: '1.0' },
  { loc: '/catalogo',      changefreq: 'weekly',  priority: '0.9' },
  { loc: '/taller',        changefreq: 'monthly', priority: '0.7' },
  { loc: '/contacto',      changefreq: 'monthly', priority: '0.7' },
  // Landings SEO — marcas
  { loc: '/bicicletas-giant',   changefreq: 'monthly', priority: '0.8' },
  { loc: '/bicicletas-liv',     changefreq: 'monthly', priority: '0.8' },
  { loc: '/bicicletas-stevens', changefreq: 'monthly', priority: '0.8' },
  // Landings SEO — tipos
  { loc: '/bicicletas-electricas', changefreq: 'monthly', priority: '0.8' },
  { loc: '/bicicletas-montana',    changefreq: 'monthly', priority: '0.8' },
  { loc: '/bicicletas-carretera',  changefreq: 'monthly', priority: '0.8' },
  // Landings SEO — local + FAQ
  { loc: '/tienda-bicicletas-el-astillero', changefreq: 'monthly', priority: '0.8' },
  { loc: '/tienda-bicicletas-santander',    changefreq: 'monthly', priority: '0.8' },
  { loc: '/preguntas-frecuentes',           changefreq: 'monthly', priority: '0.6' },
  { loc: '/devoluciones',  changefreq: 'yearly',  priority: '0.4' },
  { loc: '/terminos-venta', changefreq: 'yearly', priority: '0.4' },
]

// ── Rutas dinámicas: fichas de producto desde Supabase ──────────────────────
// Un URL por MODELO (grupo model_group, representante = primero por nombre, igual
// que la card del catálogo) + productos sueltos. Sin credenciales → solo estáticas
// (degrada sin romper el build).
async function fetchProductUrls() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key) {
    console.warn('sitemap: sin credenciales Supabase → solo URLs estáticas')
    return []
  }
  try {
    const res = await fetch(
      `${url}/rest/v1/products?select=slug,name,model_group&active=eq.true&order=name`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    )
    if (!res.ok) {
      console.warn('sitemap: fetch productos falló', res.status)
      return []
    }
    const rows = await res.json()
    const groups = new Map()
    const singles = []
    for (const p of rows) {
      if (!p.slug) continue
      if (p.model_group && p.model_group.trim()) {
        const g = groups.get(p.model_group) || []
        g.push(p)
        groups.set(p.model_group, g)
      } else {
        singles.push(p)
      }
    }
    const reps = []
    for (const [, g] of groups) {
      g.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'))
      reps.push(g[0])
    }
    return [...reps, ...singles].map(p => ({
      loc: `/producto/${p.slug}`,
      changefreq: 'weekly',
      priority: '0.7',
    }))
  } catch (err) {
    console.warn('sitemap: error trayendo productos →', String(err))
    return []
  }
}

const productUrls = await fetchProductUrls()
urls.push(...productUrls)

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map(u => `  <url>
    <loc>${BASE}${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
    <xhtml:link rel="alternate" hreflang="es-ES" href="${BASE}${u.loc}"/>
  </url>`).join('\n')}
</urlset>
`

writeFileSync(out, xml, 'utf-8')
console.log(`sitemap.xml -> ${urls.length} URLs (${today})`)
