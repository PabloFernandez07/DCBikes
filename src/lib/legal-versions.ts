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
export const TERMS_VERSION = '2026-05-27-v5'
export const PRIVACY_VERSION = '2026-05-27-v5'
export const COOKIES_VERSION = '2026-05-27-v5'
export const RETURNS_VERSION = '2026-05-27-v5'
export const RAT_VERSION = '2026-05-27-v5'

// Fecha de última auditoría que motivó cambios sustantivos
export const LAST_AUDIT_DATE = '2026-05-27'
export const AUDIT_VERSION = 'V5'
