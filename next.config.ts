import type { NextConfig } from "next";

const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const imageDomains = ["images.unsplash.com"];
const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  { protocol: "https", hostname: "images.unsplash.com" },
  { protocol: "https", hostname: "*.supabase.co" },
];

if (supabaseHostname && !imageDomains.includes(supabaseHostname)) {
  imageDomains.push(supabaseHostname);
  remotePatterns.push({ protocol: "https", hostname: supabaseHostname });
}

const nextConfig: NextConfig = {
  images: {
    domains: imageDomains,
    remotePatterns,
    unoptimized: true, // Required for self-hosting (Dokploy) - images are served directly without optimization
  },
  eslint: {
    ignoreDuringBuilds: true, // Allow build to proceed despite lint warnings
  },
};

export default nextConfig;
