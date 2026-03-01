"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, 
  Clock, 
  CheckCircle, 
  XCircle,
  ExternalLink,
  Calendar,
  DollarSign
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "@/lib/i18n/use-translations";

interface Contribution {
  id: string;
  dataset_request_id: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
  notes: string | null;
  dataset_requests: {
    title: string;
    reward_amount: number;
    category: string;
    status: string;
  };
}

export function RecentContributions() {
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const t = useTranslations();

  useEffect(() => {
    async function fetchContributions() {
      const supabase = createClient();
      
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
          .from('submissions')
          .select(`
            *,
            dataset_requests (
              title,
              reward_amount,
              category,
              status
            )
          `)
          .eq('contributor_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5);

        if (data) {
          setContributions(data);
        }
      } catch (error) {
        console.error('Error fetching contributions:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchContributions();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <Badge className="bg-green-100 text-green-800">{t("Approved")}</Badge>
        );
      case 'rejected':
        return (
          <Badge className="bg-red-100 text-red-800">{t("Rejected")}</Badge>
        );
      default:
        return (
          <Badge className="bg-yellow-100 text-yellow-800">{t("Pending")}</Badge>
        );
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {t("Recent Contributions")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          {t("Recent Contributions")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {contributions.length > 0 ? (
          <>
            {contributions.map((contribution) => (
              <div key={contribution.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  {getStatusIcon(contribution.status)}
                  <div>
                    <div className="text-sm font-medium">
                      {contribution.dataset_requests.title}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{contribution.dataset_requests.category}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(contribution.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    {contribution.dataset_requests.reward_amount.toFixed(2)}
                  </div>
                  {getStatusBadge(contribution.status)}
                </div>
              </div>
            ))}
            <Button variant="outline" className="w-full" asChild>
              <Link href="/browse">
                <ExternalLink className="h-4 w-4 mr-2" />
                {t("Browse More Projects")}
              </Link>
            </Button>
          </>
        ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t("No contributions yet")}</p>
            <p className="text-xs">{t("Start contributing to datasets!")}</p>
            <Button variant="outline" className="mt-3" asChild>
              <Link href="/browse">
                <ExternalLink className="h-4 w-4 mr-2" />
                {t("Browse Projects")}
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
