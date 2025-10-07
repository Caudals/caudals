import { NextRequest, NextResponse } from 'next/server';
import { createPaymentIntent } from '@/lib/actions/payment-actions';

export async function POST(request: NextRequest) {
  // Solo permitir en desarrollo
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }

  try {
    const { datasetId, amount } = await request.json();
    
    console.log('Debug: Testing createPaymentIntent with:', { datasetId, amount });
    
    const result = await createPaymentIntent(datasetId || 'wallet-funding', amount || 10);
    
    console.log('Debug: createPaymentIntent result:', result);
    
    return NextResponse.json({
      success: !result.error,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error: unknown) {
    console.error('Debug: Error in payment test:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
