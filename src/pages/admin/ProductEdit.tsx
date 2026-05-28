import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ProductForm } from '@/components/admin/ProductForm'
import { ImageUploader } from '@/components/admin/ImageUploader'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'
import type { Product, ProductImage, Database } from '@/lib/database.types'
import type { ProductFormValues } from '@/components/admin/ProductForm'

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
      retail_price: Number(values.retail_price),
      discount_percent: values.discount_percent ? Number(values.discount_percent) : null,
      stock: Number(values.stock),
      featured: values.featured,
      active: values.active,
      is_purchasable: values.is_purchasable,
      size_label: values.size_label?.trim() ? values.size_label.trim() : null,
      model_group: values.model_group?.trim() ? values.model_group.trim() : null,
      weight_grams: values.weight_grams ? Number(values.weight_grams) : null,
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

            {/* Right: Image Uploader */}
            <div className="lg:col-span-2 bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6">
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
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </>
  )
}
