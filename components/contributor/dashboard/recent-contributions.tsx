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
        return <div className="h-10 w-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center"><CheckCircle className="h-5 w-5 text-emerald-600" /></div>;
      case 'rejected':
        return <div className="h-10 w-10 rounded-full bg-red-50 border border-red-100 flex items-center justify-center"><XCircle className="h-5 w-5 text-red-600" /></div>;
      default:
        return <div className="h-10 w-10 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center"><Clock className="h-5 w-5 text-amber-600" /></div>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <Badge variant="secondary" className="shadow-none bg-emerald-50 text-emerald-700 text-[10px] uppercase tracking-wider px-2 border border-emerald-200/50">{t("Approved")}</Badge>
        );
      case 'rejected':
        return (
          <Badge variant="secondary" className="shadow-none bg-red-50 text-red-700 text-[10px] uppercase tracking-wider px-2 border border-red-200/50">{t("Rejected")}</Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="shadow-none bg-amber-50 text-amber-700 text-[10px] uppercase tracking-wider px-2 border border-amber-200/50">{t("Pending")}</Badge>
        );
    }
  };

  if (loading) {
    return (
      <Card className="shadow-none border-border bg-background rounded-2xl">
        <CardHeader className="border-b border-slate-200 pb-4 mb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-5 w-5 text-slate-500" />
            {t("Recent Contributions")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-muted/40 animate-pulse rounded-xl" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-none border-border bg-background rounded-2xl">
      <CardHeader className="border-b border-slate-200 pb-4 mb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="h-5 w-5 text-slate-500" />
          {t("Recent Contributions")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {contributions.length > 0 ? (
          <>
            <div className="grid gap-3">
              {contributions.map((contribution) => (
                <div key={contribution.id} className="flex items-center justify-between p-4 border border-border/60 rounded-xl bg-muted/10 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-4">
                    {getStatusIcon(contribution.status)}
                    <div>
                      <div className="text-sm font-medium text-foreground line-clamp-1 max-w-[200px] md:max-w-md">
                        {contribution.dataset_requests.title}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                        <span className="bg-background border px-1.5 py-0.5 rounded text-[10px]">{contribution.dataset_requests.category}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(contribution.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="text-sm font-bold flex items-center text-foreground">
                      <DollarSign className="h-3.5 w-3.5 text-slate-500" />
                      {contribution.dataset_requests.reward_amount.toFixed(2)}
                    </div>
                    {getStatusBadge(contribution.status)}
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" className="w-full shadow-none rounded-xl h-10 mt-2" asChild>
              <Link href="/contributor/browse">
                <ExternalLink className="h-4 w-4 mr-2" />
                {t("Browse More Projects")}
              </Link>
            </Button>
          </>
        ) : (
            <div className="text-center py-10 rounded-xl border border-dashed border-border bg-muted/10">
              <Upload className="h-10 w-10 mx-auto mb-3 text-slate-500/30" />
            <p className="text-sm font-medium text-foreground">{t("No contributions yet")}</p>
            <p className="text-xs text-slate-500 mt-1">{t("Start contributing to datasets to see your activity here!")}</p>
            <Button variant="outline" className="mt-4 shadow-none rounded-lg" asChild>
              <Link href="/contributor/browse">
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
