import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { Nav } from "@/components/layout/Nav";
import { Footer } from "@/components/layout/Footer";
import { CookieBanner } from "@/components/layout/CookieBanner";

const Home         = lazy(() => import("@/pages/public/Home"));
const Catalog      = lazy(() => import("@/pages/public/Catalog"));
const ProductDetail = lazy(() => import("@/pages/public/ProductDetail"));
const Workshop     = lazy(() => import("@/pages/public/Workshop"));
const Contact      = lazy(() => import("@/pages/public/Contact"));
const CookiePolicy = lazy(() => import("@/pages/public/CookiePolicy"));
const PrivacyPolicy = lazy(() => import("@/pages/public/PrivacyPolicy"));
const LegalNotice  = lazy(() => import("@/pages/public/LegalNotice"));
const NotFound     = lazy(() => import("@/pages/public/NotFound"));
const AdminRoutes  = lazy(() =>
  import("@/routes/AdminRoutes").then((m) => ({ default: m.AdminRoutes }))
);

function SplashScreen({ onDone }: { onDone: () => void }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // t1: el contenido se desvanece
    const t1 = setTimeout(() => setExiting(true), 2200);
    // t2: la cortina ya subió, desmontamos
    const t2 = setTimeout(onDone, 3700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone]);

  return (
    /*
     * Capa exterior: es la "cortina" que sube (translateY -100%)
     * con un cubic-bezier de aceleración cinematográfica.
     * El delay de 0.35s permite que el contenido se desvanezca primero.
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
          ? "transform 1.1s cubic-bezier(0.76, 0, 0.24, 1) 0.35s"
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
            ? "opacity 0.4s ease, transform 0.45s ease"
            : "none",
        }}
      >
        {/* Anillo giratorio */}
        <div style={{ position: "relative", width: 148, height: 148 }}>
          <img
            src="/DC_Bikes_Giratorio.png"
            alt=""
            aria-hidden="true"
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
            animation: "fadeUp 0.5s ease forwards 0.3s",
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
            animation: "fadeUp 0.5s ease forwards 0.4s",
            opacity: 0,
          }}
        >
          El Astillero · Cantabria
        </p>
      </div>
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

export default function App() {
  useTheme();
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashDone = useCallback(() => setSplashDone(true), []);

  return (
    <BrowserRouter>
      <ScrollToTop />
      {!splashDone && <SplashScreen onDone={handleSplashDone} />}
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
        <Route path="/admin/*" element={<AdminRoutes />} />
        <Route path="*" element={<PublicLayout><NotFound /></PublicLayout>} />
      </Routes>
      </Suspense>
      <CookieBanner />
    </BrowserRouter>
  );
}
