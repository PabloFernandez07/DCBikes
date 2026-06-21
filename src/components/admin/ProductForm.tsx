import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import type { Category, Product } from '@/lib/database.types'
import { productFormSchema, type ProductFormValues } from '@/schemas/product'

// Re-export para que importadores existentes sigan funcionando.
export type { ProductFormValues } from '@/schemas/product'

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

interface ProductFormProps {
  product?: Product
  onSave: (values: ProductFormValues) => Promise<void>
  onCancel: () => void
  loading?: boolean
}

export function ProductForm({ product, onSave, onCancel, loading }: ProductFormProps) {
  const [categories, setCategories] = useState<Category[]>([])

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    // zod v4 resolver — `as any` no es necesario en runtime; el tipo se infiere bien
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: product?.name ?? '',
      slug: product?.slug ?? '',
      category_id: product?.category_id ?? '',
      sku: product?.sku ?? '',
      ean: product?.ean ?? '',
      brand: product?.brand ?? '',
      short_description: product?.short_description ?? '',
      description: product?.description ?? '',
      retail_price: product?.retail_price != null ? String(product.retail_price) : '',
      discount_percent:
        product?.discount_percent != null ? String(product.discount_percent) : '',
      stock: String(product?.stock ?? 0),
      featured: product?.featured ?? false,
      active: product?.active ?? true,
      is_purchasable: product?.is_purchasable ?? false,
      // is_returnable no está aún en database.types.ts (cast mínimo); null = hereda categoría.
      is_returnable: (product as { is_returnable?: boolean | null } | undefined)?.is_returnable ?? null,
      size_label: product?.size_label ?? '',
      model_group: product?.model_group ?? '',
      color: product?.color ?? '',
      flavor: product?.flavor ?? '',
      weight_grams:
        product?.weight_grams != null ? String(product.weight_grams) : '',
    },
  })

  useEffect(() => {
    supabase
      .from('categories')
      .select('*')
      .order('sort_order')
      .then(({ data }) => setCategories(data ?? []))
  }, [])

  // Sincroniza el <select> con la categoría del producto cuando ambas cargan.
  useEffect(() => {
    if (product?.category_id && categories.length > 0) {
      setValue('category_id', product.category_id)
    }
  }, [categories, product, setValue])

  const nameValue = watch('name')
  useEffect(() => {
    if (!product) {
      setValue('slug', slugify(nameValue))
    }
  }, [nameValue, product, setValue])

  const featured = watch('featured')
  const active = watch('active')
  const isPurchasable = watch('is_purchasable')
  const isReturnable = watch('is_returnable')
  // tri-estado <select> ↔ boolean|null: 'inherit'=null, 'yes'=true, 'no'=false.
  const returnableMode = isReturnable === true ? 'yes' : isReturnable === false ? 'no' : 'inherit'

  const onSubmit = async (values: ProductFormValues) => {
    await onSave(values)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* ─── Datos básicos ─────────────────────────────────────────── */}
      <Section title="Datos básicos">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              label="Nombre"
              required
              error={errors.name?.message}
              {...register('name')}
            />
          </div>

          <Field
            label="Slug"
            required
            error={errors.slug?.message}
            {...register('slug')}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-[var(--font-cond)] font-medium text-[var(--color-cream-dim)] tracking-wide">
              Categoría <span className="text-[var(--color-brand-red)]">*</span>
            </label>
            <select
              className={clsx(
                'w-full bg-[var(--color-ink)] border rounded-lg px-4 py-2.5 text-[var(--color-cream)]',
                'font-[var(--font-body)] text-sm transition-colors duration-200',
                'focus:outline-none focus:ring-2 focus:ring-[var(--color-lavender)]/50 focus:border-[var(--color-lavender)]',
                errors.category_id
                  ? 'border-[var(--color-brand-red)]'
                  : 'border-[var(--color-card)] hover:border-[var(--color-mid)]/60',
              )}
              {...register('category_id')}
            >
              <option value="">Selecciona categoría...</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.category_id && (
              <p className="text-xs text-[var(--color-brand-red)]">{errors.category_id.message}</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <Field
              label="Descripción corta"
              as="textarea"
              rows={2}
              helpText="Máximo 160 caracteres. Se muestra bajo el nombre en el catálogo."
              {...register('short_description')}
              error={errors.short_description?.message}
            />
          </div>

          <div className="sm:col-span-2">
            <Field
              label="Descripción completa"
              as="textarea"
              rows={4}
              {...register('description')}
              error={errors.description?.message}
            />
          </div>
        </div>
      </Section>

      {/* ─── Identificación ─────────────────────────────────────────── */}
      <Section title="Identificación">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Referencia (SKU)"
            helpText="Código interno único (ej. GIA-TCR-23-M). Opcional, pero recomendado para importar desde Excel."
            error={errors.sku?.message}
            {...register('sku')}
          />
          <Field
            label="EAN (código de barras)"
            helpText="13 dígitos. Vacío si no se conoce."
            placeholder="0000000000000"
            inputMode="numeric"
            maxLength={13}
            error={errors.ean?.message}
            {...register('ean')}
          />
          <Field
            label="Marca"
            error={errors.brand?.message}
            {...register('brand')}
          />
        </div>
      </Section>

      {/* ─── Precio y stock ─────────────────────────────────────────── */}
      <Section title="Precio y stock">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field
            label="PVP (€)"
            required
            type="number"
            step="0.01"
            min="0"
            error={errors.retail_price?.message}
            {...register('retail_price')}
          />

          <Field
            label="Descuento (%)"
            type="number"
            min="0"
            max="100"
            step="1"
            placeholder="Sin descuento"
            error={errors.discount_percent?.message}
            {...register('discount_percent')}
          />

          <Field
            label="Stock"
            required
            type="number"
            min="0"
            step="1"
            error={errors.stock?.message}
            {...register('stock')}
          />
        </div>
      </Section>

      {/* ─── Variantes y agrupación ─────────────────────────────────── */}
      <Section
        title="Variantes y agrupación"
        subtitle="Permite agrupar varias tallas del mismo modelo en una sola tarjeta del catálogo público."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field
            label="Talla"
            helpText="Ej. S, M, L, 38, 42. Vacío si producto sin tallas."
            error={errors.size_label?.message}
            {...register('size_label')}
          />
          <Field
            label="Grupo modelo"
            helpText="Identificador para agrupar todas las tallas/colores del mismo modelo en el catálogo público. Ej. `maillot-alde-thermo`. Vacío si producto individual."
            error={errors.model_group?.message}
            {...register('model_group')}
          />
          <Field
            label="Color"
            helpText="Ej. Rojo, Negro, Blanco. Crea el selector de color en la ficha cuando el grupo tiene varios. Vacío si no aplica."
            error={errors.color?.message}
            {...register('color')}
          />
          <Field
            label="Sabor"
            helpText="Ej. Cola, Fresa, Limón. Crea el selector de sabor en la ficha (nutrición) cuando el grupo tiene varios. Vacío si no aplica."
            error={errors.flavor?.message}
            {...register('flavor')}
          />
          <Field
            label="Peso (gramos)"
            type="number"
            min="0"
            step="1"
            helpText="Informativo. No afecta al cálculo de envío (tarifa plana)."
            error={errors.weight_grams?.message}
            {...register('weight_grams')}
          />
        </div>
      </Section>

      {/* ─── Estado ─────────────────────────────────────────────────── */}
      <Section title="Estado">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <ToggleField
              label="Destacado"
              checked={featured}
              onChange={v => setValue('featured', v, { shouldDirty: true })}
            />
            <ToggleField
              label="Activo"
              checked={active}
              onChange={v => setValue('active', v, { shouldDirty: true })}
            />
          </div>
          <div className="border-t border-[var(--color-card)] pt-4">
            <ToggleField
              label="Comprar online"
              checked={isPurchasable}
              onChange={v => setValue('is_purchasable', v, { shouldDirty: true })}
            />
            <p className="mt-1.5 ml-12 text-xs text-[var(--color-mid)] font-[var(--font-body)] leading-relaxed max-w-md">
              Si está activo, los clientes pueden comprarlo desde la web. Si no, solo aparece como consulta para tienda física.
            </p>
          </div>
          <div className="border-t border-[var(--color-card)] pt-4">
            <label className="block text-sm font-[var(--font-cond)] tracking-wide text-[var(--color-cream)] mb-1.5">
              Admite devolución
            </label>
            <select
              value={returnableMode}
              onChange={e => {
                const v = e.target.value
                setValue('is_returnable', v === 'yes' ? true : v === 'no' ? false : null, { shouldDirty: true })
              }}
              className="w-full max-w-xs text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-ink)] px-3 py-2 rounded-lg border border-[var(--color-card)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors"
            >
              <option value="inherit">Según la categoría (por defecto)</option>
              <option value="yes">Sí, este producto se puede devolver</option>
              <option value="no">No, este producto no se puede devolver</option>
            </select>
            <p className="mt-1.5 text-xs text-[var(--color-mid)] font-[var(--font-body)] leading-relaxed max-w-md">
              "Según la categoría" usa el ajuste de devoluciones de la categoría. Elige Sí/No para forzar este producto concreto, sin importar su categoría.
            </p>
          </div>
        </div>
      </Section>

      {/* ─── Acciones ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-card)]">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={loading || isSubmitting}>
          {product ? 'Actualizar producto' : 'Crear producto'}
        </Button>
      </div>
    </form>
  )
}

// ─── Helpers UI ────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-xs font-[var(--font-cond)] font-semibold uppercase tracking-[0.15em] text-[var(--color-lavender)]">
          {title}
        </h3>
        {subtitle && (
          <p className="mt-1 text-xs text-[var(--color-mid)] font-[var(--font-body)] leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </section>
  )
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200',
          checked ? 'bg-[var(--color-lavender)]' : 'bg-[var(--color-card)]',
        )}
      >
        <span
          className={clsx(
            'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200',
            checked ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </button>
      <span className="text-sm font-[var(--font-cond)] text-[var(--color-cream-dim)] tracking-wide">
        {label}
      </span>
    </label>
  )
}
