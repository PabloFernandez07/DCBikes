import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useTheme } from '@/hooks/useTheme'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { CookieBanner } from '@/components/layout/CookieBanner'
import Home from '@/pages/public/Home'
import Catalog from '@/pages/public/Catalog'
import ProductDetail from '@/pages/public/ProductDetail'
import Workshop from '@/pages/public/Workshop'
import Contact from '@/pages/public/Contact'
import CookiePolicy from '@/pages/public/CookiePolicy'
import { AdminRoutes } from '@/routes/AdminRoutes'

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main>{children}</main>
      <Footer />
    </>
  )
}

export default function App() {
  useTheme()
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicLayout><Home /></PublicLayout>} />
        <Route path="/catalogo" element={<PublicLayout><Catalog /></PublicLayout>} />
        <Route path="/producto/:slug" element={<PublicLayout><ProductDetail /></PublicLayout>} />
        <Route path="/taller" element={<PublicLayout><Workshop /></PublicLayout>} />
        <Route path="/contacto" element={<PublicLayout><Contact /></PublicLayout>} />
        <Route path="/cookies" element={<PublicLayout><CookiePolicy /></PublicLayout>} />
        <Route path="/admin/*" element={<AdminRoutes />} />
      </Routes>
      <CookieBanner />
    </BrowserRouter>
  )
}
