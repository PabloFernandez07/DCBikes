// supabase/functions/_shared/redsys-config.ts
//
// Resolver de configuración Redsys según el setting `redsys_environment`.
//
// Tres modos:
//   - mock : sin llamada real a Redsys. order-place devuelve mock_url y el
//            frontend simula el flujo desde /mock-redsys-pago.
//   - test : sandbox público Redsys con credenciales universales documentadas.
//   - prod : credenciales reales de la tienda desde env vars (Supabase Vault).
//
// Por seguridad, las credenciales reales NUNCA se leen de la tabla `settings`
// (visible a cualquier admin). Solo de Deno.env.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { asString, getSettings, getSiteUrl } from './email-utils.ts'

export type RedsysMode = 'mock' | 'test' | 'prod'

export interface RedsysConfig {
  mode: RedsysMode
  /** URL del endpoint de pago (form POST). Vacío si mode=mock. */
  endpoint: string
  /** URL del endpoint de operaciones server-to-server (REST). */
  restEndpoint: string
  /** FUC (Merchant Code). */
  merchantCode: string
  /** Terminal (3 dígitos numéricos string). */
  terminal: string
  /** Clave secreta base64 (la usada para firmar HMAC SHA-256). */
  secretBase64: string
  /** Nombre del comercio mostrado en el TPV. */
  merchantName: string
  /** URL pública del webhook /redsys-notification. */
  paymentNotificationUrl: string
  /** URL de éxito de redirect frontend. */
  paymentOkUrl: string
  /** URL de cancelación/error de redirect frontend. */
  paymentKoUrl: string
  /** Métodos habilitados ("C" tarjeta, "z" bizum). */
  payMethods: string
}

const PUBLIC_TEST = {
  endpoint: 'https://sis-t.redsys.es:25443/sis/realizarPago',
  restEndpoint: 'https://sis-t.redsys.es:25443/sis/rest/trataPeticionREST',
  merchantCode: '999008881',
  terminal: '001',
  // Clave universal de pruebas Redsys (pública en docs oficiales).
  secretBase64: 'sq7HjrUOBfKmC576ILgskD5srU870gJ7',
}

const PROD_ENDPOINTS = {
  endpoint: 'https://sis.redsys.es/sis/realizarPago',
  restEndpoint: 'https://sis.redsys.es/sis/rest/trataPeticionREST',
}

/**
 * Lee `redsys_environment` y `redsys_merchant_name` de settings y construye
 * el RedsysConfig completo. Lanza si modo=prod y faltan env vars.
 */
export async function loadRedsysConfig(
  supabase: SupabaseClient,
): Promise<RedsysConfig> {
  const settings = await getSettings(supabase, [
    'redsys_environment',
    'redsys_merchant_name',
  ])

  const rawMode = asString(settings.redsys_environment, 'mock').toLowerCase()
  const mode: RedsysMode =
    rawMode === 'prod' ? 'prod' : rawMode === 'test' ? 'test' : 'mock'

  const merchantName =
    asString(settings.redsys_merchant_name, 'DC Bikes Cantabria')

  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '')
  const paymentNotificationUrl = `${supabaseUrl}/functions/v1/redsys-notification`

  const siteUrl = getSiteUrl()
  const paymentOkUrl = `${siteUrl}/pedido/confirmacion`
  const paymentKoUrl = `${siteUrl}/pedido/error`

  // Por defecto solo tarjeta. El admin habilita Bizum cuando lo active el banco.
  const payMethods = asString(Deno.env.get('REDSYS_PAY_METHODS') ?? 'C', 'C')

  if (mode === 'mock') {
    return {
      mode,
      endpoint: '',
      restEndpoint: '',
      merchantCode: PUBLIC_TEST.merchantCode,
      terminal: PUBLIC_TEST.terminal,
      secretBase64: PUBLIC_TEST.secretBase64,
      merchantName,
      paymentNotificationUrl,
      paymentOkUrl,
      paymentKoUrl,
      payMethods,
    }
  }

  if (mode === 'test') {
    return {
      mode,
      endpoint: PUBLIC_TEST.endpoint,
      restEndpoint: PUBLIC_TEST.restEndpoint,
      merchantCode: PUBLIC_TEST.merchantCode,
      terminal: PUBLIC_TEST.terminal,
      secretBase64: PUBLIC_TEST.secretBase64,
      merchantName,
      paymentNotificationUrl,
      paymentOkUrl,
      paymentKoUrl,
      payMethods,
    }
  }

  // mode === 'prod'
  const merchantCode = Deno.env.get('REDSYS_MERCHANT_CODE') ?? ''
  const terminal = Deno.env.get('REDSYS_TERMINAL') ?? ''
  // Clave de firma: primero la guardada (cifrada) en Vault desde el admin; si no
  // hay, caemos al secreto de entorno REDSYS_SECRET_KEY (compatibilidad previa).
  let secretBase64 = ''
  try {
    const { data } = await supabase.rpc('get_redsys_secret_key')
    if (typeof data === 'string' && data.trim()) secretBase64 = data.trim()
  } catch {
    // Sin acceso a Vault → fallback a la env var.
  }
  if (!secretBase64) secretBase64 = Deno.env.get('REDSYS_SECRET_KEY') ?? ''

  if (!merchantCode || !terminal || !secretBase64) {
    throw new Error(
      'Redsys en modo "prod" pero faltan env vars: REDSYS_MERCHANT_CODE, REDSYS_TERMINAL, REDSYS_SECRET_KEY. ' +
        'Configura estas vars en Supabase Vault antes de habilitar prod.',
    )
  }

  return {
    mode,
    endpoint: PROD_ENDPOINTS.endpoint,
    restEndpoint: PROD_ENDPOINTS.restEndpoint,
    merchantCode,
    terminal,
    secretBase64,
    merchantName,
    paymentNotificationUrl,
    paymentOkUrl,
    paymentKoUrl,
    payMethods,
  }
}
