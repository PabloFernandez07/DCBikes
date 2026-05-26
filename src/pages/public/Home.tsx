import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Award,
  Wrench,
  Zap,
  ChevronRight,
  ChevronLeft,
  Star,
} from "lucide-react";
import { useGoogleReviews } from "@/hooks/useGoogleReviews";
import { SEO } from "@/components/layout/SEO";
import { useSchedule } from "@/hooks/useSchedule";
import { supabase } from "@/lib/supabase";
import { ProductCard } from "@/components/public/ProductCard";
import { QuoteModal } from "@/components/public/QuoteModal";
import { ScrollVideoHero } from "@/components/public/ScrollVideoHero";
import { Button } from "@/components/ui/Button";
import type { Product, ProductImage } from "@/lib/database.types";

const TICKER_WORDS = [
  { text: "BICICLETAS", accent: false },
  { text: "·", accent: true },
  { text: "TALLER", accent: false },
  { text: "·", accent: true },
  { text: "CANTABRIA", accent: false },
  { text: "·", accent: true },
  { text: "ACCESORIOS", accent: false },
  { text: "·", accent: true },
  { text: "EL ASTILLERO", accent: false },
  { text: "·", accent: true },
  { text: "REPARACIÓN", accent: false },
  { text: "·", accent: true },
];

function useCountUp(target: number, duration = 1800) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) setStarted(true);
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    let frame = 0;
    const totalFrames = Math.round(duration / 16);
    const timer = setInterval(() => {
      frame++;
      const progress = frame / totalFrames;
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (frame >= totalFrames) {
        setCount(target);
        clearInterval(timer);
      }
    }, 16);
    return () => clearInterval(timer);
  }, [started, target, duration]);

  return { count, ref };
}

function StatCounter({
  value,
  suffix = "",
  label,
}: {
  value: number;
  suffix?: string;
  label: string;
}) {
  const { count, ref } = useCountUp(value);
  return (
    <div ref={ref} className="flex flex-col items-center gap-1 text-center">
      <span className="font-[var(--font-display)] text-5xl lg:text-6xl text-[var(--color-lavender)] tracking-wide tabular-nums">
        {count}
        {suffix}
      </span>
      <span className="font-[var(--font-cond)] text-sm text-[var(--color-mid)] tracking-widest uppercase">
        {label}
      </span>
    </div>
  );
}

function useReveal(deps: unknown[] = []) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) =>
        entries.forEach(
          (e) => e.isIntersecting && e.target.classList.add("visible"),
        ),
      { threshold: 0.1 },
    );
    el.querySelectorAll(".rv").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, deps);
  return ref;
}

function ReviewCarousel({ reviews }: { reviews: import("@/hooks/useGoogleReviews").GoogleReview[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [isMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const PAGE_SIZE = isMobile ? 1 : 3;
  const totalPages = Math.ceil(reviews.length / PAGE_SIZE);

  function goToPage(p: number) {
    const track = trackRef.current;
    if (!track) return;
    const card = track.children[p * PAGE_SIZE] as HTMLElement | undefined;
    if (!card) return;
    track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: "smooth" });
    setPage(p);
  }

  function prev() { goToPage(Math.max(0, page - 1)); }
  function next() { goToPage(Math.min(totalPages - 1, page + 1)); }

  return (
    <div className="relative">
      {/* Track */}
      <div className="overflow-hidden">
      <div
        ref={trackRef}
        className="flex gap-5 scroll-smooth"
        style={{
          scrollSnapType: "x mandatory",
          overflowX: "auto",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        } as React.CSSProperties}
      >
        {reviews.map((review, i) => (
          <div
            key={i}
            className="group relative p-8 rounded-2xl bg-[var(--color-card)] border border-[var(--color-card-hover)] hover:border-[rgba(196,162,207,0.2)] transition-all duration-500 overflow-hidden flex flex-col flex-shrink-0"
            style={{
              width: isMobile ? "82%" : "calc(33.333% - 14px)",
              scrollSnapAlign: "start",
              minWidth: isMobile ? "260px" : "280px",
            }}
          >
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
              style={{ background: "radial-gradient(circle at 30% 30%, rgba(196,162,207,0.06), transparent 70%)" }}
            />
            <div className="relative flex flex-col flex-1">
              <div className="flex items-center gap-0.5 mb-5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    size={14}
                    fill={s <= review.rating ? "#FBBC05" : "transparent"}
                    stroke={s <= review.rating ? "none" : "#FBBC05"}
                    strokeWidth={1.5}
                  />
                ))}
              </div>
              <p className="text-[var(--color-mid)] text-sm leading-relaxed font-[var(--font-body)] flex-1 mb-6 line-clamp-5">
                "{review.text}"
              </p>
              <div className="flex items-center gap-3">
                {review.profile_photo_url ? (
                  <img
                    src={review.profile_photo_url}
                    alt={review.author_name}
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-full object-cover ring-1 ring-[rgba(196,162,207,0.2)]"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-[rgba(196,162,207,0.15)] flex items-center justify-center text-[var(--color-lavender)] font-[var(--font-display)] text-base">
                    {review.author_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-[var(--font-cond)] text-sm text-[var(--color-cream)] font-semibold tracking-wide leading-tight">
                    {review.author_name}
                  </p>
                  <p className="font-[var(--font-cond)] text-xs text-[var(--color-mid)] tracking-wide">
                    {review.relative_time_description}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      </div>

      {/* Controles */}
      <div className="flex items-center justify-between mt-8">
        {/* Dots — uno por página */}
        <div className="flex items-center gap-2">
          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={i}
              onClick={() => goToPage(i)}
              aria-label={`Página ${i + 1}`}
              className="transition-all duration-300 rounded-full"
              style={{
                width: i === page ? "24px" : "8px",
                height: "8px",
                background: i === page ? "var(--color-lavender)" : "rgba(196,162,207,0.25)",
              }}
            />
          ))}
        </div>

        {/* Flechas */}
        <div className="flex items-center gap-2">
          <button
            onClick={prev}
            disabled={page === 0}
            aria-label="Anterior"
            className="w-10 h-10 rounded-full border border-[var(--color-card-hover)] flex items-center justify-center text-[var(--color-mid)] hover:text-[var(--color-lavender)] hover:border-[rgba(196,162,207,0.4)] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={next}
            disabled={page === totalPages - 1}
            aria-label="Siguiente"
            className="w-10 h-10 rounded-full border border-[var(--color-card-hover)] flex items-center justify-center text-[var(--color-mid)] hover:text-[var(--color-lavender)] hover:border-[rgba(196,162,207,0.4)] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [featured, setFeatured] = useState<Product[]>([]);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const sectionRef = useReveal([featured]);
  const { data: reviewData, loading: reviewLoading, error: reviewError } = useGoogleReviews();

  useEffect(() => {
    supabase
      .from("products")
      .select("*")
      .eq("featured", true)
      .eq("active", true)
      .limit(4)
      .then(({ data }) => {
        if (data) setFeatured(data);
      });
  }, []);

  useEffect(() => {
    if (featured.length === 0) return;
    const ids = featured.map((p) => p.id);
    supabase
      .from("product_images")
      .select("*")
      .in("product_id", ids)
      .then(({ data }) => {
        if (data) setImages(data);
      });
  }, [featured]);

  const getProductImages = (productId: string) =>
    images
      .filter((img) => img.product_id === productId)
      .sort((a, b) => a.sort_order - b.sort_order);

  const placeholderProducts: Product[] = Array.from({ length: 4 }).map(
    (_, i) => ({
      id: `ph-${i}`,
      category_id: "",
      slug: "",
      name: [
        "Bicicleta de Montaña",
        "Bicicleta de Carretera",
        "Bicicleta Urbana",
        "Bicicleta Eléctrica",
      ][i],
      description: null,
      short_description: null,
      retail_price: [899, 1299, 599, 1899][i],
      discount_percent: [0, 15, 0, 10][i] || null,
      stock: 1,
      sku: null,
      brand: ["Giant", "Liv", "Stevens"][i],
      featured: true,
      active: true,
      created_at: "",
      updated_at: "",
      // Campos añadidos en migración 0002 (carrito + agrupación). Los placeholders
      // del Home no son productos reales, así que valores por defecto seguros.
      is_purchasable: false,
      size_label: null,
      model_group: null,
      weight_grams: null,
      ean: null,
    }),
  );

  const displayProducts = featured.length > 0 ? featured : placeholderProducts;

  const { schedule, isOpen: open, today } = useSchedule();

  return (
    <div ref={sectionRef}>
      <SEO />
      {/* ─── HERO scroll-video estilo Apple ─── */}
      <ScrollVideoHero onQuoteOpen={() => setQuoteOpen(true)} />

      {/* ─── TICKER ─── */}
      <section className="py-5 bg-[var(--color-brand-red)] overflow-hidden">
        <div className="flex">
          <div
            className="flex gap-10 items-center shrink-0 animate-[marq_18s_linear_infinite]"
            aria-hidden="true"
          >
            {[...TICKER_WORDS, ...TICKER_WORDS, ...TICKER_WORDS].map((w, i) => (
              <span
                key={i}
                className={`font-[var(--font-display)] text-lg tracking-widest whitespace-nowrap ${
                  w.accent ? "text-white/40" : "text-white"
                }`}
              >
                {w.text}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── STATS ─── */}
      <section className="py-20 bg-[var(--color-ink-deep)] border-b border-[var(--color-card)]">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-4 lg:divide-x divide-[var(--color-card)]">
            <StatCounter value={500} suffix="+" label="Bicis reparadas" />
            <StatCounter value={10} suffix="+" label="Años de experiencia" />
            <StatCounter value={3} label="Marcas premium" />
            <StatCounter value={24} suffix="h" label="Tiempo de respuesta" />
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section className="py-16 sm:py-28 relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse 50% 60% at 80% 50%, rgba(196,162,207,0.04) 0%, transparent 60%)",
          }}
        />
        <div className="w-full px-4 sm:px-6 lg:px-8 relative">
          <div className="rv mb-14 text-center">
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
              Por qué elegirnos
            </p>
            <h2 className="font-[var(--font-display)] text-4xl sm:text-5xl lg:text-6xl text-[var(--color-cream)] tracking-wide">
              LO QUE NOS MUEVE
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: <Award size={36} strokeWidth={1.2} />,
                title: "Calidad premium",
                text: "Seleccionamos las mejores marcas del mercado para ofrecerte bicicletas que duran una vida.",
                color: "rgba(196,162,207,0.12)",
              },
              {
                icon: <Wrench size={36} strokeWidth={1.2} />,
                title: "Taller experto",
                text: "Nuestros mecánicos realizan todo tipo de reparaciones, mantenimientos y personalizaciones.",
                color: "rgba(229,48,30,0.08)",
              },
              {
                icon: <Zap size={36} strokeWidth={1.2} />,
                title: "Asesoramiento real",
                text: "Te ayudamos a encontrar la bici perfecta según tu estilo, presupuesto y objetivos.",
                color: "rgba(196,162,207,0.1)",
              },
            ].map(({ icon, title, text, color }, i) => (
              <div
                key={title}
                className="rv group relative p-8 rounded-2xl bg-[var(--color-card)] border border-[var(--color-card-hover)] hover:border-[rgba(196,162,207,0.35)] transition-all duration-500 overflow-hidden cursor-default"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                {/* Hover glow */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{
                    background: `radial-gradient(circle at 30% 30%, ${color}, transparent 70%)`,
                  }}
                />
                <div className="relative">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center text-[var(--color-lavender)] mb-6 transition-transform duration-300 group-hover:scale-110"
                    style={{ background: color }}
                  >
                    {icon}
                  </div>
                  <h3 className="font-[var(--font-display)] text-3xl text-[var(--color-cream)] tracking-wide mb-3">
                    {title}
                  </h3>
                  <p className="text-[var(--color-mid)] text-sm leading-relaxed font-[var(--font-body)]">
                    {text}
                  </p>
                </div>
                {/* Bottom border accent */}
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[var(--color-lavender)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FEATURED PRODUCTS ─── */}
      <section className="py-24 bg-[var(--color-ink-deep)]">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-12">
            <div>
              <p className="rv font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
                Selección
              </p>
              <h2 className="rv font-[var(--font-display)] text-4xl sm:text-5xl lg:text-6xl text-[var(--color-cream)] tracking-wide">
                DESTACADOS
              </h2>
            </div>
            <Link
              to="/catalogo"
              className="rv hidden sm:flex items-center gap-2 font-[var(--font-cond)] text-sm text-[var(--color-mid)] hover:text-[var(--color-lavender)] transition-colors tracking-wide"
            >
              Ver todo el catálogo <ChevronRight size={16} />
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {displayProducts.map((product, i) => (
              <div
                key={product.id}
                className="rv"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <ProductCard
                  product={product}
                  images={getProductImages(product.id)}
                  onClick={() =>
                    product.slug
                      ? navigate(`/producto/${product.slug}`)
                      : undefined
                  }
                />
              </div>
            ))}
          </div>
          <div className="mt-12 flex justify-center">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => navigate("/catalogo")}
            >
              Ver catálogo completo <ArrowRight size={18} />
            </Button>
          </div>
        </div>
      </section>

      {/* ─── BRANDS ─── */}
      <section className="py-20 overflow-hidden border-y border-[var(--color-card)]">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv text-center mb-10">
            <p className="font-[var(--font-cond)] text-xs tracking-widest uppercase text-[var(--color-mid)] mb-3">
              Distribuidores oficiales
            </p>
            <h2 className="font-[var(--font-display)] text-4xl sm:text-5xl text-[var(--color-cream)] tracking-wide">
              MARCAS OFICIALES
            </h2>
          </div>
          <div className="rv grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
            {[
              { name: "GIANT", sub: "Bicicletas", color: "#E5301E" },
              { name: "LIV", sub: "Bicicletas", color: "#C4A2CF" },
              { name: "STEVENS", sub: "Bicicletas", color: "#EEF3F8" },
              { name: "SHIMANO", sub: "Componentes", color: "#E5301E" },
              { name: "SRAM", sub: "Componentes", color: "#C4A2CF" },
              { name: "ETXEONDO", sub: "Ropa ciclista", color: "#E5301E" },
            ].map(({ name, sub, color }, i) => (
              <div
                key={name}
                className="rv group flex flex-col items-center justify-center gap-2 p-6 rounded-2xl bg-[var(--color-card)] border border-[var(--color-card-hover)] hover:border-[rgba(196,162,207,0.3)] transition-all duration-300 cursor-default"
                style={{ transitionDelay: `${i * 60}ms` }}
              >
                <span
                  className="font-[var(--font-display)] text-3xl tracking-widest leading-none transition-colors duration-300"
                  style={{ color }}
                >
                  {name}
                </span>
                <span className="font-[var(--font-cond)] text-xs tracking-widest uppercase text-[var(--color-mid)] group-hover:text-[var(--color-cream)] transition-colors">
                  {sub}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex overflow-hidden">
          {/* <div
            className="flex gap-20 items-center shrink-0 animate-[marq_22s_linear_infinite]"
            aria-hidden="true"
          >
            {[
              "GIANT",
              "LIV",
              "STEVENS",
              "SHIMANO",
              "SRAM",
              "ETXEONDO",
              "GIANT",
              "LIV",
              "STEVENS",
              "SHIMANO",
              "SRAM",
              "ETXEONDO",
              "GIANT",
              "LIV",
              "STEVENS",
              "SHIMANO",
              "SRAM",
              "ETXEONDO",
            ].map((brand, i) => (
              <span
                key={i}
                className="font-[var(--font-display)] text-4xl tracking-widest text-[var(--color-mid)] hover:text-[var(--color-lavender)] transition-colors whitespace-nowrap cursor-default"
              >
                {brand}
              </span>
            ))}
          </div> */}
        </div>
      </section>

      {/* ─── HORARIOS ─── */}
      <section className="py-16 bg-[var(--color-ink-deep)] border-b border-[var(--color-card)]">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv flex flex-col lg:flex-row lg:items-center gap-10">

            {/* Estado actual */}
            <div className="shrink-0 flex flex-col gap-3">
              <p className="font-[var(--font-cond)] text-xs tracking-widest uppercase text-[var(--color-mid)]">
                Ahora mismo
              </p>
              <div className="flex items-center gap-3">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{
                    background: open ? "#22c55e" : "var(--color-mid)",
                    boxShadow: open ? "0 0 8px 2px rgba(34,197,94,0.45)" : "none",
                  }}
                />
                <span
                  className="font-[var(--font-display)] text-4xl tracking-wide"
                  style={{ color: open ? "#22c55e" : "var(--color-mid)" }}
                >
                  {open ? "ABIERTO" : "CERRADO"}
                </span>
              </div>
              <p className="font-[var(--font-cond)] text-sm text-[var(--color-mid)] tracking-wide">
                Hoy: <span className="text-[var(--color-cream)]">{today}</span>
              </p>
            </div>

            {/* Separador vertical */}
            <div className="hidden lg:block w-px self-stretch bg-[var(--color-card)]" />

            {/* Tabla de horarios */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 flex-1">
              {schedule.map((day) => {
                const isToday = day.label === today;
                const closed = !day.morning && !day.afternoon;
                return (
                  <div
                    key={day.label}
                    className="flex flex-col gap-1.5 p-3 rounded-xl transition-colors duration-200"
                    style={{
                      background: isToday
                        ? "rgba(196,162,207,0.1)"
                        : "var(--color-card)",
                      border: isToday
                        ? "1px solid rgba(196,162,207,0.35)"
                        : "1px solid transparent",
                    }}
                  >
                    <p
                      className="font-[var(--font-cond)] text-xs tracking-widest uppercase"
                      style={{
                        color: isToday
                          ? "var(--color-lavender)"
                          : "var(--color-mid)",
                      }}
                    >
                      {day.label.slice(0, 3)}
                    </p>
                    {closed ? (
                      <p className="font-[var(--font-body)] text-xs text-[var(--color-mid)] italic">
                        Cerrado
                      </p>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {day.morning && (
                          <p className="font-[var(--font-body)] text-xs text-[var(--color-cream)]">
                            {day.morning}
                          </p>
                        )}
                        {day.afternoon && (
                          <p className="font-[var(--font-body)] text-xs text-[var(--color-cream)]">
                            {day.afternoon}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ─── WORKSHOP PREVIEW ─── */}
      <section className="py-24">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv rounded-3xl overflow-hidden bg-[var(--color-card)] border border-[var(--color-mid)]/20 grid md:grid-cols-2 relative">
            {/* Glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse 60% 80% at 0% 50%, rgba(229,48,30,0.05) 0%, transparent 60%)",
              }}
            />
            <div className="p-6 sm:p-10 lg:p-16 flex flex-col justify-center gap-6 relative">
              <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-brand-red)]">
                Nuestro taller
              </p>
              <h2 className="font-[var(--font-display)] text-4xl sm:text-6xl text-[var(--color-cream)] leading-none tracking-wide">
                SERVICIO
                <br />
                <span className="text-[var(--color-lavender)]">
                  PROFESIONAL
                </span>
              </h2>
              <p className="text-[var(--color-mid)] text-base leading-relaxed max-w-sm font-[var(--font-body)]">
                Desde revisiones rápidas hasta reparaciones complejas. Mecánicos
                especializados en todas las marcas y disciplinas.
              </p>
              <div>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => navigate("/taller")}
                >
                  Conoce el taller <ArrowRight size={18} />
                </Button>
              </div>
            </div>
            <div className="relative bg-[var(--color-ink)] min-h-[260px] sm:min-h-[380px] flex items-center justify-center p-5 sm:p-8">
              <div className="grid grid-cols-2 gap-5 w-full">
                {[
                  { label: "Reparación", icon: "🔧" },
                  { label: "Mantenimiento", icon: "⚙️" },
                  { label: "Personalización", icon: "⭐" },
                  { label: "Diagnóstico", icon: "🔍" },
                ].map(({ label, icon }) => (
                  <div
                    key={label}
                    className="group flex flex-col items-center justify-center gap-3 py-6 px-3 sm:py-10 sm:px-6 rounded-2xl bg-[var(--color-card)] border border-[var(--color-mid)]/20 hover:border-[rgba(196,162,207,0.3)] hover:bg-[rgba(196,162,207,0.05)] transition-all duration-300 text-center cursor-default"
                  >
                    <span className="text-4xl group-hover:scale-125 transition-transform duration-300">
                      {icon}
                    </span>
                    <span className="font-[var(--font-cond)] text-base font-semibold text-[var(--color-cream)] tracking-wide">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── REVIEWS ─── */}
      <section className="py-24 bg-[var(--color-ink-deep)]">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv flex flex-col md:flex-row md:items-end justify-between gap-8 mb-14">
            <div>
              <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-3">
                Lo que dicen nuestros clientes
              </p>
              <h2 className="font-[var(--font-display)] text-4xl sm:text-5xl lg:text-6xl text-[var(--color-cream)] tracking-wide">
                OPINIONES
              </h2>
            </div>

            {/* Badge Google — datos dinámicos */}
            <a
              href={`https://www.google.com/maps/place/?q=place_id:${import.meta.env.VITE_GOOGLE_PLACE_ID}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rv flex items-center gap-4 p-5 rounded-2xl bg-[var(--color-card)] border border-[var(--color-card-hover)] hover:border-[rgba(196,162,207,0.3)] transition-all group shrink-0"
              style={{ transitionDelay: "100ms" }}
            >
              <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true" style={{ flexShrink: 0 }}>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <div>
                <div className="flex items-center gap-0.5 mb-1">
                  {[1, 2, 3, 4, 5].map((s) => {
                    const filled = reviewData ? s <= Math.round(reviewData.rating) : false;
                    return (
                      <Star
                        key={s}
                        size={16}
                        fill={filled ? "#FBBC05" : "transparent"}
                        stroke={filled ? "none" : "#FBBC05"}
                        strokeWidth={1.5}
                      />
                    );
                  })}
                </div>
                <p className="font-[var(--font-display)] text-3xl text-[var(--color-cream)] tracking-wide leading-none">
                  {reviewData ? reviewData.rating.toFixed(1).replace(".", ",") : "–"}
                </p>
                <p className="font-[var(--font-cond)] text-xs text-[var(--color-mid)] tracking-wide mt-1">
                  {reviewData
                    ? `${reviewData.user_ratings_total} reseñas en Google`
                    : reviewLoading ? "Cargando…" : "Reseñas en Google"}
                </p>
              </div>
              <ChevronRight size={18} className="ml-2 text-[var(--color-mid)] group-hover:text-[var(--color-lavender)] transition-colors" />
            </a>
          </div>

          {/* Skeleton de carga */}
          {reviewLoading && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="p-8 rounded-2xl bg-[var(--color-card)] border border-[var(--color-card-hover)] animate-pulse">
                  <div className="h-3 bg-[rgba(196,162,207,0.1)] rounded-full w-24 mb-5" />
                  <div className="h-3 bg-[rgba(196,162,207,0.07)] rounded-full w-full mb-2" />
                  <div className="h-3 bg-[rgba(196,162,207,0.07)] rounded-full w-5/6 mb-2" />
                  <div className="h-3 bg-[rgba(196,162,207,0.07)] rounded-full w-4/6 mb-8" />
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[rgba(196,162,207,0.1)]" />
                    <div className="space-y-1.5">
                      <div className="h-3 bg-[rgba(196,162,207,0.1)] rounded-full w-24" />
                      <div className="h-2.5 bg-[rgba(196,162,207,0.07)] rounded-full w-16" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Reseñas reales de Google — carrusel */}
          {!reviewLoading && !reviewError && reviewData && reviewData.reviews.length > 0 && (
            <ReviewCarousel reviews={reviewData.reviews} />
          )}

          {/* Fallback: atributos del negocio (API no disponible o sin reseñas) */}
          {!reviewLoading && (reviewError || !reviewData || reviewData.reviews.length === 0) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                {
                  title: "Atención personalizada",
                  text: "Asesoramiento experto sin presión. Te ayudan a elegir la bici perfecta según tu nivel, uso y presupuesto.",
                  icon: <Star size={22} strokeWidth={1.5} />,
                },
                {
                  title: "Taller de confianza",
                  text: "Servicio técnico rápido y profesional. Trabajan con todas las marcas y componentes, con garantía en cada reparación.",
                  icon: <Wrench size={22} strokeWidth={1.5} />,
                },
                {
                  title: "Distribuidores oficiales Giant",
                  text: "Concesionario oficial Giant y Liv en Cantabria. Garantía oficial, recambios originales y servicio técnico certificado.",
                  icon: <Award size={22} strokeWidth={1.5} />,
                },
              ].map(({ title, text, icon }, i) => (
                <div
                  key={title}
                  className="rv group relative p-8 rounded-2xl bg-[var(--color-card)] border border-[var(--color-card-hover)] hover:border-[rgba(196,162,207,0.2)] transition-all duration-500 overflow-hidden"
                  style={{ transitionDelay: `${i * 80}ms` }}
                >
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{ background: "radial-gradient(circle at 30% 30%, rgba(196,162,207,0.06), transparent 70%)" }}
                  />
                  <div className="relative">
                    <div className="flex items-center gap-0.5 mb-4">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} size={14} fill="#FBBC05" stroke="none" />
                      ))}
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-[rgba(196,162,207,0.1)] flex items-center justify-center text-[var(--color-lavender)] mb-5">
                      {icon}
                    </div>
                    <h3 className="font-[var(--font-display)] text-2xl text-[var(--color-cream)] tracking-wide mb-3">
                      {title}
                    </h3>
                    <p className="text-[var(--color-mid)] text-sm leading-relaxed font-[var(--font-body)]">
                      {text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ─── CTA FINAL ─── */}
      <section className="py-8 pb-28">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div
            className="rv relative rounded-3xl overflow-hidden p-8 sm:p-12 md:p-20 flex flex-col items-center text-center gap-6"
            style={{
              background:
                "linear-gradient(135deg, rgba(229,48,30,0.12) 0%, rgba(196,162,207,0.1) 50%, rgba(26,22,32,0) 100%)",
              border: "1px solid rgba(196,162,207,0.2)",
            }}
          >
            {/* Background text */}
            <span
              className="absolute inset-0 flex items-center justify-center font-[var(--font-display)] text-[22vw] leading-none text-[rgba(196,162,207,0.04)] select-none pointer-events-none"
              aria-hidden="true"
            >
              DC
            </span>
            <p className="relative font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)]">
              ¿Listo para empezar?
            </p>
            <h2 className="relative font-[var(--font-display)] text-4xl sm:text-6xl md:text-8xl text-[var(--color-cream)] tracking-wide leading-none">
              TU PRÓXIMA
              <br />
              AVENTURA
              <br />
              <span className="text-[var(--color-brand-red)]">TE ESPERA.</span>
            </h2>
            <p className="relative text-[var(--color-mid)] font-[var(--font-body)] text-lg max-w-lg leading-relaxed">
              Visítanos en El Astillero o escríbenos. Te ayudamos a elegir la
              bicicleta perfecta para ti.
            </p>
            <div className="relative flex flex-wrap gap-4 justify-center">
              <Button
                variant="primary"
                size="lg"
                onClick={() => navigate("/catalogo")}
                className="font-[var(--font-display)] tracking-widest text-xl"
              >
                Ver catálogo <ArrowRight size={20} />
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setQuoteOpen(true)}
                className="font-[var(--font-display)] tracking-widest text-xl"
              >
                Pedir presupuesto
              </Button>
            </div>
          </div>
        </div>
      </section>

      {quoteOpen && (
        <QuoteModal productId={null} onClose={() => setQuoteOpen(false)} />
      )}
    </div>
  );
}

