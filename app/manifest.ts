import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Caudals",
    short_name: "Caudals",
    description:
      "Marketplace B2B y servicio gestionado de datasets listos para entrenar y evaluar modelos de inteligencia artificial.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#050914",
    orientation: "portrait",
    lang: "es",
    categories: ["productivity", "business"],
    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Contactar con Caudals",
        url: "/contact",
        description: "Solicita un dataset o propón datos para monetización",
      },
      {
        name: "Leer el blog",
        url: "/blog",
        description: "Guías de Caudals sobre inteligencia artificial y operaciones de datasets",
      },
    ],
  };
}
