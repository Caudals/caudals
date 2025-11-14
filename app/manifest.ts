import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Caudals Companion",
    short_name: "Caudals Go",
    description:
      "Mobile companion experience for Caudals contributors to discover dataset requests and upload samples on the go.",
    start_url: "/pwa",
    scope: "/pwa",
    display: "standalone",
    background_color: "#0A0E1E",
    theme_color: "#0A0E1E",
    orientation: "portrait",
    lang: "en",
    categories: ["productivity", "business"],
    icons: [
      {
        src: "/pwa-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icon-512.png",
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
        name: "Browse Requests",
        url: "/pwa",
        description: "Jump straight into the dataset marketplace",
      },
      {
        name: "My Uploads",
        url: "/pwa/submissions",
        description: "Review your pending and approved submissions",
      },
    ],
  };
}
