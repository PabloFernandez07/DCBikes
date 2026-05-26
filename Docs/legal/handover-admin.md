# Handover de administración — DC Bikes Cantabria

**Última actualización:** 2026-05-26
**Destinatario:** titular del negocio (administrador único del panel).

Este documento es una guía operativa para gestionar el panel de administración con seguridad y para entender qué tienes que dejar configurado antes de poner la web en producción.

---

## 1. Activar 2FA en Supabase Studio

La autenticación de doble factor es **obligatoria** en todas las cuentas con acceso a la base de datos.

1. Accede a https://supabase.com/dashboard e inicia sesión.
2. Pulsa sobre tu avatar (arriba a la derecha) → **Account**.
3. Entra en la sección **Two-Factor Authentication**.
4. Pulsa **Enable TOTP**.
5. Escanea el código QR con una app autenticadora:
   - **Google Authenticator** (iOS / Android)
   - **Authy** (iOS / Android / Desktop)
   - **1Password** (si ya lo usas como gestor de contraseñas)
6. Introduce el código de 6 dígitos que te genera la app para confirmar.
7. **Guarda los códigos de recuperación** que te muestra Supabase. Imprímelos o guárdalos en un gestor de contraseñas. Sin ellos, si pierdes el móvil, **pierdes el acceso**.

---

## 2. Activar 2FA en Vercel

1. Accede a https://vercel.com/account/settings.
2. Entra en la sección **Security**.
3. Localiza **Two-Factor Authentication** y pulsa **Enable**.
4. Escanea el QR con la misma app autenticadora.
5. Guarda los códigos de recuperación.

---

## 3. Política de contraseñas recomendada

- **Longitud mínima:** 12 caracteres.
- **Composición:** mayúsculas + minúsculas + números + símbolos.
- **No reutilizar** contraseñas entre servicios. Cada servicio (Supabase, Vercel, Resend, dominio, email, Redsys) debe tener la suya.
- **Usar un gestor de contraseñas:** 1Password, Bitwarden o el integrado en tu navegador con cuenta sincronizada.
- **Cambiar inmediatamente** si tienes sospecha de compromiso o si recibes una alerta de inicio de sesión que no reconozcas.
- **Nunca compartir** contraseñas por email, WhatsApp ni Telegram. Si necesitas compartir credenciales con asesoría, usa la función de compartir del gestor de contraseñas.

---

## 4. Operaciones de administración habituales

Todas se realizan desde `/admin` después de iniciar sesión.

### 4.1 Aceptar un pedido
1. Entra en `/admin/pedidos`.
2. Localiza el pedido en estado **"pendiente"**.
3. Pulsa sobre el pedido para abrir el detalle.
4. Pulsa **"Aceptar"**. El cliente recibirá un email automático de confirmación.

### 4.2 Rechazar un pedido
1. Mismo flujo que aceptar.
2. Pulsa **"Rechazar"**.
3. **Importante:** introduce el motivo del rechazo. Quedará registrado en `order_audit_log` y se enviará al cliente.

### 4.3 Marcar como listo para recoger / enviado
- En pedidos con recogida en tienda: pulsa **"Listo para recoger"**. El cliente recibe email con instrucciones.
- En pedidos con envío: pulsa **"Enviado"** e introduce, si lo tienes, el número de seguimiento.

### 4.4 Ver y descargar la factura
- En el detalle del pedido, pulsa **"Ver factura PDF"**. La URL es firmada y caduca en unos minutos por seguridad.

### 4.5 Cancelar manualmente un pedido
- Solo cuando sea estrictamente necesario (cliente lo pide fuera del flujo normal, error de stock, etc.).
- Deja siempre **notas internas** explicando el motivo. Esas notas no se envían al cliente pero quedan registradas.

---

## 5. Configuración inicial obligatoria antes de publicar

Antes de poner la web a disposición del público, completa estos tres bloques desde `/admin/configuracion`:

### 5.1 Facturación
- `legal_company_name`: tu nombre completo o razón social.
- `legal_company_cif`: tu NIF o CIF.
- `legal_company_address`: tu dirección fiscal completa (calle, número, código postal, ciudad, provincia).

Sin estos datos, las facturas que se generan no son válidas y el RAT (`Docs/legal/rat-2026.md`) tampoco queda completo a efectos del art. 30 RGPD.

### 5.2 Ecommerce
- `shipping_flat_rate_cents`: tarifa plana de envío en céntimos (ej. 599 = 5,99 €).
- `shipping_free_threshold_cents`: importe del pedido a partir del cual el envío es gratuito.
- `order_auto_cancel_deadline_hours`: horas tras las que un pedido pendiente sin acción se cancela automáticamente.
- Revisa todos los parámetros del bloque y ajusta a tu modelo de negocio.

### 5.3 Pasarela de pago (Redsys)
- `redsys_environment`: debe estar en `"test"` durante la fase de demo/pruebas. **Cámbialo a `"prod"` solo cuando estés listo para cobrar de verdad.**
- Confirma que `redsys_merchant_code`, `redsys_terminal` y `redsys_secret_key` son los que te ha proporcionado tu banco adherente.
- **Nunca compartas la `redsys_secret_key` por canales inseguros.**

---

## 6. Notificación de brechas de seguridad

Si en algún momento detectas algo extraño — un inicio de sesión que no reconoces, un email anómalo, datos modificados sin tu intervención, una caída de servicio inexplicable — **considera la posibilidad de que sea una brecha de seguridad**.

**Acción inmediata:** dirígete a [`Docs/legal/procedimiento-brechas.md`](./procedimiento-brechas.md) y sigue paso a paso lo indicado.

**Recuerda los plazos legales:**

- **24 horas** (máximo) para contener técnicamente la brecha.
- **72 horas** (máximo) para notificar a la AEPD si la brecha entraña riesgo para los derechos y libertades de las personas físicas (art. 33 RGPD).
- **Sin dilación indebida** para comunicar a los afectados, si la brecha entraña alto riesgo (art. 34 RGPD).

El registro de la brecha en la tabla `data_breaches` es **obligatorio** incluso si decides que no procede notificar a la AEPD.

---

## 7. Buenas prácticas adicionales

- Cierra sesión en el panel cuando termines.
- No accedas al panel desde redes Wi-Fi públicas sin VPN.
- Mantén el navegador y el sistema operativo actualizados.
- No instales extensiones de navegador de origen dudoso en el equipo desde el que administras.
- Si delegas el acceso al panel en alguien (asesoría, colaborador): que cada persona tenga **su propia cuenta** con 2FA activado. **Nunca compartas tu cuenta personal.**
- Revisa periódicamente los logs de Supabase y Vercel para detectar accesos anómalos.
