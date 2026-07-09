import '@fontsource/bebas-neue/latin-400.css'
import '@fontsource/barlow-condensed/latin-300.css'
import '@fontsource/barlow-condensed/latin-400.css'
import '@fontsource/barlow-condensed/latin-500.css'
import '@fontsource/barlow-condensed/latin-600.css'
import '@fontsource/barlow-condensed/latin-700.css'
import '@fontsource/barlow/latin-300.css'
import '@fontsource/barlow/latin-400.css'
import '@fontsource/barlow/latin-400-italic.css'
import '@fontsource/barlow/latin-500.css'
import '@fontsource/barlow/latin-600.css'
import '@fontsource/barlow/latin-700.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import './index.css'
import App from './App'
import { VercelAnalytics } from '@/components/analytics/VercelAnalytics'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <App />
      <VercelAnalytics />
    </HelmetProvider>
  </StrictMode>,
)
