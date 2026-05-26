import { useEffect, useRef } from 'react'

/**
 * Datos de formulario que el backend (`order-place`) devuelve cuando
 * `payment.mode === 'redsys'`. Replican exactamente los campos que la
 * pasarela TPV Virtual de Redsys espera en un POST clásico.
 */
export interface RedsysFormData {
  action_url: string
  Ds_SignatureVersion: string
  Ds_MerchantParameters: string
  Ds_Signature: string
}

/**
 * Form invisible que se auto-submita al montar. Lo usamos como puente
 * desde la página `/pedido/redirigiendo` hacia el TPV Virtual de Redsys.
 *
 * No se renderiza ningún input visible: en el DOM solo existen los
 * hidden inputs que Redsys necesita. La UX la pone la página padre con
 * un spinner + texto.
 */
export function RedsysAutoSubmitForm({ formData }: { formData: RedsysFormData }) {
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    // Pequeño microdelay para asegurarnos de que el componente padre
    // haya pintado el spinner antes del navigate hacia Redsys (ayuda en
    // conexiones lentas para evitar la sensación de “pantalla en blanco”).
    const t = setTimeout(() => formRef.current?.submit(), 50)
    return () => clearTimeout(t)
  }, [])

  return (
    <form
      ref={formRef}
      method="POST"
      action={formData.action_url}
      // No queremos que el form se pueda interactuar; está oculto pero
      // disponible en el DOM para el submit programático.
      style={{ display: 'none' }}
      aria-hidden="true"
    >
      <input
        type="hidden"
        name="Ds_SignatureVersion"
        value={formData.Ds_SignatureVersion}
      />
      <input
        type="hidden"
        name="Ds_MerchantParameters"
        value={formData.Ds_MerchantParameters}
      />
      <input
        type="hidden"
        name="Ds_Signature"
        value={formData.Ds_Signature}
      />
    </form>
  )
}
