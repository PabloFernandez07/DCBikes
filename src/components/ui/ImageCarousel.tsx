import { useState, useRef } from 'react'
import { ChevronLeft, ChevronRight, Bike } from 'lucide-react'
import { clsx } from 'clsx'

interface CarouselImage {
  url: string
  alt: string
}

interface ImageCarouselProps {
  images: CarouselImage[]
}

export function ImageCarousel({ images }: ImageCarouselProps) {
  const [current, setCurrent] = useState(0)
  const touchStartX = useRef<number | null>(null)

  const prev = () => setCurrent(i => (i - 1 + images.length) % images.length)
  const next = () => setCurrent(i => (i + 1) % images.length)

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const delta = e.changedTouches[0].clientX - touchStartX.current
    if (delta > 50) prev()
    else if (delta < -50) next()
    touchStartX.current = null
  }

  if (images.length === 0) {
    return (
      <div className="w-full aspect-square bg-[var(--color-card)] rounded-2xl flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[var(--color-mid)]">
          <Bike size={64} strokeWidth={1} aria-hidden="true" />
          <span className="font-[var(--font-cond)] text-sm tracking-widest uppercase">Sin imagen</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative w-full aspect-square bg-[var(--color-card)] rounded-2xl overflow-hidden select-none"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <img
          src={images[current].url}
          alt={images[current].alt}
          className="w-full h-full object-contain p-4 transition-opacity duration-300"
          key={current}
        />

        {images.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 transition-colors"
              aria-label="Imagen anterior"
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <button
              onClick={next}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 transition-colors"
              aria-label="Imagen siguiente"
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>

            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrent(i)}
                  className={clsx(
                    'w-1.5 h-1.5 rounded-full transition-all duration-200',
                    i === current
                      ? 'bg-[var(--color-lavender)] w-4'
                      : 'bg-white/40 hover:bg-white/70',
                  )}
                  aria-label={`Ir a imagen ${i + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={clsx(
                'shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all duration-200',
                i === current
                  ? 'border-[var(--color-lavender)]'
                  : 'border-transparent opacity-50 hover:opacity-80',
              )}
              aria-label={`Miniatura ${i + 1}`}
            >
              <img src={img.url} alt={img.alt} className="w-full h-full object-contain bg-[var(--color-card)] p-1" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
