"use client";

import Image from "next/image";
import Link from "next/link";

import { Dataset } from "@/types/dataset";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { categoryLabels, statusLabels } from "@/lib/data/datasets";
import { CheckCircle2, Clock, DollarSign, Users } from "lucide-react";

import { useTranslations } from "@/lib/i18n/use-translations";

interface DatasetCardProps {
  dataset: Dataset;
}

const statusStyles: Record<Dataset["status"], string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200/50",
  "closing-soon": "bg-amber-50 text-amber-700 border-amber-200/50",
  completed: "bg-blue-50 text-blue-700 border-blue-200/50",
  paused: "bg-gray-100 text-gray-600 border-gray-200/50",
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
      href={`/browse/${dataset.id}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl bg-background border border-border/80 transition-all duration-300 hover:border-foreground/30 hover:bg-muted/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={dataset.title}
    >
      {/* Image Section */}
      <div className="relative block overflow-hidden border-b border-slate-200 p-2 pb-0">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted">
          <Image
            src={dataset.imageUrl}
            alt={dataset.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {/* Badges overlay on image */}
          <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2">
            <Badge
              className={cn(
                "text-[10px] uppercase tracking-wider font-semibold shadow-none border",
                statusStyles[dataset.status]
              )}
            >
              {t(statusLabels[dataset.status])}
            </Badge>
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider font-semibold shadow-none bg-background/90 backdrop-blur-sm">
              {t(categoryLabels[dataset.category])}
            </Badge>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-1 flex-col gap-3">
          {/* Title */}
          <div className="min-h-[2.5rem]">
            <h3 className="line-clamp-2 text-base font-semibold leading-snug text-foreground transition-colors">
              {dataset.title}
            </h3>
          </div>

          {/* Description */}
          <div className="min-h-[4rem]">
            <p className="line-clamp-3 text-sm text-slate-500 leading-relaxed">
              {dataset.description}
            </p>
          </div>

          {/* Organization */}
          <div className="flex items-center gap-2 mt-auto pt-3">
            <Avatar className="h-6 w-6 border border-slate-200">
              {dataset.organization.avatar ? (
                <AvatarImage src={dataset.organization.avatar} />
              ) : null}
              <AvatarFallback className="text-[10px] bg-muted/50 text-foreground font-medium">
                {dataset.organization.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex items-center gap-1 text-sm">
              <span className="font-medium text-foreground text-xs">
                {dataset.organization.name}
              </span>
              {dataset.organization.verified && (
                <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent)]" />
              )}
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5 bg-emerald-50/50 px-2 py-1 rounded-md border border-emerald-100">
            <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
            <span className="font-bold text-emerald-700 text-xs">
              {rewardDisplay}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-slate-500">
              <Users className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{contributorDisplay}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500">
              <Clock className="h-3.5 w-3.5" />
              <span
                className={cn(
                  "text-xs font-medium",
                  isExpired ? "text-destructive" : ""
                )}
              >
                {deadlineLabel}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
