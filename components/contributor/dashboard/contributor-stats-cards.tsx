"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "@/lib/i18n/use-translations";

interface ContributorStats {
  totalEarnings: number;
  totalSubmissions: number;
  approvedSubmissions: number;
  pendingSubmissions: number;
  activeProjects: number;
  averageEarning: number;
}

export function ContributorStatsCards() {
  const [stats, setStats] = useState<ContributorStats>({
    totalEarnings: 0,
    totalSubmissions: 0,
    approvedSubmissions: 0,
    pendingSubmissions: 0,
    activeProjects: 0,
    averageEarning: 0,
  });
  const [loading, setLoading] = useState(true);
  const t = useTranslations();

  useEffect(() => {
    async function fetchStats() {
      const supabase = createClient();

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        // Get user's submissions
        const { data: submissions } = await supabase
          .from("submissions")
          .select(
            `
            *,
            dataset_requests (
              reward_amount,
              status
            )
          `
          )
          .eq("contributor_id", user.id);

        if (submissions) {
          const approvedSubmissions = submissions.filter(
            (s) => s.status === "approved"
          );
          const pendingSubmissions = submissions.filter(
            (s) => s.status === "pending"
          );
          const totalEarnings = approvedSubmissions.reduce(
            (sum, s) => sum + (s.dataset_requests?.reward_amount || 0),
            0
          );
          const activeProjects = new Set(
            submissions.map((s) => s.dataset_request_id)
          ).size;
          const averageEarning =
            approvedSubmissions.length > 0
              ? totalEarnings / approvedSubmissions.length
              : 0;

          setStats({
            totalEarnings,
            totalSubmissions: submissions.length,
            approvedSubmissions: approvedSubmissions.length,
            pendingSubmissions: pendingSubmissions.length,
            activeProjects,
            averageEarning,
          });
        }
      } catch (error) {
        console.error("Error fetching contributor stats:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  const approvalRate = stats.totalSubmissions > 0 
    ? Math.round((stats.approvedSubmissions / stats.totalSubmissions) * 100) 
    : 0;

  if (loading) {
    return (
      <div className="w-full flex items-center justify-between border border-slate-200 bg-white rounded-2xl p-6">
        <div className="h-10 w-32 bg-muted/40 animate-pulse rounded" />
        <div className="h-10 w-24 bg-muted/40 animate-pulse rounded" />
        <div className="h-10 w-24 bg-muted/40 animate-pulse rounded" />
        <div className="h-10 w-24 bg-muted/40 animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between border border-slate-200 bg-white rounded-2xl p-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 mb-6">
      <div className="flex-1 pr-6 pb-4 sm:pb-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("Net Earnings")}</span>
        </div>
        <div className="flex items-end gap-3">
          <span className="text-4xl font-bold text-slate-900 tracking-tight">${(stats.totalEarnings * 0.9).toFixed(2)}</span>
        </div>
      </div>
      
      <div className="flex-1 sm:px-6 py-4 sm:py-0">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">{t("Quality Rate")}</span>
        <span className="text-2xl font-bold text-slate-900 tracking-tight">{approvalRate}%</span>
        <p className="text-xs text-slate-400 mt-1">{stats.approvedSubmissions} {t("approved")}</p>
      </div>

      <div className="flex-1 sm:px-6 py-4 sm:py-0">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">{t("Pending")}</span>
        <span className="text-2xl font-bold text-amber-600 tracking-tight">{stats.pendingSubmissions}</span>
        <p className="text-xs text-slate-400 mt-1">{t("Awaiting review")}</p>
      </div>

      <div className="flex-1 sm:pl-6 pt-4 sm:pt-0">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">{t("Avg. Payout")}</span>
        <span className="text-2xl font-bold text-slate-900 tracking-tight">${stats.averageEarning.toFixed(2)}</span>
        <p className="text-xs text-slate-400 mt-1">{t("Per approved")}</p>
      </div>
    </div>
  );
}