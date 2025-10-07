import { useState, useEffect } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';

interface UseStripeResult {
  stripe: Stripe | null;
  loading: boolean;
  error: string | null;
}

export function useStripe(): UseStripeResult {
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initStripe = async () => {
      try {
        setLoading(true);
        setError(null);

        const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
        
        if (!publishableKey) {
          throw new Error('Stripe publishable key is not configured');
        }

        // Verificar que la clave tiene el formato correcto
        if (!publishableKey.startsWith('pk_')) {
          throw new Error('Invalid Stripe publishable key format');
        }

        // Verificar que estamos en el cliente
        if (typeof window === 'undefined') {
          throw new Error('Stripe can only be loaded on the client side');
        }

        const stripeInstance = await loadStripe(publishableKey);
        
        if (!stripeInstance) {
          throw new Error('Failed to load Stripe');
        }

        setStripe(stripeInstance);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load Stripe';
        console.error('Error loading Stripe:', err);
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    initStripe();
  }, []);

  return { stripe, loading, error };
}