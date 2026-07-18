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
import { traerCatalogo } from './lib/catalogo.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const out = join(__dir, '..', 'public', 'sitemap.xml')

/** En Vercel/CI un sitemap sin fichas es un fallo, no un aviso: ver traerCatalogo. */
const EN_CI = process.env.VERCEL === '1' || process.env.CI === 'true' || process.env.CI === '1'

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

// ── Rutas dinámicas: fichas de producto ─────────────────────────────────────
// Un URL por MODELO (representante del grupo de tallas) más los sueltos. Quién
// es el representante lo decide scripts/lib/catalogo.mjs, el MISMO sitio que usa
// el prerender: antes se elegía aquí por nombre y en la ficha por talla, así que
// el sitemap mandaba una URL cuyo canonical apuntaba a otra que no estaba en el
// sitemap. Ver el comentario de cabecera de ese módulo.
const { productos } = await traerCatalogo({ obligatorio: EN_CI })
urls.push(...productos.map(p => ({
  loc: `/producto/${p.slug}`,
  changefreq: 'weekly',
  priority: '0.7',
})))

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
