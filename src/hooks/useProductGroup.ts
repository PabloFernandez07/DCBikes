import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Product } from '@/lib/database.types'

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

export interface UseProductGroupResult {
  parentProduct: Product | null
  variants: Product[]
  selectedVariant: Product | null
  setSelectedVariant: (variant: Product) => void
  loading: boolean
  error: string | null
}

/**
 * Dado un slug de producto, devuelve el grupo completo de variantes.
 *
 * - Si el producto tiene `model_group` no nulo, fetch todas las variantes con
 *   el mismo `model_group` (incluido el propio).
 * - Si `model_group` es null, devuelve un grupo de una sola variante.
 * - `selectedVariant` por defecto = primera variante con stock > 0, o la
 *   primera si todas están sin stock.
 */
export function useProductGroup(slug: string | undefined): UseProductGroupResult {
  const [parentProduct, setParentProduct] = useState<Product | null>(null)
  const [rawVariants, setRawVariants] = useState<Product[]>([])
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) {
      setParentProduct(null)
      setRawVariants([])
      setSelectedVariantId(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        // 1. Fetch producto base por slug
        const { data: baseProduct, error: baseErr } = await supabase
          .from('products')
          .select('*')
          .eq('slug', slug)
          .eq('active', true)
          .single()

        if (baseErr || !baseProduct) {
          if (!cancelled) {
            setError(baseErr?.message ?? 'Producto no encontrado')
            setParentProduct(null)
            setRawVariants([])
            setSelectedVariantId(null)
            setLoading(false)
          }
          return
        }

        // 2. Si tiene model_group, fetch todas las variantes del grupo
        let groupVariants: Product[] = [baseProduct]
        if (baseProduct.model_group) {
          const { data: variantsData, error: vErr } = await supabase
            .from('products')
            .select('*')
            .eq('model_group', baseProduct.model_group)
            .eq('active', true)

          if (vErr) {
            console.warn('[useProductGroup] error fetching variants', vErr)
          } else if (variantsData && variantsData.length > 0) {
            groupVariants = variantsData
          }
        }

        if (cancelled) return

        const sorted = sortVariantsBySize(groupVariants)
        // Parent product: el primero del grupo ordenado (lo usamos para imagen
        // / descripción / nombre limpio).
        const parent = sorted[0] ?? baseProduct
        // Default selected = primera con stock, o si ninguna tiene, la primera.
        const defaultSelected =
          sorted.find(v => v.stock > 0) ?? sorted[0] ?? baseProduct

        setParentProduct(parent)
        setRawVariants(sorted)
        setSelectedVariantId(defaultSelected.id)
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
  }
}
