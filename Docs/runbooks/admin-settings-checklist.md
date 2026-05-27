# Admin Settings Checklist (acción del cliente)

Settings que el titular debe rellenar vía `/admin/configuracion` antes de:
- Aceptar pedidos en producción
- Emitir facturas legales

## Datos fiscales (bloqueantes — gate L-02/C-02)

- [ ] `legal_company_name` — razón social o nombre completo del autónomo
- [ ] `legal_company_cif` — NIF/CIF
- [ ] `legal_company_address` — dirección postal completa

## Datos legales descriptivos (no bloqueantes pero requeridos)

- [ ] `legal_forma_juridica` — "Empresario individual" o "Sociedad Limitada"
- [ ] `legal_inscripcion` — "No aplica (art. 19 CCom)" si autónomo, o "Inscrita en RM Santander, Tomo X Folio Y Hoja Z" si SL **(C-13 auditoría V3)**

## Verifactu (bloqueante para emitir facturas — C-01)

- [ ] `verifactu_mode` — `'verifactu'` (envío real-time AEAT, recomendado microempresa) o `'no_verifactu'` (firma local + remisión a requerimiento)

## Email de contacto

- [ ] `store_contact_email` — sembrado con `info@dcbikescantabria.es`, ajustar si difiere

## Buckets storage

- [ ] Crear bucket `order-contracts` (privado)
- [ ] Crear bucket `legal-templates` (privado) + subir `devoluciones-formulario.pdf`

Ver `Docs/runbooks/storage-buckets-setup.md`.

## Vault secrets (cron + tokens)

- [ ] `service_role_key`
- [ ] `supabase_project_ref`
- [ ] `order_cron_secret`
- [ ] `data_retention_cron_secret`
- [ ] env `ORDER_TOKEN_SECRET` en Edge Functions

Ver `Docs/runbooks/cron-vault-setup.md`.
