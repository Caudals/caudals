import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Caudals",
    short_name: "Caudals",
    description:
      "B2B marketplace and managed services layer for AI-ready training datasets.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#050914",
    orientation: "portrait",
    lang: "en",
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
        name: "Contact Caudals",
        url: "/contact",
        description: "Start a buyer or supplier conversation",
      },
      {
        name: "Read the Blog",
        url: "/blog",
        description: "Read Caudals updates and operating notes",
      },
    ],
  };
}
