/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Asegurar que las variables de entorno estén disponibles en el cliente
    serverComponentsExternalPackages: ['stripe'],
  },
  env: {
    // Asegurar que las variables de entorno estén disponibles
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  },
  // Configuración para optimizar la carga de Stripe
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Asegurar que Stripe se carga correctamente en el cliente
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
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