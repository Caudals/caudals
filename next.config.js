/** @type {import('next').NextConfig} */
const nextConfig = {
  // Asegurar que las variables de entorno estén disponibles en el cliente
  serverExternalPackages: ['stripe'],
  env: {
    // Asegurar que las variables de entorno estén disponibles
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
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