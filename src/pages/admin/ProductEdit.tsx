import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Bell } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ProductForm } from '@/components/admin/ProductForm'
import { ImageUploader } from '@/components/admin/ImageUploader'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import type { Product, ProductImage, Database } from '@/lib/database.types'
import type { ProductFormValues } from '@/components/admin/ProductForm'
import { normalizeDecimalEs } from '@/schemas/product'

type ProductInsert = Database['public']['Tables']['products']['Insert']

export function ProductEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toasts, toast, dismiss } = useToast()

  const isNew = id === 'nuevo'

  const [product, setProduct] = useState<Product | undefined>(undefined)
  const [images, setImages] = useState<ProductImage[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  // After creating a new product, store the new id here so ImageUploader can use it
  const [createdId, setCreatedId] = useState<string | null>(null)

  // Stock alerts: número de suscriptores pendientes y estado de envío
  const [alertCount, setAlertCount] = useState<number | null>(null)
  const [notifying, setNotifying] = useState(false)

  useEffect(() => {
    if (isNew) return
    if (!id) return

    setLoading(true)
    const productQuery = supabase.from('products').select('*').eq('id', id).single()
    const imagesQuery = supabase.from('product_images').select('*').eq('product_id', id).order('sort_order')

    Promise.all([productQuery, imagesQuery]).then(([productRes, imagesRes]) => {
      const pData = (productRes as { data: Product | null }).data
      const iData = (imagesRes as { data: ProductImage[] | null }).data
      if (pData) setProduct(pData)
      if (iData) setImages(iData)
      setLoading(false)
    })
  }, [id, isNew])

  // Carga el número de suscripciones de aviso pendientes para este producto
  useEffect(() => {
    const productId = isNew ? createdId : id
    if (!productId) {
      setAlertCount(null)
      return
    }

    // La tabla stock_alerts no está en database.types aún → cast explícito
    type StockAlertsTable = {
      from: (table: 'stock_alerts') => {
        select: (cols: string, opts: { count: 'exact'; head: boolean }) => {
          eq: (col: string, val: string) => {
            is: (col: string, val: null) => {
              is: (col: string, val: null) => Promise<{ count: number | null; error: unknown }>
            }
          }
        }
      }
    }
    const db = supabase as unknown as StockAlertsTable

    db
      .from('stock_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', productId)
      .is('notified_at', null)
      .is('revoked_at', null)
      .then(({ count }) => {
        setAlertCount(count ?? 0)
      })
  }, [isNew, createdId, id])

  const handleNotifySubscribers = useCallback(async () => {
    const productId = isNew ? createdId : id
    if (!productId) return

    setNotifying(true)
    try {
      const { data, error } = await supabase.functions.invoke('admin-notify-stock', {
        body: { product_id: productId },
      })
      if (error) {
        toast.error('Error al enviar avisos: ' + (error.message ?? String(error)))
      } else {
        const result = data as { ok?: boolean; sent?: number } | null
        const sent = result?.sent ?? 0
        toast.success(`Avisado a ${sent} interesado${sent !== 1 ? 's' : ''}`)
        setAlertCount(0)
      }
    } catch (err) {
      toast.error('Error inesperado al enviar avisos')
    } finally {
      setNotifying(false)
    }
  }, [isNew, createdId, id, toast])

  const handleSave = async (values: ProductFormValues) => {
    setSaving(true)

    const payload: ProductInsert = {
      name: values.name,
      slug: values.slug,
      category_id: values.category_id,
      sku: values.sku || null,
      ean: values.ean || null,
      brand: values.brand || null,
      short_description: values.short_description || null,
      description: values.description || null,
      // normalizeDecimalEs: el schema acepta coma decimal ("12,50"), la
      // conversión a número debe aceptarla igual o guardaríamos NaN.
      retail_price: Number(normalizeDecimalEs(values.retail_price)),
      discount_percent: values.discount_percent ? Number(normalizeDecimalEs(values.discount_percent)) : null,
      featured: values.featured,
      active: values.active,
      is_purchasable: values.is_purchasable,
      size_label: values.size_label?.trim() ? values.size_label.trim() : null,
      model_group: values.model_group?.trim() ? values.model_group.trim() : null,
      color: values.color?.trim() ? values.color.trim() : null,
      flavor: values.flavor?.trim() ? values.flavor.trim() : null,
      weight_grams: values.weight_grams ? Number(values.weight_grams) : null,
    }

    // Stock: solo se incluye si el admin lo modificó respecto al valor que se
    // cargó en el form. Si se enviara siempre, una venta concurrente entre la
    // carga y el guardado se perdería (lost update, BUG-M6).
    const stockNum = Number(values.stock)
    if (isNew || !product || stockNum !== product.stock) {
      payload.stock = stockNum
    }

    // Cast builder to bypass TypeScript 6 strict generic inference with Supabase typed client
    type Builder = {
      insert: (v: ProductInsert) => { select: () => { single: () => Promise<{ data: Product | null; error: { message: string } | null }> } }
      update: (v: ProductInsert) => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> }
    }
    const builder = supabase.from('products') as unknown as Builder

    if (isNew) {
      const insertResult = await builder.insert(payload).select().single()
      setSaving(false)
      if (insertResult.error) {
        toast.error('Error al crear el producto: ' + insertResult.error.message)
      } else if (insertResult.data) {
        setCreatedId(insertResult.data.id)
        setProduct(insertResult.data)
        toast.success('Producto creado. Ahora puedes subir imágenes.')
      }
    } else if (id) {
      const updateResult = await builder.update(payload).eq('id', id)
      setSaving(false)
      if (updateResult.error) {
        toast.error('Error al actualizar: ' + updateResult.error.message)
      } else {
        // Refresca la referencia local para que el dirty-check de stock use
        // el valor recién guardado como nueva línea base.
        setProduct(prev => (prev ? { ...prev, ...payload } as Product : prev))
        toast.success('Producto actualizado')
      }
    }
  }

  const uploaderProductId = isNew ? (createdId ?? '') : (id ?? '')
  const uploaderProductName = product?.name ?? ''

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/admin/productos')}
            className="flex items-center gap-2 text-sm font-[var(--font-cond)] text-[var(--color-mid)] hover:text-[var(--color-cream)] transition-colors tracking-wide"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Volver a productos
          </button>
        </div>

        <div>
          <h1 className="text-2xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest">
            {isNew ? 'NUEVO PRODUCTO' : product ? `EDITAR: ${product.name.toUpperCase()}` : 'CARGANDO...'}
          </h1>
          <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
            {isNew ? 'Crea un nuevo producto en el catálogo' : 'Modifica los datos e imágenes del producto'}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-[var(--color-lavender)] border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left: Product Form */}
            <div className="lg:col-span-3 bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6">
              <h2 className="text-base font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide mb-5">
                Datos del producto
              </h2>
              <ProductForm
                product={product}
                onSave={handleSave}
                onCancel={() => navigate('/admin/productos')}
                loading={saving}
              />
            </div>

            {/* Right: Image Uploader + Stock alerts */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              <div className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6">
                <h2 className="text-base font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide mb-5">
                  Imágenes
                </h2>
                {isNew && !createdId ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
                    <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)]">
                      Guarda el producto primero para poder subir imágenes.
                    </p>
                  </div>
                ) : (
                  <ImageUploader
                    productId={uploaderProductId}
                    productName={uploaderProductName}
                    existingImages={images}
                  />
                )}
              </div>

              {/* Avisos de stock */}
              {!isNew && id && (
                <div className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6 flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <Bell size={16} className="text-[var(--color-lavender)]" aria-hidden="true" />
                    <h2 className="text-base font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
                      Avisos de stock
                    </h2>
                  </div>
                  <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)] leading-relaxed">
                    {alertCount === null
                      ? 'Cargando suscriptores...'
                      : alertCount === 0
                      ? 'No hay interesados pendientes de avisar.'
                      : `${alertCount} persona${alertCount !== 1 ? 's' : ''} esperando disponibilidad.`}
                  </p>
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={handleNotifySubscribers}
                    loading={notifying}
                    disabled={notifying || alertCount === null || alertCount === 0}
                    className="w-full"
                  >
                    <Bell size={16} aria-hidden="true" />
                    Avisar a interesados
                    {alertCount !== null && alertCount > 0 ? ` (${alertCount})` : ''}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </>
  )
}
