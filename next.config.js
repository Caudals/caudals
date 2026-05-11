/** @type {import('next').NextConfig} */
const remotePatterns = [
  { protocol: "https", hostname: "images.unsplash.com" },
];

const isDev = process.env.NODE_ENV !== "production";
const landingModePublicFlag =
  process.env.NEXT_PUBLIC_LANDING_MODE ?? process.env.LANDING_MODE ?? "false";

const cspDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "media-src 'self' data: blob:",
  [
    "script-src 'self' 'unsafe-inline'",
    isDev ? "'unsafe-eval'" : "",
    "https://analytics.caudals.com",
    "https://va.vercel-scripts.com",
    "https://js.stripe.com",
  ]
    .filter(Boolean)
    .join(" "),
  [
    "connect-src 'self' https:",
    isDev ? "http: ws: wss:" : "wss:",
  ].join(" "),
  [
    "frame-src 'self'",
    "https://js.stripe.com",
    "https://hooks.stripe.com",
    "https://www.youtube.com",
    "https://www.youtube-nocookie.com",
  ].join(" "),
  "worker-src 'self' blob:",
  ...(!isDev ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: cspDirectives,
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "off",
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
];

const nextConfig = {
  env: {
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_LANDING_MODE: landingModePublicFlag,
  },
  images: {
    remotePatterns,
    unoptimized: true, // Required for self-hosting (Dokploy) - images are served directly without optimization
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
