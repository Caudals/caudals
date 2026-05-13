import type { MetadataRoute } from "next";
import { isLandingModeEnabledServer } from "@/lib/landing-mode";
import { buildMarketingUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const disallow = [
    "/admin/",
    "/api/",
    "/auth/",
    "/contributor/",
    "/dashboard/",
    "/pwa/",
    "/requester/",
    "/*?topic=*",
  ];

  if (isLandingModeEnabledServer()) {
    disallow.push(
      "/about",
      "/browse",
      "/careers",
      "/docs",
      "/legal/",
      "/pricing",
      "/trust"
    );
  }

  return {
    rules: {
      userAgent: "*",
      allow: [
        "/",
        "/blog/",
        "/catalogue",
        "/contact",
        "/robots.txt",
        "/security",
        "/sitemap.xml",
      ],
      disallow,
    },
    sitemap: buildMarketingUrl("/sitemap.xml"),
  };
}
