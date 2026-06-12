import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Product, ProductImage } from '@/lib/database.types'

const LETTER_SIZE_ORDER: Record<string, number> = {
  XXS: 0,
  XS: 1,
  S: 2,
  M: 3,
  L: 4,
  XL: 5,
  XXL: 6,
  XXXL: 7,
}

/**
 * Ordena tallas con la siguiente estrategia:
 * 1. Letras conocidas (XXS < XS < S < M < L < XL < XXL < XXXL) primero
 * 2. Números (calzado) ascendente después
 * 3. Otras tallas alfabéticamente al final
 */
export function sortVariantsBySize(variants: Product[]): Product[] {
  const letterVariants: Product[] = []
  const numericVariants: Product[] = []
  const otherVariants: Product[] = []
  const noSizeVariants: Product[] = []

  for (const v of variants) {
    const size = v.size_label?.trim().toUpperCase()
    if (!size) {
      noSizeVariants.push(v)
    } else if (size in LETTER_SIZE_ORDER) {
      letterVariants.push(v)
    } else if (/^\d+(\.\d+)?$/.test(size)) {
      numericVariants.push(v)
    } else {
      otherVariants.push(v)
    }
  }

  letterVariants.sort(
    (a, b) =>
      LETTER_SIZE_ORDER[(a.size_label ?? '').toUpperCase()] -
      LETTER_SIZE_ORDER[(b.size_label ?? '').toUpperCase()],
  )
  numericVariants.sort(
    (a, b) => parseFloat(a.size_label ?? '0') - parseFloat(b.size_label ?? '0'),
  )
  otherVariants.sort((a, b) =>
    (a.size_label ?? '').localeCompare(b.size_label ?? '', 'es'),
  )

  return [...letterVariants, ...numericVariants, ...otherVariants, ...noSizeVariants]
}

/** Categoría mínima embebida en la query del grupo (PERF-M3). */
export interface ProductGroupCategory {
  name: string
  slug: string
}

/**
 * PERF-M3: embeds de PostgREST — las imágenes y la categoría viajan EN la
 * misma query de productos en vez de en round-trips separados. Pasamos de
 * ~4 viajes secuenciales (producto → variantes → imágenes → categoría) a
 * 1-2 (producto suelto / grupo de variantes).
 */
const GROUP_SELECT = '*, product_images(*), categories(name,slug)'

/** Fila de `products` con los embeds de GROUP_SELECT. */
type ProductRowWithEmbeds = Product & {
  product_images: ProductImage[] | null
  categories: ProductGroupCategory | null
}

export interface UseProductGroupResult {
  parentProduct: Product | null
  variants: Product[]
  selectedVariant: Product | null
  setSelectedVariant: (variant: Product) => void
  loading: boolean
  error: string | null
  /** Imágenes de TODAS las variantes del grupo, ordenadas por sort_order. */
  images: ProductImage[]
  /** Categoría del grupo (embebida en la query de variantes). */
  category: ProductGroupCategory | null
}

/**
 * Dado un slug de producto, devuelve el grupo completo de variantes.
 *
 * - Si el producto tiene `model_group` no nulo, fetch todas las variantes con
 *   el mismo `model_group` (incluido el propio).
 * - Si `model_group` es null, devuelve un grupo de una sola variante.
 * - `selectedVariant` por defecto = primera variante con stock > 0, o la
 *   primera si todas están sin stock.
 * - Las imágenes y la categoría vienen embebidas en las mismas queries
 *   (PERF-M3), sin round-trips extra.
 */
export function useProductGroup(slug: string | undefined): UseProductGroupResult {
  const [parentProduct, setParentProduct] = useState<Product | null>(null)
  const [rawVariants, setRawVariants] = useState<Product[]>([])
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [images, setImages] = useState<ProductImage[]>([])
  const [category, setCategory] = useState<ProductGroupCategory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) {
      setParentProduct(null)
      setRawVariants([])
      setSelectedVariantId(null)
      setImages([])
      setCategory(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        // 1. Fetch producto base por slug, con imágenes + categoría embebidas
        const { data: baseData, error: baseErr } = await supabase
          .from('products')
          .select(GROUP_SELECT)
          .eq('slug', slug)
          .eq('active', true)
          .single()

        const baseRow = baseData as ProductRowWithEmbeds | null

        if (baseErr || !baseRow) {
          if (!cancelled) {
            setError(baseErr?.message ?? 'Producto no encontrado')
            setParentProduct(null)
            setRawVariants([])
            setSelectedVariantId(null)
            setImages([])
            setCategory(null)
            setLoading(false)
          }
          return
        }

        // 2. Si tiene model_group, fetch todas las variantes del grupo (con
        //    los mismos embeds, así no hay viaje extra por imágenes/categoría)
        let groupRows: ProductRowWithEmbeds[] = [baseRow]
        if (baseRow.model_group) {
          const { data: variantsData, error: vErr } = await supabase
            .from('products')
            .select(GROUP_SELECT)
            .eq('model_group', baseRow.model_group)
            .eq('active', true)

          if (vErr) {
            console.warn('[useProductGroup] error fetching variants', vErr)
          } else if (variantsData && variantsData.length > 0) {
            groupRows = variantsData as unknown as ProductRowWithEmbeds[]
          }
        }

        if (cancelled) return

        // Separamos los embeds del producto plano (el estado sigue siendo
        // Product[], igual que antes del cambio).
        const groupImages: ProductImage[] = []
        const categoryByProductId = new Map<string, ProductGroupCategory>()
        const plainProducts: Product[] = groupRows.map(row => {
          const { product_images, categories, ...product } = row
          if (product_images) groupImages.push(...product_images)
          if (categories) categoryByProductId.set(product.id, categories)
          return product as Product
        })
        groupImages.sort((a, b) => a.sort_order - b.sort_order)

        const sorted = sortVariantsBySize(plainProducts)
        // Parent product: el primero del grupo ordenado (lo usamos para imagen
        // / descripción / nombre limpio).
        const parent = sorted[0] ?? plainProducts[0]
        // Default selected = primera con stock, o si ninguna tiene, la primera.
        const defaultSelected =
          sorted.find(v => v.stock > 0) ?? sorted[0] ?? plainProducts[0]
        // Categoría: la del padre; fallback a la primera no nula del grupo.
        const parentCategory =
          categoryByProductId.get(parent.id) ??
          categoryByProductId.values().next().value ??
          null

        setParentProduct(parent)
        setRawVariants(sorted)
        setSelectedVariantId(defaultSelected.id)
        setImages(groupImages)
        setCategory(parentCategory)
        setLoading(false)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Error cargando producto')
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [slug])

  const selectedVariant = useMemo(
    () => rawVariants.find(v => v.id === selectedVariantId) ?? null,
    [rawVariants, selectedVariantId],
  )

  return {
    parentProduct,
    variants: rawVariants,
    selectedVariant,
    setSelectedVariant: variant => setSelectedVariantId(variant.id),
    loading,
    error,
    images,
    category,
  }
}
