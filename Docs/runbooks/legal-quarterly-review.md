# Revision legal trimestral

> Recordatorio operativo: revisar trimestralmente la coherencia entre la documentacion legal y la realidad tecnica/operativa del sitio.

## Frecuencia

Cada **3 meses** (recordatorio en calendario del DPO o responsable):
- Q1: 31 marzo
- Q2: 30 junio
- Q3: 30 septiembre
- Q4: 31 diciembre

## Checklist

### Cookies (15 min)

1. Abrir el sitio en navegador limpio (incognito + Cookies bloqueadas).
2. Aceptar consent banner (tecnicas) y navegar 5 min: home -> contacto (aceptar mapa) -> producto -> checkout.
3. Inventariar cookies depositadas en `DevTools -> Application -> Cookies`.
4. Comparar con la tabla en `src/pages/public/CookiePolicy.tsx`. Diferencias -> actualizar tabla en el mismo commit.

### Encargados de tratamiento (15 min)

1. Listar servicios externos integrados en el codigo en los ultimos 3 meses (`rtk grep -rn "supabase\|cloudflare\|resend\|redsys\|google\|firecrawl" src/`).
2. Comparar con tabla §7 en `src/pages/public/PrivacyPolicy.tsx`.
3. Nuevo proveedor -> añadir entrada + actualizar RAT.

### RAT (10 min)

1. Revisar `Docs/legal/rat-2026.md` -- verificar que cada actividad documentada sigue activa.
2. Cambios de finalidad/base legal -> revisar `legal-versions.ts` y bumpar `RAT_VERSION` si aplica.

### Brechas (5 min)

1. `select count(*) from data_breaches where status != 'closed'` -- debe ser 0.
2. Si hay brechas abiertas -> activar procedimiento (ver `Docs/legal/procedimiento-brechas.md`).

### Versionado politicas (5 min)

1. ¿Hubo cambios sustantivos en politicas? -> bumpar `*_VERSION` en `src/lib/legal-versions.ts` para forzar re-consent.

## Responsable

DPO o, en su defecto, responsable de tratamiento (titular del proyecto).

## Ultima revision

| Fecha | Responsable | Hallazgos | Acciones |
|---|---|---|---|
| 2026-05-27 | (auditoria legal V3) | 48 hallazgos | Plan de cierre en 4 sprints -- ver `Docs/legal/auditoria-legal-2026-05-27-v3-arreglos.md` |
