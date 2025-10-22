/** @type {import('next').NextConfig} */
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const imageDomains = ["images.unsplash.com"];

if (supabaseHostname) {
  imageDomains.push(supabaseHostname);
}

const nextConfig = {
  // Asegurar que las variables de entorno estén disponibles en el cliente
  serverExternalPackages: ['stripe'],
  env: {
    // Asegurar que las variables de entorno estén disponibles
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  },
  images: {
    domains: imageDomains,
  },
  // Configuración para optimizar la carga de Stripe
  // Nota: Webpack config removido para compatibilidad con Turbopack
  // Headers para mejorar la seguridad y compatibilidad
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
