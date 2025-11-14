"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/provider";
import { Loader2, UploadCloud } from "lucide-react";

interface SubmissionWithDataset {
  id: string;
  created_at: string;
  status: "pending" | "approved" | "rejected";
  notes?: string | null;
  dataset_request_id: string;
  dataset_requests?: {
    id: string;
    title: string;
    reward_amount: number;
    currency: string;
  };
}

interface PwaSubmissionsClientProps {
  initialSubmissions: SubmissionWithDataset[];
}

const statusColors: Record<
  SubmissionWithDataset["status"],
  { label: string; className: string }
> = {
  pending: {
    label: "Pending review",
    className: "border-amber-200/70 bg-amber-400/20 text-amber-100",
  },
  approved: {
    label: "Approved",
    className: "border-emerald-200/70 bg-emerald-400/20 text-emerald-100",
  },
  rejected: {
    label: "Needs edits",
    className: "border-rose-200/70 bg-rose-400/20 text-rose-100",
  },
};

export function PwaSubmissionsClient({
  initialSubmissions,
}: PwaSubmissionsClientProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-white/70">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading your uploads...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center text-white">
        <UploadCloud className="mx-auto mb-3 h-10 w-10 text-white/70" />
        <h2 className="text-xl font-semibold">Sign in to sync uploads</h2>
        <p className="mt-2 text-sm text-white/70">
          Your submissions and rewards live on your Caudals contributor account.
        </p>
        <Button asChild className="mt-4 rounded-2xl bg-white text-slate-900">
          <Link href="/auth/login">Open sign-in</Link>
        </Button>
      </div>
    );
  }

  if (!initialSubmissions.length) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center text-white">
        <h2 className="text-xl font-semibold">No uploads yet</h2>
        <p className="mt-2 text-sm text-white/70">
          Start with any brief from the browse tab. You can sync drafts even
          when offline.
        </p>
        <Button asChild className="mt-4 rounded-2xl bg-white text-slate-900">
          <Link href="/pwa">Find a dataset</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {initialSubmissions.map((submission) => {
        const dataset = submission.dataset_requests;

        const rewardAmount = dataset?.reward_amount ?? 0;
        const rewardCurrency = dataset?.currency ?? "USD";

        return (
          <article
            key={submission.id}
            className="rounded-3xl border border-white/10 bg-white/5 p-4 text-white"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/50">
                  {rewardCurrency} {rewardAmount.toFixed(2)} reward
                </p>
                <h3 className="text-lg font-semibold">
                  {dataset?.title ?? "Dataset brief"}
                </h3>
              </div>
              <Badge className={statusColors[submission.status].className}>
                {statusColors[submission.status].label}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-white/60">
              Uploaded on{" "}
              {new Date(submission.created_at).toLocaleDateString()}
            </p>
            {submission.notes && (
              <div className="mt-3 rounded-2xl border border-white/15 bg-black/10 px-3 py-2 text-sm text-white/80">
                {submission.notes}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              {dataset?.id && (
                <Link
                  href={`/pwa/datasets/${dataset.id}`}
                  className="flex-1 rounded-2xl border border-white/15 px-3 py-2 text-center text-sm text-white hover:bg-white/10"
                >
                  View brief
                </Link>
              )}
              <Link
                href="/pwa"
                className="flex-1 rounded-2xl border border-white/15 px-3 py-2 text-center text-sm text-white hover:bg-white/10"
              >
                Upload again
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}
