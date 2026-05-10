"use client";

import Image from "next/image";
import Link from "next/link";

import { Dataset } from "@/types/dataset";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { categoryLabels, statusLabels } from "@/lib/data/datasets";
import { CheckCircle2, Clock, Database, Users } from "lucide-react";

import { useTranslations } from "@/lib/i18n/use-translations";

interface DatasetCardProps {
  dataset: Dataset;
}

const statusStyles: Record<Dataset["status"], string> = {
  active: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  "closing-soon": "bg-amber-50 text-amber-700 hover:bg-amber-100",
  completed: "bg-blue-50 text-blue-700 hover:bg-blue-100",
  paused: "bg-slate-100 text-slate-700 hover:bg-slate-200",
};

export function DatasetCardImproved({ dataset }: DatasetCardProps) {
  const t = useTranslations();

  const daysUntilDeadline = Math.ceil(
    (new Date(dataset.deadline).getTime() - new Date().getTime()) /
      (1000 * 60 * 60 * 24)
  );

  const isExpired = daysUntilDeadline <= 0;

  const deadlineLabel = isExpired
    ? t("Expired")
    : t("{{days}}d left", { days: daysUntilDeadline });

  const rewardDisplay = `$${dataset.rewardAmount.toLocaleString(undefined, {
    minimumFractionDigits: dataset.rewardAmount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: dataset.rewardAmount % 1 === 0 ? 0 : 2,
  })}`;

  const contributorDisplay = dataset.activeContributors.toLocaleString();

  return (
    <Link
      href={`/contributor/browse?dataset=${encodeURIComponent(dataset.id)}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-xl bg-white border border-slate-200 shadow-sm transition-all duration-200 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
      aria-label={dataset.title}
    >
      {/* Image Section */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-50 border-b border-slate-100">
        <Image
          src={dataset.imageUrl}
          alt={dataset.title}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>

      {/* Content Section */}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-2 mb-3">
          <Badge
            className={cn(
              "text-[11px] font-medium tracking-wide shadow-none border-0 px-2 py-0.5",
              statusStyles[dataset.status]
            )}
          >
            {t(statusLabels[dataset.status])}
          </Badge>
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
            {t(categoryLabels[dataset.category])}
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-2">
          {/* Title */}
          <h3 className="line-clamp-2 text-base font-semibold leading-tight text-slate-900">
            {dataset.title}
          </h3>

          {/* Description */}
          <p className="line-clamp-2 text-sm text-slate-500 leading-relaxed">
            {dataset.description}
          </p>
        </div>

        {/* Organization & Metrics */}
        <div className="mt-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Avatar className="h-5 w-5 rounded-md border border-slate-200">
              {dataset.organization.avatar ? (
                <AvatarImage src={dataset.organization.avatar} className="object-cover" />
              ) : null}
              <AvatarFallback className="rounded-md text-[9px] bg-slate-100 text-slate-600 font-medium">
                {dataset.organization.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex items-center gap-1 text-sm">
              <span className="font-medium text-slate-700 text-xs">
                {dataset.organization.name}
              </span>
              {dataset.organization.verified && (
                <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <div className="flex items-center gap-4 text-slate-500">
              <div className="flex items-center gap-1.5" title={t("Contributors")}>
                <Users className="h-4 w-4" />
                <span className="text-xs font-medium">{contributorDisplay}</span>
              </div>
              <div className="flex items-center gap-1.5" title={t("Time remaining")}>
                <Clock className="h-4 w-4" />
                <span
                  className={cn(
                    "text-xs font-medium",
                    isExpired ? "text-red-600" : ""
                  )}
                >
                  {deadlineLabel}
                </span>
              </div>
            </div>
            
            <div className="font-semibold text-slate-900 text-sm">
              {rewardDisplay}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
