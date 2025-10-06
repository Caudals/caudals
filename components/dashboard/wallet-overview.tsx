"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Wallet, 
  TrendingUp, 
  Download, 
  ExternalLink,
  DollarSign,
  Calendar
} from "lucide-react";
import Link from "next/link";

interface WalletData {
  totalBalance: number;
  pendingBalance: number;
  availableBalance: number;
  recentTransactions: Array<{
    id: string;
    amount: number;
    type: 'earned' | 'withdrawn';
    description: string;
    date: string;
    status: 'completed' | 'pending';
  }>;
}

export function WalletOverview() {
  const [walletData, setWalletData] = useState<WalletData>({
    totalBalance: 0,
    pendingBalance: 0,
    availableBalance: 0,
    recentTransactions: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchWalletData() {
      const supabase = createClient();
      
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get user's approved submissions to calculate earnings
        const { data: submissions } = await supabase
          .from('submissions')
          .select(`
            *,
            dataset_requests (
              title,
              reward_amount
            )
          `)
          .eq('contributor_id', user.id)
          .eq('status', 'approved');

        if (submissions) {
          const totalBalance = submissions.reduce((sum, s) => 
            sum + (s.dataset_requests?.reward_amount || 0), 0
          );

          // Get pending submissions
          const { data: pendingSubmissions } = await supabase
            .from('submissions')
            .select(`
              *,
              dataset_requests (
                title,
                reward_amount
              )
            `)
            .eq('contributor_id', user.id)
            .eq('status', 'pending');

          const pendingBalance = pendingSubmissions?.reduce((sum, s) => 
            sum + (s.dataset_requests?.reward_amount || 0), 0
          ) || 0;

          // Create recent transactions from submissions
          const recentTransactions = submissions.slice(0, 5).map(submission => ({
            id: submission.id,
            amount: submission.dataset_requests?.reward_amount || 0,
            type: 'earned' as const,
            description: `Earned from: ${submission.dataset_requests?.title || 'Unknown'}`,
            date: new Date(submission.created_at).toLocaleDateString(),
            status: 'completed' as const,
          }));

          setWalletData({
            totalBalance,
            pendingBalance,
            availableBalance: totalBalance,
            recentTransactions,
          });
        }
      } catch (error) {
        console.error('Error fetching wallet data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchWalletData();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Wallet Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-20 bg-muted animate-pulse rounded" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Wallet Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Balance Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              ${walletData.availableBalance.toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">Available</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">
              ${walletData.pendingBalance.toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">
              ${walletData.totalBalance.toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" disabled={walletData.availableBalance === 0}>
            <Download className="h-4 w-4 mr-2" />
            Withdraw
          </Button>
          <Button size="sm" variant="outline" className="flex-1" asChild>
            <Link href="/browse">
              <ExternalLink className="h-4 w-4 mr-2" />
              Find Projects
            </Link>
          </Button>
        </div>

        {/* Recent Transactions */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Recent Earnings</h4>
          {walletData.recentTransactions.length > 0 ? (
            <div className="space-y-2">
              {walletData.recentTransactions.map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-full">
                      <DollarSign className="h-4 w-4 text-green-600" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{transaction.description}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {transaction.date}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-green-600">
                      +${transaction.amount.toFixed(2)}
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {transaction.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No earnings yet</p>
              <p className="text-xs">Start contributing to earn rewards!</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
