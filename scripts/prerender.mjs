/**
 * Prerender estático por ruta — genera dist/{ruta}/index.html con meta tags correctos.
 *
 * No requiere Puppeteer ni SSR. El bundle JS sigue siendo el mismo.
 * Google recibe HTML con title, description, canonical y schemas reales en el primer crawl.
 * El SPA funciona exactamente igual en el navegador.
 *
 * Uso: node scripts/prerender.mjs  (se llama automáticamente desde "npm run build")
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const dist  = join(__dir, '..', 'dist')

const SITE = process.env.SITE_URL || 'https://dcbikescantabria.com'
const NAME = 'DC Bikes Cantabria'
const IMG  = `${SITE}/og-image.webp`
const IMG_ALT = 'DC Bikes Cantabria — Tienda de bicicletas en El Astillero'
const DESC = 'Tu tienda de bicicletas en El Astillero, Cantabria. Venta, taller y asesoramiento profesional. Distribuidores oficiales Giant, Liv y Stevens.'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const SCHEMA_HOME_GRAPH = `
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BicycleStore",
        "@id": "${SITE}/#bicyclestore",
        "name": "DC Bikes Cantabria",
        "alternateName": "DC Bikes El Astillero",
        "description": "Tienda de bicicletas en El Astillero, Cantabria. Distribuidores oficiales Giant, Liv y Stevens. Venta, taller, asesoramiento.",
        "url": "${SITE}",
        "logo": "${IMG}",
        "image": "${IMG}",
        "telephone": "+34942054501",
        "hasMap": "https://maps.google.com/?q=DC+Bikes+Cantabria+El+Astillero",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "Calle La Cantábrica, Bloque 2N, 1º BAJO",
          "addressLocality": "El Astillero",
          "addressRegion": "Cantabria",
          "postalCode": "39610",
          "addressCountry": "ES"
        },
        "geo": { "@type": "GeoCoordinates", "latitude": 43.3985, "longitude": -3.8182 },
        "areaServed": [
          { "@type": "City", "name": "El Astillero" },
          { "@type": "City", "name": "Santander" },
          { "@type": "City", "name": "Camargo" },
          { "@type": "AdministrativeArea", "name": "Cantabria" }
        ],
        "openingHoursSpecification": [
          { "@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"], "opens": "09:30", "closes": "13:30" },
          { "@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"], "opens": "16:30", "closes": "20:00" }
        ],
        "brand": [
          { "@type": "Brand", "name": "Giant" },
          { "@type": "Brand", "name": "Liv" },
          { "@type": "Brand", "name": "Stevens" }
        ],
        "makesOffer": [
          { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Venta de bicicletas de montaña" } },
          { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Venta de bicicletas de carretera" } },
          { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Venta de bicicletas eléctricas" } },
          { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Taller y reparación de bicicletas" } }
        ],
        "priceRange": "€€",
        "currenciesAccepted": "EUR",
        "paymentAccepted": "Cash, Credit Card",
        "sameAs": [
          "https://www.instagram.com/dcbikescantabria",
          "https://www.facebook.com/dcbikescantabria"
        ]
      },
      {
        "@type": "Organization",
        "@id": "${SITE}/#organization",
        "name": "DC Bikes Cantabria",
        "url": "${SITE}",
        "logo": {
          "@type": "ImageObject",
          "url": "${IMG}",
          "width": 1200,
          "height": 630
        },
        "contactPoint": {
          "@type": "ContactPoint",
          "telephone": "+34942054501",
          "contactType": "customer service",
          "areaServed": "ES",
          "availableLanguage": ["Spanish"]
        },
        "sameAs": [
          "https://www.instagram.com/dcbikescantabria",
          "https://www.facebook.com/dcbikescantabria"
        ]
      },
      {
        "@type": "WebSite",
        "@id": "${SITE}/#website",
        "url": "${SITE}/",
        "name": "DC Bikes Cantabria",
        "inLanguage": "es-ES",
        "publisher": { "@id": "${SITE}/#organization" },
        "potentialAction": {
          "@type": "SearchAction",
          "target": "${SITE}/catalogo?q={search_term_string}",
          "query-input": "required name=search_term_string"
        }
      }
    ]
  }
  </script>`

const SCHEMA_FAQ = `
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "¿Qué marcas de bicicletas vendéis en DC Bikes?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "En DC Bikes somos distribuidores oficiales de Giant, Liv y Stevens. Ofrecemos bicicletas de montaña, carretera, urbana y eléctrica de estas tres marcas premium en El Astillero, Cantabria."
        }
      },
      {
        "@type": "Question",
        "name": "¿Dónde está la tienda DC Bikes Cantabria?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "DC Bikes está ubicada en El Astillero, Cantabria (CP 39610). Contáctanos para obtener la dirección exacta o encuéntranos en Google Maps buscando DC Bikes Cantabria."
        }
      },
      {
        "@type": "Question",
        "name": "¿Cuáles son los horarios de DC Bikes?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Estamos abiertos de lunes a viernes en dos turnos: mañanas de 9:30 a 13:30 y tardes de 16:30 a 20:00."
        }
      },
      {
        "@type": "Question",
        "name": "¿Hacéis reparaciones y mantenimiento de bicicletas?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Sí, contamos con un taller de bicicletas con mecánicos especializados. Realizamos reparaciones, mantenimiento, puestas a punto y revisiones completas de todo tipo de bicicletas."
        }
      },
      {
        "@type": "Question",
        "name": "¿Vendéis bicicletas eléctricas en Cantabria?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Sí, disponemos de una amplia gama de bicicletas eléctricas de las marcas Giant, Liv y Stevens, tanto para uso urbano como para montaña, disponibles en nuestra tienda de El Astillero."
        }
      }
    ]
  }
  </script>`

function schemaBreadcrumb(items) {
  const list = items.map((item, i) => `
      { "@type": "ListItem", "position": ${i + 1}, "name": "${item.name}", "item": "${item.url}" }`).join(',')
  return `
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [${list}
    ]
  }
  </script>`
}

// ─── Rutas ────────────────────────────────────────────────────────────────────

const routes = [
  {
    dir: 'catalogo',
    title: `Catálogo de Bicicletas Giant, Liv y Stevens | ${NAME}`,
    desc: 'Explora nuestro catálogo de bicicletas en El Astillero, Cantabria. Montaña, carretera, urbana y eléctrica. Distribuidores oficiales Giant, Liv y Stevens.',
    canonical: `${SITE}/catalogo`,
    noIndex: false,
    schema: schemaBreadcrumb([
      { name: 'Inicio', url: SITE },
      { name: 'Catálogo', url: `${SITE}/catalogo` },
    ]),
  },
  {
    dir: 'taller',
    title: `Taller & Servicio de Bicicletas en Cantabria | ${NAME}`,
    desc: 'Servicio técnico profesional de bicicletas en El Astillero, Cantabria. Reparación, mantenimiento y puesta a punto por mecánicos especializados.',
    canonical: `${SITE}/taller`,
    noIndex: false,
    schema: schemaBreadcrumb([
      { name: 'Inicio', url: SITE },
      { name: 'Taller', url: `${SITE}/taller` },
    ]),
  },
  {
    dir: 'contacto',
    title: `Contacto y Horarios | ${NAME}`,
    desc: 'Contacta con DC Bikes en El Astillero, Cantabria. Consultas, reservas de taller y presupuestos para bicicletas Giant, Liv y Stevens.',
    canonical: `${SITE}/contacto`,
    noIndex: false,
    schema: schemaBreadcrumb([
      { name: 'Inicio', url: SITE },
      { name: 'Contacto', url: `${SITE}/contacto` },
    ]),
  },
  // ─── Landings SEO — marcas ───
  {
    dir: 'bicicletas-giant',
    title: `Bicicletas Giant en Cantabria — Distribuidor Oficial | ${NAME}`,
    desc: 'Bicicletas Giant en El Astillero, Cantabria: montaña, carretera, gravel, urbana y eléctrica. Distribuidor oficial con taller y asesoramiento de tallaje.',
    canonical: `${SITE}/bicicletas-giant`,
    noIndex: false,
    schema: schemaBreadcrumb([
      { name: 'Inicio', url: SITE },
      { name: 'Bicicletas Giant', url: `${SITE}/bicicletas-giant` },
    ]),
  },
  {
    dir: 'bicicletas-liv',
    title: `Bicicletas Liv en Cantabria — Distribuidor Oficial | ${NAME}`,
    desc: 'Bicicletas Liv en El Astillero, Cantabria: la marca diseñada exclusivamente para mujeres. Distribuidor oficial con taller y asesoramiento personalizado.',
    canonical: `${SITE}/bicicletas-liv`,
    noIndex: false,
    schema: schemaBreadcrumb([
      { name: 'Inicio', url: SITE },
      { name: 'Bicicletas Liv', url: `${SITE}/bicicletas-liv` },
    ]),
  },
  {
    dir: 'bicicletas-stevens',
    title: `Bicicletas Stevens en Cantabria — Distribuidor Oficial | ${NAME}`,
    desc: 'Bicicletas Stevens en El Astillero, Cantabria: ciclocross, gravel, carretera y MTB con ingeniería alemana. Distribuidor oficial con taller propio.',
    canonical: `${SITE}/bicicletas-stevens`,
    noIndex: false,
    schema: schemaBreadcrumb([
      { name: 'Inicio', url: SITE },
      { name: 'Bicicletas Stevens', url: `${SITE}/bicicletas-stevens` },
    ]),
  },
  // ─── Landings SEO — tipos ───
  {
    dir: 'bicicletas-electricas',
    title: `Bicicletas Eléctricas en Cantabria | ${NAME}`,
    desc: 'Bicicletas eléctricas (e-bikes) en El Astillero, Cantabria: urbanas, trekking y eMTB de Giant, Liv y Stevens. Pruébalas en tienda. Taller especializado.',
    canonical: `${SITE}/bicicletas-electricas`,
    noIndex: false,
    schema: schemaBreadcrumb([
      { name: 'Inicio', url: SITE },
      { name: 'Bicicletas eléctricas', url: `${SITE}/bicicletas-electricas` },
    ]),
  },
  {
    dir: 'bicicletas-montana',
    title: `Bicicletas de Montaña (MTB) en Cantabria | ${NAME}`,
    desc: 'Bicicletas de montaña en El Astillero, Cantabria: XC, trail y enduro, rígidas y dobles. Giant, Liv y Stevens. Asesoramiento de tallaje y taller propio.',
    canonical: `${SITE}/bicicletas-montana`,
    noIndex: false,
    schema: schemaBreadcrumb([
      { name: 'Inicio', url: SITE },
      { name: 'Bicicletas de montaña', url: `${SITE}/bicicletas-montana` },
    ]),
  },
  {
    dir: 'bicicletas-carretera',
    title: `Bicicletas de Carretera en Cantabria | ${NAME}`,
    desc: 'Bicicletas de carretera en El Astillero, Cantabria: aluminio y carbono, endurance y competición, también gravel. Giant, Liv y Stevens. Taller y ajuste.',
    canonical: `${SITE}/bicicletas-carretera`,
    noIndex: false,
    schema: schemaBreadcrumb([
      { name: 'Inicio', url: SITE },
      { name: 'Bicicletas de carretera', url: `${SITE}/bicicletas-carretera` },
    ]),
  },
  // ─── Landings SEO — local + FAQ ───
  {
    dir: 'tienda-bicicletas-el-astillero',
    title: `Tienda de Bicicletas en El Astillero | ${NAME}`,
    desc: 'Tu tienda de bicicletas en El Astillero, Cantabria: venta de Giant, Liv y Stevens, taller propio, asesoramiento y recogida en tienda. Ven a vernos.',
    canonical: `${SITE}/tienda-bicicletas-el-astillero`,
    noIndex: false,
    schema: schemaBreadcrumb([
      { name: 'Inicio', url: SITE },
      { name: 'Tienda en El Astillero', url: `${SITE}/tienda-bicicletas-el-astillero` },
    ]),
  },
  {
    dir: 'tienda-bicicletas-santander',
    title: `Tienda de Bicicletas cerca de Santander | ${NAME}`,
    desc: 'Tienda de bicicletas a 10 minutos de Santander, en El Astillero: Giant, Liv y Stevens, taller y trato cercano. Mejor que comprar online. Cómo llegar.',
    canonical: `${SITE}/tienda-bicicletas-santander`,
    noIndex: false,
    schema: schemaBreadcrumb([
      { name: 'Inicio', url: SITE },
      { name: 'Tienda cerca de Santander', url: `${SITE}/tienda-bicicletas-santander` },
    ]),
  },
  {
    dir: 'preguntas-frecuentes',
    title: `Preguntas Frecuentes | ${NAME}`,
    desc: 'Resolvemos tus dudas sobre DC Bikes Cantabria: marcas, ubicación, horarios, taller, bicicletas eléctricas, garantía, devoluciones y cómo pedir presupuesto.',
    canonical: `${SITE}/preguntas-frecuentes`,
    noIndex: false,
    schema: schemaBreadcrumb([
      { name: 'Inicio', url: SITE },
      { name: 'Preguntas frecuentes', url: `${SITE}/preguntas-frecuentes` },
    ]),
  },
  {
    dir: 'cookies',
    title: `Política de Cookies | ${NAME}`,
    desc: 'Política de cookies de DC Bikes Cantabria: tipos de cookies utilizadas, finalidad y cómo gestionarlas o desactivarlas en tu navegador.',
    canonical: `${SITE}/cookies`,
    noIndex: false,
    schema: schemaBreadcrumb([
      { name: 'Inicio', url: SITE },
      { name: 'Cookies', url: `${SITE}/cookies` },
    ]),
  },
  {
    dir: 'privacidad',
    title: `Política de Privacidad | ${NAME}`,
    desc: 'Política de privacidad de DC Bikes Cantabria: qué datos personales tratamos, con qué finalidad, base legal y tus derechos según el RGPD.',
    canonical: `${SITE}/privacidad`,
    noIndex: false,
    schema: schemaBreadcrumb([
      { name: 'Inicio', url: SITE },
      { name: 'Privacidad', url: `${SITE}/privacidad` },
    ]),
  },
  {
    dir: 'aviso-legal',
    title: `Aviso Legal | ${NAME}`,
    desc: 'Aviso legal de DC Bikes Cantabria: titularidad del sitio, condiciones de uso, propiedad intelectual y limitación de responsabilidad conforme a la LSSI-CE.',
    canonical: `${SITE}/aviso-legal`,
    noIndex: false,
    schema: schemaBreadcrumb([
      { name: 'Inicio', url: SITE },
      { name: 'Aviso legal', url: `${SITE}/aviso-legal` },
    ]),
  },
  {
    dir: 'terminos-venta',
    title: `Términos y condiciones de venta | ${NAME}`,
    desc: 'Condiciones generales de compra en DC Bikes Cantabria: proceso de pedido, pago, envío, devoluciones, garantía y resolución de conflictos.',
    canonical: `${SITE}/terminos-venta`,
    noIndex: false,
    schema: schemaBreadcrumb([
      { name: 'Inicio', url: SITE },
      { name: 'Términos de venta', url: `${SITE}/terminos-venta` },
    ]),
  },
  {
    dir: 'devoluciones',
    title: `Política de devoluciones | ${NAME}`,
    desc: 'Información sobre el derecho de desistimiento (14 días), formulario oficial, garantía legal de 3 años y procedimiento de devolución en DC Bikes Cantabria.',
    canonical: `${SITE}/devoluciones`,
    noIndex: false,
    schema: schemaBreadcrumb([
      { name: 'Inicio', url: SITE },
      { name: 'Devoluciones', url: `${SITE}/devoluciones` },
    ]),
  },
]

// ─── Patch ────────────────────────────────────────────────────────────────────

/**
 * Inyecta un bloque completo de SEO justo después del viewport meta.
 * Elimina primero las etiquetas duplicadas que ya existan en el HTML base.
 *
 * Conserva: iconos, manifest, theme-color, color-scheme, author, publisher
 * Reemplaza: title, description, robots, canonical, hreflang, geo/ICBM, og:*, twitter:*, JSON-LD
 */
function patch(html, { title, desc, canonical, noIndex, schema }) {
  const robots = noIndex
    ? 'noindex, nofollow'
    : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1'

  let out = html
    .replace(/<title>[^<]*<\/title>/, '')
    .replace(/<meta name="description"[^>]*>/g, '')
    .replace(/<meta name="keywords"[^>]*>/g, '')
    .replace(/<meta name="robots"[^>]*>/g, '')
    .replace(/<meta name="geo\.[^>]*>/g, '')
    .replace(/<meta name="ICBM"[^>]*>/g, '')
    .replace(/<link rel="canonical"[^>]*>/g, '')
    .replace(/<link rel="alternate" hreflang="[^"]*"[^>]*>/g, '')
    // NOTA: ya no eliminamos preloads de imagen (antes habia un preload de
    // 401KB del DC_Bikes_Giratorio que se reemplazaba). Ahora el preload
    // del index.html (favicon-192 para LCP del splash) debe sobrevivir en
    // TODAS las rutas, porque el splash se muestra en cualquier first paint.
    .replace(/<meta property="og:title"[^>]*>/g, '')
    .replace(/<meta property="og:description"[^>]*>/g, '')
    .replace(/<meta property="og:url"[^>]*>/g, '')
    .replace(/<meta property="og:type"[^>]*>/g, '')
    .replace(/<meta property="og:site_name"[^>]*>/g, '')
    .replace(/<meta property="og:image"[^>]*>/g, '')
    .replace(/<meta property="og:image:type"[^>]*>/g, '')
    .replace(/<meta property="og:image:width"[^>]*>/g, '')
    .replace(/<meta property="og:image:height"[^>]*>/g, '')
    .replace(/<meta property="og:image:alt"[^>]*>/g, '')
    .replace(/<meta property="og:locale"[^>]*>/g, '')
    .replace(/<meta name="twitter:card"[^>]*>/g, '')
    .replace(/<meta name="twitter:site"[^>]*>/g, '')
    .replace(/<meta name="twitter:title"[^>]*>/g, '')
    .replace(/<meta name="twitter:description"[^>]*>/g, '')
    .replace(/<meta name="twitter:image"[^>]*>/g, '')
    .replace(/<meta name="twitter:image:alt"[^>]*>/g, '')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')

  const seoBlock = `
  <title>${title}</title>
  <meta name="description" content="${desc}" />
  <meta name="robots" content="${robots}" />
  <link rel="canonical" href="${canonical}" />
  <link rel="alternate" hreflang="es-ES" href="${canonical}" />
  <link rel="alternate" hreflang="x-default" href="${canonical}" />
  <meta name="geo.region" content="ES-CB" />
  <meta name="geo.placename" content="El Astillero, Cantabria" />
  <meta name="geo.position" content="43.3985;-3.8182" />
  <meta name="ICBM" content="43.3985, -3.8182" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${NAME}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:image" content="${IMG}" />
  <meta property="og:image:type" content="image/webp" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${IMG_ALT}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:locale" content="es_ES" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@dcbikescantabria" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${desc}" />
  <meta name="twitter:image" content="${IMG}" />
  <meta name="twitter:image:alt" content="${IMG_ALT}" />${schema ? '\n' + schema : ''}`

  return out.replace(/(<meta name="viewport"[^>]*>)/, `$1\n${seoBlock}`)
}

// ─── Ejecución ────────────────────────────────────────────────────────────────

const basePath = join(dist, 'index.html')
if (!existsSync(basePath)) {
  console.error('❌  No se encontró dist/index.html. Ejecuta "vite build" primero.')
  process.exit(1)
}

const base = readFileSync(basePath, 'utf-8')

const homeSchema = SCHEMA_HOME_GRAPH + SCHEMA_FAQ

const homePatched = patch(base, {
  title: `DC Bikes | Tienda de Bicicletas en El Astillero, Cantabria`,
  desc: DESC,
  canonical: `${SITE}/`,
  noIndex: false,
  schema: homeSchema,
})
writeFileSync(basePath, homePatched, 'utf-8')

console.log('\n🔧 Prerenderizando rutas estáticas...\n')
console.log('  ✓  /index.html  (home + @graph + FAQPage)')

for (const route of routes) {
  const dir = join(dist, route.dir)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const html = patch(base, route)
  writeFileSync(join(dir, 'index.html'), html, 'utf-8')

  const tag = route.noIndex ? '(noindex)' : ''
  console.log(`  ✓  /${route.dir}/index.html  ${tag}`)
}

console.log(`\n✅  ${routes.length + 1} rutas prerenderizadas en dist/\n`)
