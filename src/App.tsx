import { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { heroListo, suscribirProgresoHero, useHeroPrecargando } from "@/lib/heroCarga";
import { useTheme } from "@/hooks/useTheme";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { Nav } from "@/components/layout/Nav";
import { Footer } from "@/components/layout/Footer";
import { CookieBanner } from "@/components/layout/CookieBanner";
import { CartDrawer } from "@/components/layout/CartDrawer";

const Home         = lazy(() => import("@/pages/public/Home"));
const Catalog      = lazy(() => import("@/pages/public/Catalog"));
const ProductDetail = lazy(() => import("@/pages/public/ProductDetail"));
const Workshop     = lazy(() => import("@/pages/public/Workshop"));
const Contact      = lazy(() => import("@/pages/public/Contact"));
// Landings SEO (marca / tipo / local) + FAQ
const BicicletasGiant      = lazy(() => import("@/pages/public/BicicletasGiant"));
const BicicletasLiv        = lazy(() => import("@/pages/public/BicicletasLiv"));
const BicicletasStevens    = lazy(() => import("@/pages/public/BicicletasStevens"));
const BicicletasElectricas = lazy(() => import("@/pages/public/BicicletasElectricas"));
const BicicletasMontana    = lazy(() => import("@/pages/public/BicicletasMontana"));
const BicicletasCarretera  = lazy(() => import("@/pages/public/BicicletasCarretera"));
const TiendaElAstillero    = lazy(() => import("@/pages/public/TiendaElAstillero"));
const TiendaSantander      = lazy(() => import("@/pages/public/TiendaSantander"));
const PreguntasFrecuentes  = lazy(() => import("@/pages/public/PreguntasFrecuentes"));
const Cart         = lazy(() => import("@/pages/public/Cart"));
const Checkout     = lazy(() => import("@/pages/public/Checkout"));
const RedsysRedirecting = lazy(() => import("@/pages/public/RedsysRedirecting"));
const MockRedsysPayment = lazy(() => import("@/pages/public/MockRedsysPayment"));
const PaymentOtp = lazy(() => import("@/pages/public/PaymentOtp"));
const OrderConfirmation = lazy(() => import("@/pages/public/OrderConfirmation"));
const PaymentError = lazy(() => import("@/pages/public/PaymentError"));
const CookiePolicy = lazy(() => import("@/pages/public/CookiePolicy"));
const PrivacyPolicy = lazy(() => import("@/pages/public/PrivacyPolicy"));
const LegalNotice  = lazy(() => import("@/pages/public/LegalNotice"));
const Returns      = lazy(() => import("@/pages/public/Returns"));
const TermsOfSale  = lazy(() => import("@/pages/public/TermsOfSale"));
const MyOrdersRequestAccess = lazy(() => import("@/pages/public/MyOrdersRequestAccess"));
const MyOrdersSession = lazy(() => import("@/pages/public/MyOrdersSession"));
const MyOrderDetailCustomer = lazy(() => import("@/pages/public/MyOrderDetailCustomer"));
const NotFound     = lazy(() => import("@/pages/public/NotFound"));
const StockAlertUnsubscribe = lazy(() => import("@/pages/public/StockAlertUnsubscribe"));
const AdminRoutes  = lazy(() =>
  import("@/routes/AdminRoutes").then((m) => ({ default: m.AdminRoutes }))
);

function SplashScreen({ onDone }: { onDone: () => void }) {
  const [exiting, setExiting] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  // Mientras el hero precarga su vídeo, esta pantalla NO se va: es la que tapa
  // el rato en el que el scroll está bloqueado (ver heroCarga.ts y ScrubHero).
  const precargandoHero = useHeroPrecargando();
  const barraRef = useRef<HTMLDivElement>(null);
  /** Si esta pantalla llegó a retener al hero, ya lleva rato vista: no hay que
   *  regalarle además el mínimo de cortesía de 300ms antes de irse. */
  const esperoAlHero = useRef(false);

  useEffect(() => {
    // F-24 (V5): si el usuario pide reducir animaciones, no mostramos el splash
    // en absoluto — desmontamos de inmediato sin transiciones (WCAG 2.3.3).
    if (prefersReducedMotion) {
      onDone();
      return;
    }
    // Con un hero precargando no se arranca la salida: se espera a que termine
    // (el hero suelta su bloqueo y esto a la vez).
    if (precargandoHero) { esperoAlHero.current = true; return; }
    // t1: el contenido se desvanece (300ms — el splash solo se ve la primera
    // vez por sesión, así que prima liberar el contenido cuanto antes).
    // Si ha estado esperando al hero, ese mínimo YA se ha cumplido de sobra
    // (medio segundo largo mirando el logo): salir de inmediato, o la espera de
    // la precarga y la cortesía de los 300ms se suman y se hacen eternas.
    const espera = esperoAlHero.current ? 0 : 300;
    const t1 = setTimeout(() => setExiting(true), espera);
    // t2: la cortina ya subió, desmontamos (la subida son 450ms + 50 de retardo)
    const t2 = setTimeout(onDone, espera + 500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone, prefersReducedMotion, precargandoHero]);

  // El % de precarga se escribe DIRECTO en el DOM: son ~150 avisos y por estado
  // de React serían ~150 re-renders de la app entera.
  useEffect(() => {
    if (!precargandoHero) return;
    return suscribirProgresoHero((p) => {
      if (barraRef.current) barraRef.current.style.transform = `scaleX(${Math.min(1, p)})`;
    });
  }, [precargandoHero]);

  if (prefersReducedMotion) return null;

  return (
    /*
     * Capa exterior: es la "cortina" que sube (translateY -100%)
     * con un cubic-bezier de aceleración cinematográfica.
     * El delay de 0.05s permite que el contenido se desvanezca primero
     * (timings comprimidos para que todo el splash quepa en ≤800ms).
     */
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "var(--color-ink)",
        pointerEvents: "none",
        transform: exiting ? "translateY(-100%)" : "translateY(0)",
        transition: exiting
          ? "transform 0.45s cubic-bezier(0.76, 0, 0.24, 1) 0.05s"
          : "none",
      }}
    >
      {/* Línea de acento rojo→lavanda en el borde inferior de la cortina */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 2,
          background:
            "linear-gradient(90deg, var(--color-brand-red), var(--color-lavender), transparent 80%)",
          opacity: exiting ? 1 : 0,
          transition: "opacity 0.2s ease",
        }}
      />

      {/* Contenido: se desvanece y sube ligeramente antes de que suba la cortina */}
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.75rem",
          opacity: exiting ? 0 : 1,
          transform: exiting ? "translateY(-1.2rem) scale(0.94)" : "translateY(0) scale(1)",
          transition: exiting
            ? "opacity 0.25s ease, transform 0.3s ease"
            : "none",
        }}
      >
        {/* Anillo giratorio */}
        <div style={{ position: "relative", width: 148, height: 148 }}>
          <img
            src="/favicon-192.png"
            alt=""
            aria-hidden="true"
            fetchPriority="high"
            decoding="async"
            width={192}
            height={192}
            style={{
              position: "absolute",
              inset: 0,
              width: "120%",
              height: "120%",
              objectFit: "contain",
              animation: "wspin 2.2s linear infinite",
              opacity: 0.6,
            }}
          />
        </div>

        {/* Divisor */}
        <div
          style={{
            width: 1,
            height: 32,
            background:
              "linear-gradient(to bottom, rgba(196,162,207,0.4), transparent)",
            animation: "fadeUp 0.3s ease forwards 0.05s",
            opacity: 0,
          }}
        />

        {/* Tagline */}
        <p
          style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: "0.8rem",
            letterSpacing: "0.4em",
            color: "rgba(126,110,138,0.7)",
            textTransform: "uppercase",
            animation: "fadeUp 0.3s ease forwards 0.1s",
            opacity: 0,
          }}
        >
          El Astillero · Cantabria
        </p>

        {/* Barra de precarga del hero. Solo aparece si hay un vídeo que
            precargar: en el resto de páginas el splash es puro tiempo y una
            barra ahí mentiría (no mediría nada). */}
        {precargandoHero && (
          <div
            style={{
              width: 180,
              height: 1,
              overflow: "hidden",
              background: "rgba(196,162,207,0.2)",
            }}
          >
            <div
              ref={barraRef}
              style={{
                width: "100%",
                height: "100%",
                transformOrigin: "left",
                transform: "scaleX(0)",
                background:
                  "linear-gradient(90deg, var(--color-brand-red), var(--color-lavender))",
              }}
            />
          </div>
        )}
      </div>

      {/* F-24: permite saltar la animación de carga (accesibilidad / preferencia).
          Con un hero precargando, saltar tiene que soltar TAMBIÉN el bloqueo del
          scroll: si no, se quitaría la pantalla de carga y la página se quedaría
          quieta sin explicación, que es peor que no poder saltar. El scrub irá
          algo tosco hasta que acabe la precarga, y es una elección del usuario. */}
      <button
        type="button"
        onClick={() => {
          heroListo();
          onDone();
        }}
        style={{
          position: "absolute",
          bottom: "1.5rem",
          right: "1.5rem",
          pointerEvents: "auto",
          padding: "0.4rem 0.9rem",
          borderRadius: "0.5rem",
          border: "1px solid rgba(196,162,207,0.3)",
          background: "rgba(196,162,207,0.08)",
          color: "rgba(196,162,207,0.9)",
          fontFamily: '"Bebas Neue", sans-serif',
          fontSize: "0.75rem",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          cursor: "pointer",
          opacity: exiting ? 0 : 1,
          transition: "opacity 0.3s ease",
        }}
      >
        Saltar animación
      </button>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    // Desactivar la restauración automática del navegador
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main>{children}</main>
      <Footer />
    </>
  );
}

// Clave de sessionStorage: el splash solo se muestra una vez por sesión.
// try/catch por si el storage está bloqueado (modo privado estricto, iframes).
const SPLASH_SEEN_KEY = "dcb_splash_seen";

function hasSeenSplash(): boolean {
  try {
    return sessionStorage.getItem(SPLASH_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSplashSeen() {
  try {
    sessionStorage.setItem(SPLASH_SEEN_KEY, "1");
  } catch {
    // Sin storage no persistimos — el splash volvería a verse, no es crítico
  }
}

export default function App() {
  useTheme();
  const [splashDone, setSplashDone] = useState(hasSeenSplash);
  const handleSplashDone = useCallback(() => {
    markSplashSeen();
    setSplashDone(true);
  }, []);

  // El splash vuelve a salir si un hero está precargando su vídeo, aunque esta
  // sesión ya lo hubiera visto (p.ej. al entrar en /taller desde la portada).
  // El "una vez por sesión" existe para no repetir una animación decorativa; una
  // espera con el scroll bloqueado NO es decorativa: hay que decir por qué.
  const precargandoHero = useHeroPrecargando();

  return (
    <BrowserRouter>
      <ScrollToTop />
      {(!splashDone || precargandoHero) && <SplashScreen onDone={handleSplashDone} />}
      <Suspense fallback={null}>
      <Routes>
        <Route
          path="/"
          element={
            <PublicLayout>
              <Home />
            </PublicLayout>
          }
        />
        <Route
          path="/catalogo"
          element={
            <PublicLayout>
              <Catalog />
            </PublicLayout>
          }
        />
        <Route
          path="/producto/:slug"
          element={
            <PublicLayout>
              <ProductDetail />
            </PublicLayout>
          }
        />
        <Route
          path="/taller"
          element={
            <PublicLayout>
              <Workshop />
            </PublicLayout>
          }
        />
        <Route
          path="/contacto"
          element={
            <PublicLayout>
              <Contact />
            </PublicLayout>
          }
        />
        {/* Landings SEO — marcas */}
        <Route path="/bicicletas-giant" element={<PublicLayout><BicicletasGiant /></PublicLayout>} />
        <Route path="/bicicletas-liv" element={<PublicLayout><BicicletasLiv /></PublicLayout>} />
        <Route path="/bicicletas-stevens" element={<PublicLayout><BicicletasStevens /></PublicLayout>} />
        {/* Landings SEO — tipos */}
        <Route path="/bicicletas-electricas" element={<PublicLayout><BicicletasElectricas /></PublicLayout>} />
        <Route path="/bicicletas-montana" element={<PublicLayout><BicicletasMontana /></PublicLayout>} />
        <Route path="/bicicletas-carretera" element={<PublicLayout><BicicletasCarretera /></PublicLayout>} />
        {/* Landings SEO — local + FAQ */}
        <Route path="/tienda-bicicletas-el-astillero" element={<PublicLayout><TiendaElAstillero /></PublicLayout>} />
        <Route path="/tienda-bicicletas-santander" element={<PublicLayout><TiendaSantander /></PublicLayout>} />
        <Route path="/preguntas-frecuentes" element={<PublicLayout><PreguntasFrecuentes /></PublicLayout>} />
        <Route
          path="/carrito"
          element={
            <PublicLayout>
              <Cart />
            </PublicLayout>
          }
        />
        <Route
          path="/checkout"
          element={
            <PublicLayout>
              <Checkout />
            </PublicLayout>
          }
        />
        <Route
          path="/pedido/redirigiendo"
          element={
            <PublicLayout>
              <RedsysRedirecting />
            </PublicLayout>
          }
        />
        <Route
          path="/pedido/:orderId/otp"
          element={
            <PublicLayout>
              <PaymentOtp />
            </PublicLayout>
          }
        />
        <Route
          path="/mock-redsys-pago/:order_id"
          element={
            <PublicLayout>
              <MockRedsysPayment />
            </PublicLayout>
          }
        />
        <Route
          path="/pedido/confirmacion/:order_id"
          element={
            <PublicLayout>
              <OrderConfirmation />
            </PublicLayout>
          }
        />
        <Route
          path="/pedido/error"
          element={
            <PublicLayout>
              <PaymentError />
            </PublicLayout>
          }
        />
        <Route
          path="/cookies"
          element={
            <PublicLayout>
              <CookiePolicy />
            </PublicLayout>
          }
        />
        <Route
          path="/privacidad"
          element={
            <PublicLayout>
              <PrivacyPolicy />
            </PublicLayout>
          }
        />
        <Route
          path="/aviso-legal"
          element={
            <PublicLayout>
              <LegalNotice />
            </PublicLayout>
          }
        />
        <Route
          path="/devoluciones"
          element={
            <PublicLayout>
              <Returns />
            </PublicLayout>
          }
        />
        <Route
          path="/terminos-venta"
          element={
            <PublicLayout>
              <TermsOfSale />
            </PublicLayout>
          }
        />
        <Route
          path="/mis-pedidos"
          element={
            <PublicLayout>
              <MyOrdersRequestAccess />
            </PublicLayout>
          }
        />
        <Route
          path="/mis-pedidos/sesion"
          element={
            <PublicLayout>
              <MyOrdersSession />
            </PublicLayout>
          }
        />
        <Route
          path="/mis-pedidos/pedido/:id"
          element={
            <PublicLayout>
              <MyOrderDetailCustomer />
            </PublicLayout>
          }
        />
        <Route
          path="/avisos/baja"
          element={
            <PublicLayout>
              <StockAlertUnsubscribe />
            </PublicLayout>
          }
        />
        <Route path="/admin/*" element={<AdminRoutes />} />
        <Route path="*" element={<PublicLayout><NotFound /></PublicLayout>} />
      </Routes>
      </Suspense>
      <CartDrawer />
      <CookieBanner />
    </BrowserRouter>
  );
}
