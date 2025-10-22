import type { NextConfig } from "next";

const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const imageDomains = ["images.unsplash.com"];

if (supabaseHostname) {
  imageDomains.push(supabaseHostname);
}

const nextConfig: NextConfig = {
  images: {
    domains: imageDomains,
  },
};

export default nextConfig;
