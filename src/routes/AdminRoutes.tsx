import { Routes, Route } from 'react-router-dom'
import { AdminShell } from '@/components/admin/AdminShell'
import { ProtectedRoute } from './ProtectedRoute'
import Dashboard from '@/pages/admin/Dashboard'
import ProductsList from '@/pages/admin/ProductsList'
import Login from '@/pages/admin/Login'
import { ProductEdit } from '@/pages/admin/ProductEdit'
import { Import } from '@/pages/admin/Import'
import { Images } from '@/pages/admin/Images'
import { Quotes } from '@/pages/admin/Quotes'
import { Settings } from '@/pages/admin/Settings'
import { Categories } from '@/pages/admin/Categories'
import Groupings from '@/pages/admin/Groupings'
import OrdersList from '@/pages/admin/OrdersList'
import OrderDetail from '@/pages/admin/OrderDetail'
import ReturnsList from '@/pages/admin/ReturnsList'
import ReturnDetail from '@/pages/admin/ReturnDetail'
import { Brechas } from '@/pages/admin/Brechas'

export function AdminRoutes() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AdminShell />}>
          <Route index element={<Dashboard />} />
          <Route path="productos" element={<ProductsList />} />
          <Route path="productos/:id" element={<ProductEdit />} />
          <Route path="pedidos" element={<OrdersList />} />
          <Route path="pedidos/:id" element={<OrderDetail />} />
          <Route path="devoluciones" element={<ReturnsList />} />
          <Route path="devoluciones/:id" element={<ReturnDetail />} />
          <Route path="categorias" element={<Categories />} />
          <Route path="agrupaciones" element={<Groupings />} />
          <Route path="importar" element={<Import />} />
          <Route path="imagenes" element={<Images />} />
          <Route path="consultas" element={<Quotes />} />
          <Route path="configuracion" element={<Settings />} />
          <Route path="brechas" element={<Brechas />} />
        </Route>
      </Route>
    </Routes>
  )
}
