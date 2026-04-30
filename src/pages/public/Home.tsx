import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Award, Wrench, Zap, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ProductCard } from "@/components/public/ProductCard";
import { QuoteModal } from "@/components/public/QuoteModal";
import { Button } from "@/components/ui/Button";
import type { Product, ProductImage } from "@/lib/database.types";

const HERO_LINE1 = "MUÉVETE.";
const HERO_LINE2 = "SIN LÍMITES.";
const BRANDS = [
  "Giant",
  "Liv",
  "Stevens",
  "Giant",
  "Liv",
  "Stevens",
  "Giant",
  "Liv",
  "Stevens",
  "Giant",
  "Liv",
  "Stevens",
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

function useReveal() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) =>
        entries.forEach(
          (e) => e.isIntersecting && e.target.classList.add("visible"),
        ),
      { threshold: 0.15 },
    );
    el.querySelectorAll(".rv").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);
  return ref;
}

export default function Home() {
  const navigate = useNavigate();
  const [featured, setFeatured] = useState<Product[]>([]);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const sectionRef = useReveal();

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
      {/* Hero */}
      <section className="relative min-h-[92dvh] flex items-center overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 60% 50%, rgba(196,162,207,0.08) 0%, transparent 70%)",
          }}
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full grid lg:grid-cols-2 gap-12 items-center py-20">
          {/* Text side */}
          <div className="flex flex-col gap-6 z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(196,162,207,0.12)] border border-[rgba(196,162,207,0.25)] w-fit">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-lavender)] animate-[spulse_2s_ease-in-out_infinite]" />
              <span className="font-[var(--font-cond)] text-xs tracking-widest uppercase text-[var(--color-lavender)]">
                El Astillero · Cantabria
              </span>
            </div>

            <h1
              className="font-[var(--font-display)] leading-none tracking-wide text-[var(--color-cream)]"
              style={{ fontSize: "clamp(3.5rem, 8vw, 7rem)" }}
            >
              <span className="block">
                <HeroText text={HERO_LINE1} baseDelay={200} />
              </span>
              <span className="block text-[var(--color-lavender)]">
                <HeroText text={HERO_LINE2} baseDelay={700} />
              </span>
            </h1>

            <p className="text-[var(--color-mid)] font-[var(--font-body)] text-lg max-w-md leading-relaxed">
              Tu tienda de bicicletas de confianza. Venta, taller y fitting
              profesional en el corazón de Cantabria.
            </p>

            <div className="flex flex-wrap gap-3 mt-2">
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
          <div className="relative flex items-center justify-center h-[380px] lg:h-[520px]">
            <BikeSVG />

            {/* Score badge */}
            <div
              className="absolute top-6 right-6 lg:top-10 lg:right-0 flex flex-col items-center justify-center w-20 h-20 rounded-full border-2 border-[var(--color-lavender)] bg-[var(--color-card)] shadow-[0_0_24px_rgba(196,162,207,0.3)]"
              style={{ animation: "spulse 2.4s ease-in-out infinite" }}
              aria-label="Puntuación 8.5 sobre 10"
            >
              <span className="font-[var(--font-display)] text-2xl text-[var(--color-lavender)] leading-none">
                8.5
              </span>
              <span className="font-[var(--font-cond)] text-xs text-[var(--color-mid)] tracking-widest">
                /10
              </span>
            </div>
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

      {/* Features */}
      <section className="py-24 bg-[var(--color-ink-deep)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: <Award size={32} strokeWidth={1.5} />,
                title: "Calidad premium",
                text: "Seleccionamos las mejores marcas del mercado para ofrecerte bicicletas que duran una vida.",
              },
              {
                icon: <Wrench size={32} strokeWidth={1.5} />,
                title: "Taller experto",
                text: "Nuestros mecánicos certificados realizan todo tipo de reparaciones, mantenimientos y personalizaciones.",
              },
              {
                icon: <Zap size={32} strokeWidth={1.5} />,
                title: "Asesoramiento real",
                text: "Te ayudamos a encontrar la bici perfecta según tu estilo de conducción, presupuesto y objetivos.",
              },
            ].map(({ icon, title, text }) => (
              <div
                key={title}
                className="rv flex flex-col gap-4 p-8 rounded-2xl bg-[var(--color-card)] border border-[var(--color-card)] hover:border-[rgba(196,162,207,0.2)] transition-all duration-300"
              >
                <div className="text-[var(--color-lavender)]">{icon}</div>
                <h3 className="font-[var(--font-cond)] text-xl font-semibold text-[var(--color-cream)] tracking-wide">
                  {title}
                </h3>
                <p className="text-[var(--color-mid)] text-sm leading-relaxed">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured products */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-12">
            <div>
              <p className="rv font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
                Selección
              </p>
              <h2 className="rv font-[var(--font-display)] text-5xl text-[var(--color-cream)] tracking-wide">
                DESTACADOS
              </h2>
            </div>
            <Link
              to="/catalogo"
              className="rv hidden sm:flex items-center gap-2 font-[var(--font-cond)] text-sm text-[var(--color-mid)] hover:text-[var(--color-lavender)] transition-colors tracking-wide"
            >
              Ver todo el catálogo
              <ChevronRight size={16} />
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

          <div className="mt-10 flex justify-center">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => navigate("/catalogo")}
            >
              Ver catálogo completo
              <ArrowRight size={18} />
            </Button>
          </div>
        </div>
      </section>

      {/* Brands marquee */}
      <section className="py-16 bg-[var(--color-ink-deep)] overflow-hidden border-y border-[var(--color-card)]">
        <div className="flex">
          <div
            className="flex gap-16 items-center shrink-0 animate-[marq_20s_linear_infinite]"
            aria-hidden="true"
          >
            {[...BRANDS, ...BRANDS].map((brand, i) => (
              <span
                key={i}
                className="font-[var(--font-display)] text-3xl tracking-widest text-[var(--color-mid)] hover:text-[var(--color-lavender)] transition-colors whitespace-nowrap"
              >
                {brand}
              </span>
            ))}
          </div>
        </div>
        <p className="sr-only">Marcas: {[...new Set(BRANDS)].join(", ")}</p>
      </section>

      {/* Workshop preview */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rv rounded-3xl overflow-hidden bg-[var(--color-card)] border border-[var(--color-mid)]/20 grid md:grid-cols-2">
            <div className="p-10 lg:p-16 flex flex-col justify-center gap-6">
              <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)]">
                Nuestro taller
              </p>
              <h2 className="font-[var(--font-display)] text-5xl text-[var(--color-cream)] leading-none tracking-wide">
                SERVICIO
                <br />
                PROFESIONAL
              </h2>
              <p className="text-[var(--color-mid)] text-base leading-relaxed max-w-sm">
                Desde revisiones rápidas hasta reparaciones complejas. Mecánicos
                especializados con experiencia en todas las marcas y
                disciplinas.
              </p>
              <div>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => navigate("/taller")}
                >
                  Ver más sobre el taller
                  <ArrowRight size={18} />
                </Button>
              </div>
            </div>

            <div className="relative bg-[var(--color-ink)] min-h-[280px] flex items-center justify-center p-10">
              <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
                {[
                  "Reparación",
                  "Mantenimiento",
                  "Personalización",
                  "Bike Fitting",
                ].map((service) => (
                  <div
                    key={service}
                    className="flex items-center justify-center p-4 rounded-xl bg-[var(--color-card)] border border-[var(--color-mid)]/20 text-center"
                  >
                    <span className="font-[var(--font-cond)] text-sm text-[var(--color-cream)] tracking-wide">
                      {service}
                    </span>
                  </div>
                ))}
              </div>
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
  return (
    <div className="relative w-full h-full flex items-center justify-center select-none">
      <svg
        viewBox="0 0 520 380"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full max-w-[520px] h-auto"
        aria-hidden="true"
      >
        {/* Rear wheel (logo spinning) */}
        <g transform="translate(130, 220)">
          {/* Wheel rim */}
          <circle
            cx="0"
            cy="0"
            r="100"
            stroke="rgba(196,162,207,0.3)"
            strokeWidth="6"
          />
          <circle cx="0" cy="0" r="8" fill="rgba(196,162,207,0.5)" />
          {/* Spokes */}
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i * 30 * Math.PI) / 180;
            return (
              <line
                key={i}
                x1={Math.cos(angle) * 8}
                y1={Math.sin(angle) * 8}
                x2={Math.cos(angle) * 98}
                y2={Math.sin(angle) * 98}
                stroke="rgba(196,162,207,0.15)"
                strokeWidth="1.5"
              />
            );
          })}
        </g>

        {/* Rear wheel logo overlay */}
        <foreignObject x="36" y="126" width="188" height="188">
          <img
            src="/DC_Bikes_Sin_Fondo.png"
            alt=""
            style={{
              width: "100%",
              height: "100%",
              transformOrigin: "center",
              animation: "wspin 3.2s linear infinite",
              opacity: 0.7,
            }}
          />
        </foreignObject>

        {/* Front wheel */}
        <g transform="translate(390, 220)">
          <circle
            cx="0"
            cy="0"
            r="100"
            stroke="rgba(196,162,207,0.3)"
            strokeWidth="6"
          />
          <circle cx="0" cy="0" r="8" fill="rgba(196,162,207,0.5)" />
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i * 30 * Math.PI) / 180;
            return (
              <line
                key={i}
                x1={Math.cos(angle) * 8}
                y1={Math.sin(angle) * 8}
                x2={Math.cos(angle) * 98}
                y2={Math.sin(angle) * 98}
                stroke="rgba(196,162,207,0.2)"
                strokeWidth="1.5"
              />
            );
          })}
        </g>

        {/* Frame: chain stay (rear axle → BB) */}
        <line
          x1="130"
          y1="220"
          x2="255"
          y2="255"
          stroke="#C4A2CF"
          strokeWidth="5"
          strokeLinecap="round"
        />
        {/* Frame: seat stay */}
        <line
          x1="130"
          y1="220"
          x2="240"
          y2="120"
          stroke="#C4A2CF"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Frame: seat tube */}
        <line
          x1="240"
          y1="120"
          x2="255"
          y2="255"
          stroke="#C4A2CF"
          strokeWidth="5"
          strokeLinecap="round"
        />
        {/* Frame: top tube */}
        <line
          x1="240"
          y1="120"
          x2="330"
          y2="110"
          stroke="#C4A2CF"
          strokeWidth="5"
          strokeLinecap="round"
        />
        {/* Frame: down tube */}
        <line
          x1="330"
          y1="110"
          x2="255"
          y2="255"
          stroke="#C4A2CF"
          strokeWidth="5"
          strokeLinecap="round"
        />
        {/* Fork */}
        <line
          x1="330"
          y1="110"
          x2="390"
          y2="220"
          stroke="#C4A2CF"
          strokeWidth="5"
          strokeLinecap="round"
        />
        {/* Head tube */}
        <line
          x1="330"
          y1="110"
          x2="345"
          y2="75"
          stroke="#C4A2CF"
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* Handlebar stem */}
        <line
          x1="345"
          y1="75"
          x2="360"
          y2="72"
          stroke="#C4A2CF"
          strokeWidth="5"
          strokeLinecap="round"
        />
        {/* Handlebar drop */}
        <path
          d="M350 72 Q365 65 375 75 Q380 82 370 88"
          stroke="#C4A2CF"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
        {/* Saddle */}
        <line
          x1="240"
          y1="120"
          x2="240"
          y2="88"
          stroke="#C4A2CF"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M222 85 Q240 78 258 85"
          stroke="#C4A2CF"
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
        {/* Crankset */}
        <circle cx="255" cy="255" r="14" stroke="#C4A2CF" strokeWidth="4" />
        <line
          x1="255"
          y1="241"
          x2="255"
          y2="269"
          stroke="#C4A2CF"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <line
          x1="241"
          y1="255"
          x2="269"
          y2="255"
          stroke="#C4A2CF"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
