import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Award,
  Wrench,
  Zap,
  ChevronRight,
  Star,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ProductCard } from "@/components/public/ProductCard";
import { QuoteModal } from "@/components/public/QuoteModal";
import { Button } from "@/components/ui/Button";
import type { Product, ProductImage } from "@/lib/database.types";

const HERO_LINE1 = "MUÉVETE.";
const HERO_LINE2 = "SIN LÍMITES.";

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

function AnimatedChar({ char, delay }: { char: string; delay: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <span
      style={{
        display: "inline-block",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(0.35em)",
        transition: "opacity 0.45s ease, transform 0.45s ease",
      }}
    >
      {char === " " ? " " : char}
    </span>
  );
}

function HeroText({ text, baseDelay }: { text: string; baseDelay: number }) {
  return (
    <span>
      {text.split("").map((char, i) => (
        <AnimatedChar key={i} char={char} delay={baseDelay + i * 55} />
      ))}
    </span>
  );
}

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

export default function Home() {
  const navigate = useNavigate();
  const [featured, setFeatured] = useState<Product[]>([]);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const sectionRef = useReveal([featured]);

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
      cost_price: null,
      retail_price: [899, 1299, 599, 1899][i],
      discount_percent: [0, 15, 0, 10][i] || null,
      stock: 1,
      sku: null,
      brand: ["Giant", "Trek", "Orbea", "Specialized"][i],
      featured: true,
      active: true,
      created_at: "",
      updated_at: "",
    }),
  );

  const displayProducts = featured.length > 0 ? featured : placeholderProducts;

  return (
    <div ref={sectionRef}>
      {/* ─── HERO ─── */}
      <section className="relative min-h-[95dvh] flex items-center overflow-hidden">
        {/* Animated background orbs */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
        >
          <div
            style={{
              position: "absolute",
              width: "600px",
              height: "600px",
              borderRadius: "50%",
              top: "-10%",
              left: "-5%",
              background:
                "radial-gradient(circle, rgba(196,162,207,0.07) 0%, transparent 70%)",
              animation: "float 8s ease-in-out infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: "400px",
              height: "400px",
              borderRadius: "50%",
              bottom: "0%",
              right: "10%",
              background:
                "radial-gradient(circle, rgba(229,48,30,0.06) 0%, transparent 70%)",
              animation: "float 6s ease-in-out infinite 2s",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: "300px",
              height: "300px",
              borderRadius: "50%",
              top: "40%",
              left: "40%",
              background:
                "radial-gradient(circle, rgba(196,162,207,0.05) 0%, transparent 70%)",
              animation: "float 10s ease-in-out infinite 1s",
            }}
          />
          {/* Grid lines decoration */}
          <svg
            className="absolute inset-0 w-full h-full opacity-[0.03]"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <pattern
                id="grid"
                width="60"
                height="60"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 60 0 L 0 0 0 60"
                  fill="none"
                  stroke="white"
                  strokeWidth="0.5"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <div className="w-full px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center py-24 relative z-10">
          {/* Text side */}
          <div className="flex flex-col gap-7">
            {/* Badge */}
            <div
              style={{
                animation: "fadeUp 0.6s ease forwards 0.1s",
                opacity: 0,
              }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(196,162,207,0.12)] border border-[rgba(196,162,207,0.25)] w-fit">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-lavender)] animate-[spulse_2s_ease-in-out_infinite]" />
                <span className="font-[var(--font-cond)] text-xs tracking-widest uppercase text-[var(--color-lavender)]">
                  El Astillero · Cantabria
                </span>
              </div>
            </div>

            {/* Title */}
            <h1
              className="font-[var(--font-display)] leading-none tracking-wide text-[var(--color-cream)]"
              style={{ fontSize: "clamp(3.8rem, 9vw, 8rem)" }}
            >
              <span className="block">
                <HeroText text={HERO_LINE1} baseDelay={200} />
              </span>
              <span className="block text-[var(--color-lavender)]">
                <HeroText text={HERO_LINE2} baseDelay={700} />
              </span>
            </h1>

            {/* Divider line */}
            <div
              style={{
                animation: "fadeUp 0.6s ease forwards 1.2s",
                opacity: 0,
              }}
            >
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-gradient-to-r from-[var(--color-brand-red)] via-[var(--color-lavender)] to-transparent" />
                <Star
                  size={12}
                  className="text-[var(--color-lavender)]"
                  fill="currentColor"
                />
              </div>
            </div>

            <p
              className="text-[var(--color-mid)] font-[var(--font-body)] text-lg max-w-md leading-relaxed"
              style={{ animation: "fadeUp 0.6s ease forwards 1s", opacity: 0 }}
            >
              Tu tienda de bicicletas de confianza. Venta, taller y
              asesoramiento profesional en el corazón de Cantabria.
            </p>

            <div
              className="flex flex-wrap gap-3"
              style={{
                animation: "fadeUp 0.6s ease forwards 1.3s",
                opacity: 0,
              }}
            >
              <Button
                variant="primary"
                size="lg"
                onClick={() => navigate("/catalogo")}
                className="font-[var(--font-display)] tracking-widest text-xl"
              >
                Ver catálogo
                <ArrowRight size={20} />
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

          {/* Bike illustration */}
          <div
            className="relative flex items-center justify-center h-[440px] lg:h-[640px]"
            style={{ animation: "fadeUp 0.8s ease forwards 0.4s", opacity: 0 }}
          >
            <div style={{ animation: "float 5s ease-in-out infinite" }}>
              <BikeSVG />
            </div>
            {/* Glow under bike */}
            <div
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-96 h-10 rounded-full"
              style={{
                background:
                  "radial-gradient(ellipse, rgba(196,162,207,0.15) 0%, transparent 70%)",
                filter: "blur(12px)",
                animation: "spulse 5s ease-in-out infinite",
              }}
            />
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-[var(--color-mid)] animate-[float_3s_ease-in-out_infinite]">
          <span className="font-[var(--font-cond)] text-xs tracking-widest uppercase">
            Scroll
          </span>
          <div className="w-px h-8 bg-gradient-to-b from-[var(--color-mid)] to-transparent" />
        </div>
      </section>

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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-4 divide-y-2 lg:divide-y-0 lg:divide-x divide-[var(--color-card)]">
            <StatCounter value={500} suffix="+" label="Bicis reparadas" />
            <StatCounter value={10} suffix="+" label="Años de experiencia" />
            <StatCounter value={3} label="Marcas premium" />
            <StatCounter value={24} suffix="h" label="Tiempo de respuesta" />
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section className="py-28 relative overflow-hidden">
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
            <h2 className="font-[var(--font-display)] text-6xl text-[var(--color-cream)] tracking-wide">
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
              <h2 className="rv font-[var(--font-display)] text-6xl text-[var(--color-cream)] tracking-wide">
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

      {/* ─── BRANDS MARQUEE ─── */}
      <section className="py-14 overflow-hidden border-y border-[var(--color-card)]">
        <p className="rv text-center font-[var(--font-cond)] text-xs tracking-widest uppercase text-[var(--color-mid)] mb-8">
          Marcas oficiales
        </p>
        <div className="flex">
          <div
            className="flex gap-20 items-center shrink-0 animate-[marq_22s_linear_infinite]"
            aria-hidden="true"
          >
            {[
              "GIANT",
              "LIV",
              "STEVENS",
              "GIANT",
              "LIV",
              "STEVENS",
              "GIANT",
              "LIV",
              "STEVENS",
              "GIANT",
              "LIV",
              "STEVENS",
            ].map((brand, i) => (
              <span
                key={i}
                className="font-[var(--font-display)] text-4xl tracking-widest text-[var(--color-mid)] hover:text-[var(--color-lavender)] transition-colors whitespace-nowrap cursor-default"
              >
                {brand}
              </span>
            ))}
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
            <div className="p-10 lg:p-16 flex flex-col justify-center gap-6 relative">
              <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-brand-red)]">
                Nuestro taller
              </p>
              <h2 className="font-[var(--font-display)] text-6xl text-[var(--color-cream)] leading-none tracking-wide">
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
            <div className="relative bg-[var(--color-ink)] min-h-[380px] flex items-center justify-center p-8">
              <div className="grid grid-cols-2 gap-5 w-full">
                {[
                  { label: "Reparación", icon: "🔧" },
                  { label: "Mantenimiento", icon: "⚙️" },
                  { label: "Personalización", icon: "⭐" },
                  { label: "Diagnóstico", icon: "🔍" },
                ].map(({ label, icon }) => (
                  <div
                    key={label}
                    className="group flex flex-col items-center justify-center gap-3 py-10 px-6 rounded-2xl bg-[var(--color-card)] border border-[var(--color-mid)]/20 hover:border-[rgba(196,162,207,0.3)] hover:bg-[rgba(196,162,207,0.05)] transition-all duration-300 text-center cursor-default"
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

      {/* ─── CTA FINAL ─── */}
      <section className="py-8 pb-28">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div
            className="rv relative rounded-3xl overflow-hidden p-12 md:p-20 flex flex-col items-center text-center gap-6"
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
            <h2 className="relative font-[var(--font-display)] text-6xl md:text-8xl text-[var(--color-cream)] tracking-wide leading-none">
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

function BikeSVG() {
  const spokes = Array.from({ length: 16 }, (_, i) => (i * Math.PI * 2) / 16);
  // Rear wheel: (148,405) r=140 | Front wheel: (602,405) r=140
  // BB: (330,405) | Seat top: (268,175) | Head tube: (545,170)→(562,227)
  const RX = 148, RY = 405, FX = 602, FY = 405, R = 140;
  const BBX = 330, BBY = 405;
  const STX = 268, STY = 175;
  const HTX1 = 545, HTY1 = 170, HTX2 = 562, HTY2 = 227;
  return (
    <div className="relative w-full h-full flex items-center justify-center select-none">
      <svg
        viewBox="0 0 800 560"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full max-w-[780px] h-auto"
        aria-hidden="true"
      >
        {/* ── REAR WHEEL ── */}
        <g transform={`translate(${RX},${RY})`}>
          {/* Subtle dark fill so frame tubes don't bleed through */}
          <circle cx="0" cy="0" r={R} fill="rgba(26,22,32,0.55)" stroke="rgba(196,162,207,0.4)" strokeWidth="5" />
          {spokes.map((a, i) => (
            <line key={i}
              x1={Math.cos(a)*9} y1={Math.sin(a)*9}
              x2={Math.cos(a)*(R-2)} y2={Math.sin(a)*(R-2)}
              stroke="rgba(196,162,207,0.10)" strokeWidth="1" />
          ))}
          <circle cx="0" cy="0" r="9" fill="rgba(196,162,207,0.55)" />
        </g>
        {/* Spinning logo — centered on rear axle */}
        <foreignObject x={RX - 128} y={RY - 128} width="256" height="256">
          <img src="/DC_Bikes_Giratorio.png" alt=""
            style={{ width:"100%", height:"100%", objectFit:"contain",
              transformOrigin:"center", animation:"wspin 3.2s linear infinite", opacity:0.78 }} />
        </foreignObject>

        {/* ── FRONT WHEEL ── */}
        <g transform={`translate(${FX},${FY})`}>
          <circle cx="0" cy="0" r={R} fill="rgba(26,22,32,0.55)" stroke="rgba(196,162,207,0.4)" strokeWidth="5" />
          {spokes.map((a, i) => (
            <line key={i}
              x1={Math.cos(a)*9} y1={Math.sin(a)*9}
              x2={Math.cos(a)*(R-2)} y2={Math.sin(a)*(R-2)}
              stroke="rgba(196,162,207,0.26)" strokeWidth="1.2" />
          ))}
          <circle cx="0" cy="0" r="9" fill="rgba(196,162,207,0.55)" />
        </g>

        {/* ── FRAME — road bike diamond ──
            Chain stays: BB → rear axle (horizontal)
            Seat stays:  rear axle → seat top (twin thin tubes)
            Seat tube:   BB → seat top
            Top tube:    seat top → head tube top (nearly horizontal)
            Down tube:   BB → head tube bottom (thickest)
            Head tube:   head top → head bottom (short, steep)
        */}
        {/* Chain stays */}
        <line x1={RX} y1={RY} x2={BBX} y2={BBY}
          stroke="#C4A2CF" strokeWidth="5" strokeLinecap="round" />
        {/* Seat stays — twin tubes */}
        <line x1={RX} y1={RY} x2={STX-4} y2={STY}
          stroke="#C4A2CF" strokeWidth="3" strokeLinecap="round" />
        <line x1={RX+7} y1={RY} x2={STX+5} y2={STY}
          stroke="#C4A2CF" strokeWidth="3" strokeLinecap="round" />
        {/* Seat tube */}
        <line x1={BBX} y1={BBY} x2={STX} y2={STY}
          stroke="#C4A2CF" strokeWidth="7" strokeLinecap="round" />
        {/* Top tube */}
        <line x1={STX} y1={STY} x2={HTX1} y2={HTY1}
          stroke="#C4A2CF" strokeWidth="6" strokeLinecap="round" />
        {/* Down tube (thickest — aero) */}
        <line x1={BBX} y1={BBY} x2={HTX2} y2={HTY2}
          stroke="#C4A2CF" strokeWidth="10" strokeLinecap="round" />
        {/* Head tube */}
        <line x1={HTX1} y1={HTY1} x2={HTX2} y2={HTY2}
          stroke="#C4A2CF" strokeWidth="13" strokeLinecap="round" />

        {/* ── FORK — two blades with forward rake ── */}
        <path d={`M${HTX2} ${HTY2} Q${HTX2+28} ${HTY2+70} ${FX} ${FY}`}
          stroke="#C4A2CF" strokeWidth="6" fill="none" strokeLinecap="round" />
        <path d={`M${HTX2+5} ${HTY2+3} Q${HTX2+33} ${HTY2+73} ${FX+5} ${FY}`}
          stroke="#C4A2CF" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.45" />

        {/* ── DRIVETRAIN ── */}
        <circle cx={BBX} cy={BBY} r="17" stroke="#C4A2CF" strokeWidth="4"
          fill="rgba(26,22,32,0.95)" />
        <circle cx={BBX} cy={BBY} r="40" stroke="rgba(196,162,207,0.3)"
          strokeWidth="2.5" strokeDasharray="8 5" />
        {/* Crank arm ~5 o'clock */}
        <line x1={BBX} y1={BBY} x2={BBX+34} y2={BBY+35}
          stroke="#C4A2CF" strokeWidth="7" strokeLinecap="round" />
        {/* Pedal */}
        <line x1={BBX+23} y1={BBY+38} x2={BBX+45} y2={BBY+28}
          stroke="#C4A2CF" strokeWidth="6.5" strokeLinecap="round" />

        {/* ── SADDLE ── */}
        {/* Seat post above seat tube */}
        <line x1={STX} y1={STY} x2={STX-6} y2={STY-42}
          stroke="#C4A2CF" strokeWidth="6" strokeLinecap="round" />
        {/* Rails */}
        <line x1={STX-32} y1={STY-42} x2={STX+24} y2={STY-42}
          stroke="rgba(196,162,207,0.35)" strokeWidth="2" strokeLinecap="round" />
        {/* Saddle shell — narrow road shape */}
        <path d={`M${STX-36} ${STY-47} Q${STX-13} ${STY-58} ${STX+10} ${STY-57}
                  Q${STX+28} ${STY-54} ${STX+31} ${STY-47}
                  Q${STX+24} ${STY-39} ${STX-28} ${STY-40} Z`}
          fill="rgba(196,162,207,0.38)" stroke="#C4A2CF" strokeWidth="2.2"
          strokeLinejoin="round" />

        {/* ── DROPPED HANDLEBARS ── */}
        {/* Stem: from head tube top, forward & up */}
        <line x1={HTX1} y1={HTY1+4} x2={HTX1+52} y2={HTY1-20}
          stroke="#C4A2CF" strokeWidth="7" strokeLinecap="round" />
        {/* Clamp */}
        <circle cx={HTX1+52} cy={HTY1-20} r="8"
          fill="rgba(196,162,207,0.45)" stroke="#C4A2CF" strokeWidth="2" />
        {/* Bar top — horizontal */}
        <line x1={HTX1+30} y1={HTY1-30} x2={HTX1+74} y2={HTY1-30}
          stroke="#C4A2CF" strokeWidth="7" strokeLinecap="round" />
        {/* Rear drop */}
        <path d={`M${HTX1+30} ${HTY1-30} Q${HTX1+22} ${HTY1-9} ${HTX1+25} ${HTY1+20}`}
          stroke="#C4A2CF" strokeWidth="5.5" fill="none" strokeLinecap="round" />
        {/* Front drop */}
        <path d={`M${HTX1+74} ${HTY1-30} Q${HTX1+82} ${HTY1-9} ${HTX1+78} ${HTY1+20}`}
          stroke="#C4A2CF" strokeWidth="5.5" fill="none" strokeLinecap="round" />
        {/* Hood bumps */}
        <path d={`M${HTX1+25} ${HTY1-11} Q${HTX1+32} ${HTY1-20} ${HTX1+39} ${HTY1-12}`}
          stroke="#C4A2CF" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d={`M${HTX1+79} ${HTY1-11} Q${HTX1+72} ${HTY1-20} ${HTX1+65} ${HTY1-12}`}
          stroke="#C4A2CF" strokeWidth="4" fill="none" strokeLinecap="round" />
        {/* Brake levers */}
        <line x1={HTX1+32} y1={HTY1-12} x2={HTX1+28} y2={HTY1+6}
          stroke="#C4A2CF" strokeWidth="3.5" strokeLinecap="round" />
        <line x1={HTX1+73} y1={HTY1-12} x2={HTX1+77} y2={HTY1+6}
          stroke="#C4A2CF" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}
