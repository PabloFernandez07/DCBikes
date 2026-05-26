// supabase/functions/_shared/email-template.ts
//
// Plantilla HTML reutilizable para todos los emails transaccionales de DC Bikes.
//
// Decisiones de diseño:
// - 100 % HTML inline (Outlook 2007-2019 no soporta <style> en <head> de forma fiable).
// - Logo como texto (font-family Bebas Neue fallback Arial Black) — evitamos imágenes
//   externas porque Gmail/Outlook bloquean por defecto y dejarían el header roto.
// - max-width 600px (estándar email) centrado con table wrapper para Outlook.
// - Colores de marca DC Bikes:
//     lavender  #C4A2CF (acciones / acentos)
//     ink-deep  #0F0F12 (header oscuro)
//     cream     #F2E9DC (fondo body suave alternativo, aquí usamos blanco)
// - Preheader oculto con MSO-hide:all + display:none para preview Gmail/iOS.
// - Responsive con media query (los clientes que soportan webkit la respetan; Outlook
//   simplemente cae al diseño 600px que ya es legible).
// - <meta charset utf-8> para ñ y acentos.

export interface EmailCtaButton {
  label: string
  url: string
}

export interface EmailFooterLink {
  label: string
  url: string
}

export interface EmailContext {
  /** Título principal (h1) — ej. "Tu pedido ha sido aceptado" */
  title: string
  /** Texto preheader (oculto en cuerpo, visible en preview de la bandeja) */
  preheader?: string
  /** Contenido HTML del body (se inyecta tal cual entre header y CTA/footer) */
  bodyHtml: string
  /** Botón CTA primario (opcional) */
  ctaButton?: EmailCtaButton
  /** Botones CTA secundarios renderizados como enlaces tras el primario */
  secondaryLinks?: EmailFooterLink[]
  /** Datos tienda — se inyectan en el footer si vienen */
  storeAddress?: string
  storePhone?: string
  storeEmail?: string
  /** Links legales en footer (cookies, privacidad, etc.) */
  footerLinks?: EmailFooterLink[]
}

const COLORS = {
  lavender: '#C4A2CF',
  lavenderDark: '#A788B5',
  inkDeep: '#0F0F12',
  inkSoft: '#1A1620',
  textPrimary: '#222222',
  textSecondary: '#666666',
  textMuted: '#999999',
  border: '#e8e8e8',
  bgSoft: '#f5f5f5',
  bgPage: '#f0eee9',
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderEmail(ctx: EmailContext): string {
  const preheader = ctx.preheader ? escapeHtml(ctx.preheader) : ''

  const ctaHtml = ctx.ctaButton
    ? `
      <tr>
        <td align="center" style="padding:8px 0 28px 0">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" bgcolor="${COLORS.lavender}" style="border-radius:6px">
                <a href="${escapeHtml(ctx.ctaButton.url)}"
                   style="display:inline-block;padding:14px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.3px;border-radius:6px;background-color:${COLORS.lavender};border:1px solid ${COLORS.lavenderDark}">
                  ${escapeHtml(ctx.ctaButton.label)}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : ''

  const secondaryLinksHtml =
    ctx.secondaryLinks && ctx.secondaryLinks.length > 0
      ? `
      <tr>
        <td align="center" style="padding:0 0 24px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${COLORS.textSecondary}">
          ${ctx.secondaryLinks
            .map(
              (l) =>
                `<a href="${escapeHtml(l.url)}" style="color:${COLORS.lavenderDark};text-decoration:underline;margin:0 8px">${escapeHtml(l.label)}</a>`,
            )
            .join('·')}
        </td>
      </tr>`
      : ''

  const footerContact: string[] = []
  if (ctx.storeAddress) footerContact.push(escapeHtml(ctx.storeAddress))
  if (ctx.storePhone)
    footerContact.push(
      `<a href="tel:${escapeHtml(ctx.storePhone.replace(/\s+/g, ''))}" style="color:${COLORS.lavenderDark};text-decoration:none">${escapeHtml(ctx.storePhone)}</a>`,
    )
  if (ctx.storeEmail)
    footerContact.push(
      `<a href="mailto:${escapeHtml(ctx.storeEmail)}" style="color:${COLORS.lavenderDark};text-decoration:none">${escapeHtml(ctx.storeEmail)}</a>`,
    )

  const footerLinksHtml =
    ctx.footerLinks && ctx.footerLinks.length > 0
      ? ctx.footerLinks
          .map(
            (l) =>
              `<a href="${escapeHtml(l.url)}" style="color:${COLORS.textMuted};text-decoration:underline;margin:0 6px">${escapeHtml(l.label)}</a>`,
          )
          .join(' · ')
      : ''

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="es">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <title>${escapeHtml(ctx.title)}</title>
  <!--[if mso]>
  <style type="text/css">
    table, td, div, h1, p { font-family: Arial, sans-serif !important; }
  </style>
  <![endif]-->
  <style>
    @media only screen and (max-width: 480px) {
      .email-container { width: 100% !important; }
      .px-32 { padding-left: 18px !important; padding-right: 18px !important; }
      .h1 { font-size: 22px !important; line-height: 1.25 !important; }
      .logo { font-size: 28px !important; letter-spacing: 2px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.bgPage};font-family:Arial,Helvetica,sans-serif;color:${COLORS.textPrimary};-webkit-font-smoothing:antialiased">

  <!-- Preheader (oculto, visible solo en preview de bandeja entrada) -->
  ${
    preheader
      ? `<div style="display:none;font-size:1px;color:${COLORS.bgPage};line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all">
    ${preheader}
  </div>`
      : ''
  }

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${COLORS.bgPage}">
    <tr>
      <td align="center" style="padding:24px 12px">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="email-container" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid ${COLORS.border};border-radius:8px;overflow:hidden">

          <!-- Header -->
          <tr>
            <td align="center" bgcolor="${COLORS.inkSoft}" style="background-color:${COLORS.inkSoft};padding:32px 24px">
              <p style="margin:0 0 6px 0;color:${COLORS.lavender};font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase">
                DC Bikes Cantabria
              </p>
              <h2 class="logo" style="margin:0;color:#EEF3F8;font-family:'Bebas Neue','Arial Black',Arial,sans-serif;font-size:34px;font-weight:900;letter-spacing:4px;text-transform:uppercase">
                DC&nbsp;BIKES
              </h2>
              <p style="margin:8px 0 0 0;color:#7E6E8A;font-family:Arial,Helvetica,sans-serif;font-size:12px">
                El Astillero · Cantabria
              </p>
            </td>
          </tr>

          <!-- Title + Body -->
          <tr>
            <td class="px-32" style="padding:36px 32px 16px 32px">
              <h1 class="h1" style="margin:0 0 20px 0;color:${COLORS.inkDeep};font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;line-height:1.3;letter-spacing:-0.2px">
                ${escapeHtml(ctx.title)}
              </h1>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#444444">
                ${ctx.bodyHtml}
              </div>
            </td>
          </tr>

          ${ctaHtml}
          ${secondaryLinksHtml}

          <!-- Footer -->
          <tr>
            <td style="background-color:${COLORS.bgSoft};padding:24px 32px;border-top:1px solid ${COLORS.border}">
              ${
                footerContact.length > 0
                  ? `<p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${COLORS.textSecondary};text-align:center;line-height:1.6">
                    ${footerContact.join(' · ')}
                  </p>`
                  : ''
              }
              ${
                footerLinksHtml
                  ? `<p style="margin:6px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${COLORS.textMuted};text-align:center">
                    ${footerLinksHtml}
                  </p>`
                  : ''
              }
              <p style="margin:12px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${COLORS.textMuted};text-align:center;line-height:1.5">
                Recibes este email porque has realizado un pedido en DC Bikes Cantabria.<br/>
                © ${new Date().getFullYear()} DC Bikes Cantabria. Todos los derechos reservados.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`
}
