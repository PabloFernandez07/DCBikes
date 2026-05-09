import { Helmet } from "react-helmet-async";

const SITE_NAME = "DC Bikes Cantabria";
const BASE_URL = "https://dc-bikes-cantabria.vercel.app";
const DEFAULT_IMAGE = `${BASE_URL}/DC_Bikes_Sin_Fondo.png`;
const DEFAULT_IMAGE_ALT = "DC Bikes Cantabria — Tienda de bicicletas en El Astillero";
const DEFAULT_DESCRIPTION =
  "Tu tienda de bicicletas en El Astillero, Cantabria. Venta, taller y asesoramiento profesional. Distribuidores oficiales Giant, Liv y Stevens.";

interface BreadcrumbItem {
  name: string;
  url: string;
}

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  imageAlt?: string;
  url?: string;
  type?: "website" | "article" | "product";
  noIndex?: boolean;
  breadcrumbs?: BreadcrumbItem[];
  jsonLd?: Record<string, unknown>;
}

export function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  imageAlt = DEFAULT_IMAGE_ALT,
  url = BASE_URL,
  type = "website",
  noIndex = false,
  breadcrumbs,
  jsonLd,
}: SEOProps) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;

  const breadcrumbSchema =
    breadcrumbs && breadcrumbs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: breadcrumbs.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.name,
            item: item.url,
          })),
        }
      : null;

  return (
    <Helmet>
      {/* Básico */}
      <html lang="es" />
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}

      {/* Geolocalización */}
      <meta name="geo.region" content="ES-CB" />
      <meta name="geo.placename" content="El Astillero, Cantabria" />
      <meta name="geo.position" content="43.3985;-3.8182" />
      <meta name="ICBM" content="43.3985, -3.8182" />

      {/* Open Graph */}
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={imageAlt} />
      <meta property="og:url" content={url} />
      <meta property="og:locale" content="es_ES" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@dcbikescantabria" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:image:alt" content={imageAlt} />

      {/* BreadcrumbList JSON-LD */}
      {breadcrumbSchema && (
        <script type="application/ld+json">
          {JSON.stringify(breadcrumbSchema)}
        </script>
      )}

      {/* JSON-LD personalizado por página */}
      {jsonLd && (
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      )}
    </Helmet>
  );
}
