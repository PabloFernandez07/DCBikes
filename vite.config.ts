import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Plugin minimal que sustituye `%SITE_URL%` en index.html por la env var.
 * Permite parametrizar canonical/og:url/JSON-LD sin tocar el HTML source.
 * Fallback al dominio actual si VITE_SITE_URL no está definida.
 */
function htmlVars(vars: Record<string, string>) {
  return {
    name: 'html-vars',
    transformIndexHtml(html: string) {
      return Object.entries(vars).reduce(
        (acc, [k, v]) => acc.replace(new RegExp(`%${k}%`, 'g'), v),
        html,
      )
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const SITE_URL = env.VITE_SITE_URL || 'https://dcbikescantabria.com'

  return {
    plugins: [react(), tailwindcss(), htmlVars({ SITE_URL })],
    resolve: {
      alias: { '@': '/src' },
    },
    build: {
      chunkSizeWarningLimit: 600,
      rolldownOptions: {
        output: {
          /*
           * codeSplitting (API nativa de rolldown) en lugar de manualChunks:
           * el matching por substring anterior metía react-hook-form y las deps
           * de recharts (react-smooth, _react@x en rutas pnpm...) en react-vendor,
           * arrastrando charts/forms como dependencias estáticas del entry público.
           *
           * Los tests matchean el paquete real (/node_modules/<pkg>/) y la prioridad
           * importa: cada grupo captura recursivamente las deps de sus módulos, así
           * que react (40) y las deps compartidas con el entry (35: clsx...) deben
           * resolverse ANTES de que charts/forms las arrastren a un chunk lazy.
           */
          codeSplitting: {
            groups: [
              { name: 'react-vendor', priority: 40, test: /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\// },
              // Deps compartidas entre el entry público y los chunks lazy
              { name: 'vendor', priority: 35, test: /node_modules\/(clsx|use-sync-external-store|react-is)\// },
              { name: 'supabase', priority: 30, test: /node_modules\/@supabase\// },
              { name: 'xlsx', priority: 28, test: /node_modules\/xlsx\// },
              { name: 'charts', priority: 26, test: /node_modules\/(recharts|react-smooth|recharts-scale|victory-vendor|d3-[^/]+)\// },
              { name: 'forms', priority: 24, test: /node_modules\/(react-hook-form|@hookform|zod)\// },
              { name: 'icons', priority: 22, test: /node_modules\/lucide-react\// },
              { name: 'vendor', priority: 10, test: /node_modules\// },
            ],
          },
        },
      },
    },
  }
})
