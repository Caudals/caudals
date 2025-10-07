import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  // Solo permitir en desarrollo
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }

  try {
    const supabase = await createClient();
    const adminSupabase = createAdminClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ 
        error: 'Not authenticated',
        userError: userError?.message 
      }, { status: 401 });
    }

    // Check if user has a profile
    const { data: profile, error: profileError } = await adminSupabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    // Check if user has a wallet
    const { data: wallet, error: walletError } = await adminSupabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Get user's transactions
    const { data: transactions, error: transactionsError } = await adminSupabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    // Count total transactions by type
    const { data: transactionStats, error: statsError } = await adminSupabase
      .from('transactions')
      .select('type, status, amount')
      .eq('user_id', user.id);

    const stats = transactionStats?.reduce((acc, t) => {
      const key = `${t.type}_${t.status}`;
      if (!acc[key]) acc[key] = { count: 0, total: 0 };
      acc[key].count++;
      acc[key].total += t.amount;
      return acc;
    }, {} as Record<string, { count: number; total: number }>);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
      },
      profile: profile || null,
      profileError: profileError?.message,
      wallet: wallet || null,
      walletError: walletError?.message,
      transactions: transactions || [],
      transactionsError: transactionsError?.message,
      transactionStats: stats || {},
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Debug wallet error:', error);
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
