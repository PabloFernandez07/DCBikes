import { useState, useRef, useCallback } from 'react'
import { clsx } from 'clsx'
import { Upload, X, ArrowUp, ArrowDown, Image } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { ProductImage } from '@/lib/database.types'

interface UploaderImage {
  id: string
  preview: string
  file?: File
  storagePath?: string
  alt: string
  uploading: boolean
  progress: number
  error?: string
}

interface ImageUploaderProps {
  productId: string
  productName: string
  existingImages?: ProductImage[]
  onImagesChange?: (images: ProductImage[]) => void
}

function toUploaderImage(img: ProductImage): UploaderImage {
  const { data } = supabase.storage.from('product-images').getPublicUrl(img.storage_path)
  return {
    id: img.id,
    preview: data.publicUrl,
    storagePath: img.storage_path,
    alt: img.alt ?? '',
    uploading: false,
    progress: 100,
  }
}

export function ImageUploader({
  productId,
  productName,
  existingImages = [],
}: ImageUploaderProps) {
  const [images, setImages] = useState<UploaderImage[]>(
    existingImages.map(toUploaderImage),
  )
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(
    async (files: File[]) => {
      const valid = files.filter(f => {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) return false
        if (f.size > 5 * 1024 * 1024) return false
        return true
      })

      const newImgs: UploaderImage[] = valid.map(f => ({
        id: crypto.randomUUID(),
        preview: URL.createObjectURL(f),
        file: f,
        alt: productName,
        uploading: true,
        progress: 0,
      }))

      setImages(prev => [...prev, ...newImgs])

      for (const img of newImgs) {
        if (!img.file) continue
        const ext = img.file.name.split('.').pop()
        const path = `${productId}/${img.id}.${ext}`

        setImages(prev =>
          prev.map(i => (i.id === img.id ? { ...i, progress: 30 } : i)),
        )

        const { error } = await supabase.storage
          .from('product-images')
          .upload(path, img.file, { upsert: true })

        if (error) {
          setImages(prev =>
            prev.map(i =>
              i.id === img.id ? { ...i, uploading: false, error: error.message } : i,
            ),
          )
          continue
        }

        setImages(prev =>
          prev.map(i => (i.id === img.id ? { ...i, progress: 80 } : i)),
        )

        const sortOrder = images.length + newImgs.indexOf(img)

        await supabase.from('product_images').insert({
          id: img.id,
          product_id: productId,
          storage_path: path,
          alt: productName,
          sort_order: sortOrder,
        })

        setImages(prev =>
          prev.map(i =>
            i.id === img.id
              ? { ...i, uploading: false, progress: 100, storagePath: path }
              : i,
          ),
        )
      }
    },
    [productId, productName, images.length],
  )

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(Array.from(e.dataTransfer.files))
  }

  const handleRemove = async (img: UploaderImage) => {
    if (img.storagePath) {
      await supabase.storage.from('product-images').remove([img.storagePath])
      await supabase.from('product_images').delete().eq('id', img.id)
    }
    URL.revokeObjectURL(img.preview)
    setImages(prev => prev.filter(i => i.id !== img.id))
  }

  const move = async (index: number, dir: -1 | 1) => {
    const next = [...images]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setImages(next)

    for (let i = 0; i < next.length; i++) {
      const img = next[i]
      if (img.storagePath) {
        await supabase
          .from('product_images')
          .update({ sort_order: i })
          .eq('id', img.id)
      }
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          'relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200',
          dragging
            ? 'border-[var(--color-lavender)] bg-[var(--color-lavender)]/10'
            : 'border-[var(--color-card)] hover:border-[var(--color-mid)]/60 hover:bg-[var(--color-card)]/30',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={e => handleFiles(Array.from(e.target.files ?? []))}
        />
        <Upload size={28} className="mx-auto mb-3 text-[var(--color-mid)]" aria-hidden="true" />
        <p className="text-sm font-[var(--font-cond)] text-[var(--color-cream-dim)] tracking-wide">
          Arrastra imágenes o haz clic para seleccionar
        </p>
        <p className="text-xs text-[var(--color-mid)] mt-1">JPG, PNG, WEBP · Máx. 5 MB por imagen</p>
      </div>

      {images.length > 0 && (
        <div className="space-y-2">
          {images.map((img, idx) => (
            <div
              key={img.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)]"
            >
              <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-[var(--color-ink)] flex items-center justify-center">
                {img.preview ? (
                  <img src={img.preview} alt={img.alt} className="w-full h-full object-cover" />
                ) : (
                  <Image size={20} className="text-[var(--color-mid)]" aria-hidden="true" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                {img.uploading ? (
                  <div className="space-y-1.5">
                    <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)]">Subiendo...</p>
                    <div className="h-1.5 w-full bg-[var(--color-ink)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--color-lavender)] rounded-full transition-all duration-300"
                        style={{ width: `${img.progress}%` }}
                      />
                    </div>
                  </div>
                ) : img.error ? (
                  <p className="text-xs text-[var(--color-brand-red)]">{img.error}</p>
                ) : (
                  <p className="text-xs text-[var(--color-cream-dim)] truncate font-[var(--font-body)]">
                    {img.storagePath ?? img.file?.name ?? 'Imagen'}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="p-1.5 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[var(--color-ink)] disabled:opacity-30 transition-colors"
                  aria-label="Mover arriba"
                >
                  <ArrowUp size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === images.length - 1}
                  className="p-1.5 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[var(--color-ink)] disabled:opacity-30 transition-colors"
                  aria-label="Mover abajo"
                >
                  <ArrowDown size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(img)}
                  className="p-1.5 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-brand-red)] hover:bg-[var(--color-brand-red)]/10 transition-colors"
                  aria-label="Eliminar imagen"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
