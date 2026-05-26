# DC Bikes — Checklist Manual de Testing

Ejecuta `npm run dev`. Visitar http://localhost:5173.
Marca cada casilla cuando pase. Si falla anota en `Docs/testing-report.md`.

## Pre-requisitos
- [ ] `.env.local` cargado y `npm run dev` arranca sin errores.
- [ ] Usuario admin existe en Supabase Auth (Auth → Users).
- [ ] Hay al menos 5 productos `active=true` y `is_purchasable=true` con stock>0.

## Cliente público — flujos críticos
- [ ] 1. Cargar `/catalogo` muestra productos con foto, precio y nombre.
- [ ] 2. Filtrar por categoría: solo aparecen los de la categoría seleccionada.
- [ ] 3. Buscar por texto (ej: "abrazadera"): resultados relevantes en <500 ms.
- [ ] 4. Producto agrupado (`model_group` con varias tallas): selector tallas funciona, foto cambia, badge stock por talla correcto.
- [ ] 5. Producto NO online (`is_purchasable=false`): botón "Consultar en tienda" abre modal cotización.
- [ ] 6. Producto sin stock: botón "Añadir al carrito" deshabilitado.
- [ ] 7. Añadir al carrito desde `/producto/:slug`: drawer aparece, contador del nav se actualiza.
- [ ] 8. Modificar cantidad en drawer: respeta `stock` máximo del producto.
- [ ] 9. Eliminar item del drawer: desaparece, totales recalculan.
- [ ] 10. `/carrito`: cambiar entre envío y recogida → totales se actualizan (shipping=0 en pickup).
- [ ] 11. `/checkout`: validación email inválido, CP fuera península, CIF inválido si B2B → bloquea submit.
- [ ] 12. Checkout shipping: rellenar todo válido → submit pasa.
- [ ] 13. Checkout pickup: campos dirección ocultos.
- [ ] 14. Sin marcar `accepted_terms` ni `accepted_privacy`: submit bloqueado.
- [ ] 15. Tras submit válido: redirección a `/mock-redsys-pago/:order_id` → botón "Autorizar" → `/pedido/confirmacion/:order_id` muestra resumen.
- [ ] 16. Email confirmación recibido con número de pedido y items.
- [ ] 17. `/mis-pedidos`: introducir email → mensaje genérico "Si existe un pedido recibirás un enlace".
- [ ] 18. Recibir email magic link. Click → llega a `/mis-pedidos/sesion?token=...`.
- [ ] 19. Lista de pedidos del cliente: muestra todos los pedidos del email.
- [ ] 20. Click en pedido: detalle muestra items, estado, tracking si shipped.
- [ ] 21. Pedido en `authorized`: botón "Cancelar pedido" funciona.
- [ ] 22. Email cliente "pedido cancelado por ti" recibido.
- [ ] 23. Pedido en `authorized` con shipping: botón "Modificar dirección" → form → submit guarda → admin recibe email "dirección modificada".
- [ ] 24. Cerrar sesión cliente → volver a entrar con magic link de nuevo email.
- [ ] 25. Páginas legales: `/devoluciones`, `/terminos-venta`, `/privacidad`, `/cookies`, `/aviso-legal` cargan con datos legales rellenos (⚠️ requiere Bug #1 fix).
- [ ] 26. `/devoluciones`: enlace al PDF descarga el formulario UE.
- [ ] 27. Footer: todos los enlaces internos no devuelven 404. Instagram/Facebook visibles (⚠️ requiere Bug #1 fix).

## Admin — flujos críticos
- [ ] 28. `/admin/login` permite login con cuenta admin Supabase Auth.
- [ ] 29. Dashboard: widgets "Pedidos pendientes" y "Pedidos hoy" muestran contadores correctos.
- [ ] 30. `/admin/productos` muestra columnas "Online", "Talla", "Grupo" con valores correctos.
- [ ] 31. Editar producto: secciones Identificación/Variantes/Estado existen.
- [ ] 32. Toggle "Comprar online": al guardar, en `/catalogo` el producto pasa a "Consultar" o "Añadir" según valor.
- [ ] 33. Bulk select varios productos + acción "Activar online" en lote: todos cambian.
- [ ] 34. `/admin/agrupaciones`: ve grupos por `model_group` detectados.
- [ ] 35. Editar talla de una variante: persiste.
- [ ] 36. Romper grupo (clear `model_group`): variante deja de aparecer en grupo.
- [ ] 37. Mover producto a otro grupo: refresca correctamente.
- [ ] 38. `/admin/importar`: subir `Docs/productos-importar-v2.xlsx`.
- [ ] 39. Modo dry-run preview: muestra cambios sin aplicar.
- [ ] 40. Importar real: contadores updated/inserted/skipped razonables.
- [ ] 41. `/admin/pedidos`: el pedido recién creado por cliente aparece en la lista.
- [ ] 42. Filtrar por `authorized`: solo los authorized.
- [ ] 43. Counter cards clicables aplican filtro rápido.
- [ ] 44. `/admin/pedidos/:id` detalle: ve cliente, items, totales, timeline, notas internas.
- [ ] 45. Aceptar pedido: modal → confirmar → estado `accepted` + factura PDF generada + cliente recibe email.
- [ ] 46. Email cliente "aceptado" recibido con link factura PDF.
- [ ] 47. Descargar factura PDF desde admin.
- [ ] 48. Marcar como enviado un accepted: modal → seleccionar transportista + tracking → submit → email cliente "enviado".
- [ ] 49. Email cliente "enviado" recibido con tracking visible.
- [ ] 50. Marcar como entregado: botón funciona. ⚠️ Bug #5: hoy hace UPDATE directo, sin validar estado origen.
- [ ] 51. Pedido `authorized`: rechazar → razón obligatoria → email cliente "rechazado".
- [ ] 52. Pedido `pending`: eliminar (soft delete) → desaparece. Toggle "Mostrar eliminados" lo trae de vuelta.
- [ ] 53. Bulk shipping: seleccionar 2-3 accepted+shipping → modal bulk → submit → reporta éxito/fallos.
- [ ] 54. Export CSV: descarga lista pedidos filtrada.
- [ ] 55. Botón "Refrescar" en lista y detalle: re-fetch sin recargar página.
- [ ] 56. `/admin/configuracion`: ver 3 secciones "E-commerce", "Facturación", "Pasarela Redsys".
- [ ] 57. Cambiar modo Redsys mock↔test → guarda; siguiente pedido usa la nueva config.
- [ ] 58. Settings: cambiar `shipping_flat_rate_cents` → reflejado en checkout (⚠️ requiere Bug #1 fix).

## Edge cases
- [ ] 59. Stock concurrente: dos navegadores compran el último item → uno gana, el otro recibe error "conflicto de stock".
- [ ] 60. Magic link expirado (forzar > 24h): mensaje "Sesión expirada".
- [ ] 61. Magic link de un email sin pedidos: respuesta 200 genérica (anti-enumeración).
- [ ] 62. Datos legales vacíos → aceptar pedido → factura NO se genera, mensaje claro.
- [ ] 63. Soft-delete: pedido eliminado NO aparece en lista admin por defecto.
- [ ] 64. Pedido modificado por cliente: banner naranja en admin detail.
- [ ] 65. Pedido cancelado por cliente: banner rojo en admin.
- [ ] 66. F5 en `/checkout?delivery=pickup` mantiene selección.

## Responsive (móvil)
- [ ] 67. `/catalogo` mobile (375×667): grid 1 columna, cards legibles.
- [ ] 68. `/producto/:slug` mobile: SizeSelector funcional, fotos swipeables.
- [ ] 69. CartDrawer full-width mobile.
- [ ] 70. `/checkout` mobile: form usable, sin scroll horizontal.
- [ ] 71. Admin OrdersList mobile: cards layout.
- [ ] 72. Admin OrderDetail mobile: timeline + actions accesibles.

## Accesibilidad básica
- [ ] 73. Tab navigation: focus visible en todos los inputs/botones.
- [ ] 74. aria-labels en botones de icono (carrito, redes sociales).
- [ ] 75. Roles ARIA en SizeSelector (`role="radiogroup"`).
- [ ] 76. Modal cierra con Escape.
- [ ] 77. Contraste lavender/ink-deep cumple WCAG AA.
- [ ] 78. Títulos H1→H6 jerárquicos en cada página.
