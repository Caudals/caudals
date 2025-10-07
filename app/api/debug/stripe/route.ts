import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  // Solo permitir en desarrollo o con autenticación especial
  const isDevelopment = process.env.NODE_ENV === 'development';
  const authHeader = request.headers.get('authorization');
  const isAuthorized = authHeader === `Bearer ${process.env.DEBUG_TOKEN}`;

  if (!isDevelopment && !isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  const diagnostics = {
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    variables: {
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: {
        exists: !!publishableKey,
        format: publishableKey ? (publishableKey.startsWith('pk_') ? 'valid' : 'invalid') : 'missing',
        length: publishableKey?.length || 0,
        preview: publishableKey ? `${publishableKey.substring(0, 8)}...${publishableKey.substring(publishableKey.length - 4)}` : null
      },
      STRIPE_SECRET_KEY: {
        exists: !!secretKey,
        format: secretKey ? (secretKey.startsWith('sk_') ? 'valid' : 'invalid') : 'missing',
        length: secretKey?.length || 0,
        preview: secretKey ? `${secretKey.substring(0, 8)}...${secretKey.substring(secretKey.length - 4)}` : null
      },
      STRIPE_WEBHOOK_SECRET: {
        exists: !!webhookSecret,
        format: webhookSecret ? (webhookSecret.startsWith('whsec_') ? 'valid' : 'invalid') : 'missing',
        length: webhookSecret?.length || 0,
        preview: webhookSecret ? `${webhookSecret.substring(0, 8)}...${webhookSecret.substring(webhookSecret.length - 4)}` : null
      }
    },
    clientSide: {
      userAgent: request.headers.get('user-agent'),
      origin: request.headers.get('origin'),
      referer: request.headers.get('referer')
    },
    recommendations: []
  };

  // Generar recomendaciones
  if (!publishableKey) {
    diagnostics.recommendations.push('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing');
  } else if (!publishableKey.startsWith('pk_')) {
    diagnostics.recommendations.push('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY has invalid format');
  }

  if (!secretKey) {
    diagnostics.recommendations.push('STRIPE_SECRET_KEY is missing');
  } else if (!secretKey.startsWith('sk_')) {
    diagnostics.recommendations.push('STRIPE_SECRET_KEY has invalid format');
  }

  if (!webhookSecret) {
    diagnostics.recommendations.push('STRIPE_WEBHOOK_SECRET is missing');
  } else if (!webhookSecret.startsWith('whsec_')) {
    diagnostics.recommendations.push('STRIPE_WEBHOOK_SECRET has invalid format');
  }

  if (publishableKey && secretKey) {
    const isTestMode = publishableKey.includes('_test_') && secretKey.includes('_test_');
    const isLiveMode = publishableKey.includes('_live_') && secretKey.includes('_live_');
    
    if (!isTestMode && !isLiveMode) {
      diagnostics.recommendations.push('Publishable and secret keys appear to be from different modes (test vs live)');
    }
  }

  return NextResponse.json(diagnostics, { 
    status: 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
}