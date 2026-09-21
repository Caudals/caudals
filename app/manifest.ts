import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Caudals",
    short_name: "Caudals",
    description:
      "Evaluación independiente de asistentes y agentes de IA, con conjuntos de pruebas validados por expertos de dominio.",
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
        description: "Solicita un Diagnóstico inicial gratuito o una evaluación de tu asistente de IA",
      },
    ],
  };
}
