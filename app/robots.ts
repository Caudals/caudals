import type { MetadataRoute } from "next";
import { buildMarketingUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const disallow = [
    "/admin",
    "/api/",
    "/auth",
    "/contributor",
    "/dashboard",
    // Internal renderer behind Accept: text/markdown negotiation. Agents reach
    // it via the canonical URLs, so it must not be crawled directly.
    "/markdown-for-agents",
    "/pwa",
    "/requester",
    "/*?topic=*",
  ];

  // These explicit groups counter managed bot-specific rules that some edge
  // providers prepend to robots.txt. Public content is crawlable; private and
  // route-only product surfaces remain excluded.
  const aiCrawlerUserAgents = [
    "Amazonbot",
    "Applebot-Extended",
    "Bytespider",
    "CCBot",
    "ChatGPT-User",
    "ClaudeBot",
    "Claude-SearchBot",
    "Claude-User",
    "cohere-ai",
    "Google-Extended",
    "GPTBot",
    "meta-externalagent",
    "OAI-SearchBot",
    "PerplexityBot",
    "Perplexity-User",
  ];

  return {
    rules: {
      userAgent: ["*", ...aiCrawlerUserAgents],
      allow: "/",
      disallow,
    },
    sitemap: buildMarketingUrl("/sitemap.xml"),
  };
}
