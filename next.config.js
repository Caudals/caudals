/** @type {import('next').NextConfig} */
const { withSentryConfig } = require("@sentry/nextjs");

const remotePatterns = [
  { protocol: "https", hostname: "images.unsplash.com" },
];

const isDev = process.env.NODE_ENV !== "production";
const sentrySourceMapUploadEnabled =
  process.env.SENTRY_SOURCE_MAP_UPLOAD === "true" &&
  Boolean(process.env.SENTRY_AUTH_TOKEN);

const cspDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "media-src 'self' data: blob: https:",
  [
    "script-src 'self' 'unsafe-inline' blob: data:",
    isDev ? "'unsafe-eval'" : "",
    "https://analytics.caudals.com",
    "https://va.vercel-scripts.com",
    "https://app.cal.com",
    "https://unpkg.com",
    "https://elevenlabs.io",
    "https://cdn.jsdelivr.net",
  ]
    .filter(Boolean)
    .join(" "),
  [
    "connect-src 'self' https:",
    isDev ? "http: ws: wss:" : "wss:",
  ].join(" "),
  [
    "frame-src 'self'",
    "https://www.youtube.com",
    "https://www.youtube-nocookie.com",
    "https://cal.com",
    "https://app.cal.com",
    "https://elevenlabs.io",
  ].join(" "),
  "worker-src 'self' blob: data: https://cdn.jsdelivr.net",
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
      "camera=(), microphone=(self), geolocation=(), browsing-topics=(), interest-cohort=()",
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

module.exports = withSentryConfig(nextConfig, {
  org: "caudals",
  project: "javascript-nextjs",
  silent: !process.env.CI,
  sourcemaps: {
    disable: !sentrySourceMapUploadEnabled,
  },
  release: {
    create: sentrySourceMapUploadEnabled,
    finalize: sentrySourceMapUploadEnabled,
  },
  telemetry: false,
  widenClientFileUpload: sentrySourceMapUploadEnabled,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
