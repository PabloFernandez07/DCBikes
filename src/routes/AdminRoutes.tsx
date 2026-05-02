import { Routes, Route } from 'react-router-dom'
import { AdminShell } from '@/components/admin/AdminShell'
import { ProtectedRoute } from './ProtectedRoute'
import Dashboard from '@/pages/admin/Dashboard'
import ProductsList from '@/pages/admin/ProductsList'
import Login from '@/pages/admin/Login'
import { ProductEdit } from '@/pages/admin/ProductEdit'
import { Import } from '@/pages/admin/Import'
import { Quotes } from '@/pages/admin/Quotes'
import { Settings } from '@/pages/admin/Settings'
import { Categories } from '@/pages/admin/Categories'

export function AdminRoutes() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AdminShell />}>
          <Route index element={<Dashboard />} />
          <Route path="productos" element={<ProductsList />} />
          <Route path="productos/:id" element={<ProductEdit />} />
          <Route path="categorias" element={<Categories />} />
          <Route path="importar" element={<Import />} />
          <Route path="consultas" element={<Quotes />} />
          <Route path="configuracion" element={<Settings />} />
        </Route>
      </Route>
    </Routes>
  )
}
