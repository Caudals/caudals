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
      "/buyer",
      "/careers",
      "/catalogue",
      "/docs",
      "/legal/",
      "/pricing",
      "/security",
      "/supplier",
      "/trust",
      "/v1"
    );
  }

  return {
    rules: {
      userAgent: "*",
      allow: [
        "/",
        "/blog/",
        "/contact",
        "/robots.txt",
        "/sitemap.xml",
      ],
      disallow,
    },
    sitemap: buildMarketingUrl("/sitemap.xml"),
  };
}
