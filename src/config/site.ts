/**
 * Constantes globales del sitio.
 *
 * El dominio se controla con la variable de entorno `VITE_SITE_URL`.
 * Si no se define, se usa el actual `dc-bikes-cantabria.vercel.app`.
 *
 * Cuando llegue Fase 3 (compra de `dcbikescantabria.com`):
 *   1. En Vercel → Project Settings → Environment Variables → añadir
 *      VITE_SITE_URL=https://dcbikescantabria.com  (y SITE_URL para Node scripts)
 *   2. Hacer redeploy. Todo el SEO (canonical, og:url, Schema.org, sitemap)
 *      se actualiza automáticamente sin tocar código.
 *
 * Notas:
 *   - `index.html` no puede leer este módulo directamente (es estático).
 *     Para parametrizarlo, vite.config.ts inyecta `%SITE_URL%` en build.
 *   - `scripts/prerender.mjs` y `scripts/generate-sitemap.mjs` leen
 *     `process.env.SITE_URL` directamente (corren en Node, no Vite).
 */

const FALLBACK = 'https://dc-bikes-cantabria.vercel.app'

export const SITE_URL: string =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SITE_URL) || FALLBACK

export const SITE_NAME = 'DC Bikes Cantabria'
export const SITE_SHORT_NAME = 'DC Bikes'
export const SITE_LOCALE = 'es_ES'
export const SITE_LANG = 'es-ES'
export const SITE_TWITTER = '@dcbikescantabria'
