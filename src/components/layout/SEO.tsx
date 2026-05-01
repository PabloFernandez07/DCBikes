import { Helmet } from "react-helmet-async";

const SITE_NAME = "DC Bikes Cantabria";
const BASE_URL = "https://dcbikescantabria.es";
const DEFAULT_IMAGE = `${BASE_URL}/DC_Bikes_Sin_Fondo.png`;
const DEFAULT_DESCRIPTION =
  "Tu tienda de bicicletas en El Astillero, Cantabria. Venta, taller y asesoramiento profesional. Distribuidores oficiales Giant, Liv y Stevens.";

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: "website" | "article" | "product";
  noIndex?: boolean;
}

export function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  url = BASE_URL,
  type = "website",
  noIndex = false,
}: SEOProps) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;

  return (
    <Helmet>
      {/* Básico */}
      <html lang="es" />
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph */}
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:url" content={url} />
      <meta property="og:locale" content="es_ES" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {/* Local business */}
      <meta name="geo.region" content="ES-CB" />
      <meta name="geo.placename" content="El Astillero, Cantabria" />
    </Helmet>
  );
}
