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

const BASE = process.env.SITE_URL || 'https://dc-bikes-cantabria.vercel.app'
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
  { loc: '/devoluciones',  changefreq: 'yearly',  priority: '0.4' },
  { loc: '/terminos-venta', changefreq: 'yearly', priority: '0.4' },
]

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
