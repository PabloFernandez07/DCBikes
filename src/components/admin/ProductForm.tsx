import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import type { Category, Product } from '@/lib/database.types'

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export interface ProductFormValues {
  name: string
  slug: string
  category_id: string
  sku: string
  brand: string
  short_description: string
  description: string
  cost_price: string
  retail_price: string
  discount_percent: string
  stock: string
  featured: boolean
  active: boolean
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
    formState: { errors },
  } = useForm<ProductFormValues>({
    defaultValues: {
      name: product?.name ?? '',
      slug: product?.slug ?? '',
      category_id: product?.category_id ?? '',
      sku: product?.sku ?? '',
      brand: product?.brand ?? '',
      short_description: product?.short_description ?? '',
      description: product?.description ?? '',
      cost_price: product?.cost_price != null ? String(product.cost_price) : '',
      retail_price: product?.retail_price != null ? String(product.retail_price) : '',
      discount_percent: product?.discount_percent != null ? String(product.discount_percent) : '',
      stock: String(product?.stock ?? 0),
      featured: product?.featured ?? false,
      active: product?.active ?? true,
    },
  })

  useEffect(() => {
    supabase
      .from('categories')
      .select('*')
      .order('sort_order')
      .then(({ data }) => setCategories(data ?? []))
  }, [])

  const nameValue = watch('name')
  useEffect(() => {
    if (!product) {
      setValue('slug', slugify(nameValue))
    }
  }, [nameValue, product, setValue])

  const validate = (values: ProductFormValues): Record<string, string> => {
    const errs: Record<string, string> = {}
    if (!values.name.trim()) errs.name = 'El nombre es obligatorio'
    if (!values.slug.trim()) errs.slug = 'El slug es obligatorio'
    if (!values.category_id) errs.category_id = 'Selecciona una categoría'
    if (!values.retail_price || isNaN(Number(values.retail_price))) errs.retail_price = 'PVP requerido'
    return errs
  }

  const onSubmit = async (values: ProductFormValues) => {
    const errs = validate(values)
    if (Object.keys(errs).length > 0) return
    await onSave(values)
  }

  const featured = watch('featured')
  const active = watch('active')

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field
            label="Nombre"
            required
            error={errors.name?.message}
            {...register('name', { required: 'El nombre es obligatorio' })}
          />
        </div>

        <Field
          label="Slug"
          required
          error={errors.slug?.message}
          {...register('slug', { required: 'El slug es obligatorio' })}
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
            {...register('category_id', { required: 'Selecciona una categoría' })}
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

        <Field label="SKU" {...register('sku')} />
        <Field label="Marca" {...register('brand')} />

        <div className="sm:col-span-2">
          <Field
            label="Descripción corta"
            as="textarea"
            rows={2}
            {...register('short_description', {
              maxLength: { value: 160, message: 'Máximo 160 caracteres' },
            })}
            error={errors.short_description?.message}
          />
        </div>

        <div className="sm:col-span-2">
          <Field
            label="Descripción completa"
            as="textarea"
            rows={4}
            {...register('description')}
          />
        </div>

        <Field
          label="Precio coste (€)"
          type="number"
          step="0.01"
          min="0"
          {...register('cost_price')}
        />

        <Field
          label="PVP (€)"
          required
          type="number"
          step="0.01"
          min="0"
          error={errors.retail_price?.message}
          {...register('retail_price', { required: 'PVP requerido' })}
        />

        <Field
          label="Descuento (%)"
          type="number"
          min="0"
          max="100"
          step="1"
          placeholder="Sin descuento"
          {...register('discount_percent', {
            min: { value: 0, message: 'Mínimo 0' },
            max: { value: 100, message: 'Máximo 100' },
          })}
          error={errors.discount_percent?.message}
        />

        <Field
          label="Stock"
          type="number"
          min="0"
          step="1"
          {...register('stock')}
        />
      </div>

      <div className="flex items-center gap-6 pt-1">
        <ToggleField
          label="Destacado"
          checked={featured}
          onChange={v => setValue('featured', v)}
        />
        <ToggleField
          label="Activo"
          checked={active}
          onChange={v => setValue('active', v)}
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--color-card)]">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={loading}>
          {product ? 'Actualizar producto' : 'Crear producto'}
        </Button>
      </div>
    </form>
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
