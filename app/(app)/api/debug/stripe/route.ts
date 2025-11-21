import { NextResponse } from 'next/server';

export async function GET() {
  // Solo permitir en desarrollo
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }

  const envCheck = {
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: {
      exists: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      format: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith('pk_') ? 'correct' : 'incorrect',
      preview: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.substring(0, 8) + '...'
    },
    STRIPE_SECRET_KEY: {
      exists: !!process.env.STRIPE_SECRET_KEY,
      format: process.env.STRIPE_SECRET_KEY?.startsWith('sk_') ? 'correct' : 'incorrect',
      preview: process.env.STRIPE_SECRET_KEY?.substring(0, 8) + '...'
    },
    STRIPE_WEBHOOK_SECRET: {
      exists: !!process.env.STRIPE_WEBHOOK_SECRET,
      format: process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_') ? 'correct' : 'incorrect',
      preview: process.env.STRIPE_WEBHOOK_SECRET?.substring(0, 8) + '...'
    }
  };

  return NextResponse.json({
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    envCheck
  });
}