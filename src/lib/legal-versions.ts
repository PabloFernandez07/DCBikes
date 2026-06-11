// Versión semántica de los textos legales en vigor. Cambiar cuando se modifique
// el contenido sustancial de cualquier política legal.
// Bump fuerza re-consent en el banner (ver P-12) y nuevo timestamp en RAT.
// Usado para almacenar prueba del consentimiento en orders.consent_*_version.
//
// Changelog auditorías:
//   2026-05-26  V1  → 27 hallazgos iniciales (cookies, aviso legal, ODR)
//   2026-05-26  V2  → 18 hallazgos adicionales (admin model, signed URLs)
//   2026-05-27  V3  → 48 hallazgos (Verifactu, Omnibus, accesibilidad)
//   2026-05-27  V4  → 66 hallazgos (DSA, DPIA, race conditions, audit log)
//   2026-05-27  V5  → 122 hallazgos (definitiva: RLS, secretos, dark patterns, DSA)
//   2026-06-11  V6  → contenido legal: cierre plataforma ODR (Rgto. 2024/3228),
//                     tratamientos no declarados (stock_alerts, customer_sessions,
//                     analítica propia), dcb_session reclasificada como analítica,
//                     accesibilidad microempresa, devoluciones art. 108.2 TRLGDCU
export const TERMS_VERSION = '2026-06-11-v6'
export const PRIVACY_VERSION = '2026-06-11-v6'
export const COOKIES_VERSION = '2026-06-11-v6'
export const RETURNS_VERSION = '2026-06-11-v6'
export const RAT_VERSION = '2026-06-11-v6'

// Fecha de última auditoría que motivó cambios sustantivos
export const LAST_AUDIT_DATE = '2026-06-11'
export const AUDIT_VERSION = 'V6'

// B-6 auditoría V6: fecha legible para el público en las páginas legales.
// Los identificadores internos (PRIVACY_VERSION, etc.) NO deben mostrarse como
// "fecha de actualización"; usar siempre esta constante en los headers.
export const LAST_UPDATED_DISPLAY = '11 de junio de 2026 (versión v6)'
