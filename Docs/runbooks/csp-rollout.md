# CSP Rollout — Runbook S-03

> Cierre del hallazgo S-03 de la auditoría legal V3.
> Plan de migración escalonado de `Content-Security-Policy-Report-Only` (sin bloquear)
> a `Content-Security-Policy` (enforcing, sin `'unsafe-inline'`).

## Fase 1 — Report-Only (estado actual)

`vercel.json` envía `Content-Security-Policy-Report-Only` con directivas estrictas
(sin `'unsafe-inline'` en script-src ni style-src). Las violaciones se reportan a
`/api/csp-report` y se loguean en Vercel Dashboard → Logs.

## Fase 2 — Recopilación (7 días mínimo)

1. Tras cada deploy a producción, revisar `Vercel Dashboard → Project → Logs`
   filtrando por `[CSP-REPORT]`.
2. Si aparecen violaciones críticas:
   - **Inline scripts de Vite/React** en build de producción → considerar `build.cssCodeSplit: false` o `vite-plugin-csp` para emitir hashes/nonces.
   - **Estilos inline de librerías de terceros** (ej. componentes UI) → añadir hashes a `style-src` o migrar a clases CSS.
   - **Eventos `onclick=`/`onload=`** en HTML → refactorizar a `addEventListener`.
3. Iterar hasta que `Logs` esté limpio de violaciones críticas durante 7 días seguidos.

## Fase 3 — Migración a enforcing

Cuando el report esté limpio:

1. En `vercel.json`, cambiar el header de `Content-Security-Policy-Report-Only` → `Content-Security-Policy`.
2. Mantener `report-uri /api/csp-report;` (sirve también con CSP enforcing).
3. Deploy a preview, smoke test cross-browser (Chrome, Firefox, Safari).
4. Deploy a producción.

## Rollback

Si tras Fase 3 aparecen errores funcionales:

```bash
# revertir solo el header en vercel.json
vercel rollback
# o git revert del commit que activó enforcing
```

## Verificación inicial (Fase 1)

```bash
curl -sI https://dcbikescantabria.es | grep -i 'content-security-policy'
# Esperado: Content-Security-Policy-Report-Only: ...
```

Y comprobar que `/api/csp-report` responde 204 a POST:

```bash
curl -X POST https://dcbikescantabria.es/api/csp-report \
  -H 'Content-Type: application/csp-report' \
  -d '{"csp-report":{"violated-directive":"script-src"}}'
# Esperado: HTTP/2 204
```
