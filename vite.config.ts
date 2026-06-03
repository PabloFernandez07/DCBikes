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
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) return 'react-vendor'
            if (id.includes('@supabase')) return 'supabase'
            if (id.includes('recharts') || id.includes('d3-')) return 'charts'
            if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('zod')) return 'forms'
            if (id.includes('xlsx')) return 'xlsx'
            if (id.includes('lucide-react')) return 'icons'
            return 'vendor'
          },
        },
      },
    },
  }
})
