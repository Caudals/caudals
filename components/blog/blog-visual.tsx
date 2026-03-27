import { cn } from "@/lib/utils";
import type { BlogCoverVariant } from "@/lib/blog/types";

const visualVariants: Record<BlogCoverVariant, string> = {
  signal:
    "bg-[radial-gradient(circle_at_top_left,rgba(5,150,105,0.16),transparent_38%),linear-gradient(145deg,#ffffff_0%,#f7faf9_52%,#eefbf5_100%)]",
  grid:
    "bg-[radial-gradient(circle_at_top_right,rgba(148,163,184,0.18),transparent_32%),linear-gradient(180deg,#ffffff_0%,#f8fafc_50%,#f1f5f9_100%)]",
  ledger:
    "bg-[radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.14),transparent_30%),linear-gradient(145deg,#ffffff_0%,#f8fafc_42%,#f0fdf4_100%)]",
};

type BlogPostVisualProps = {
  category: string;
  className?: string;
  variant: BlogCoverVariant;
};

export function BlogPostVisual({
  category,
  className,
  variant,
}: BlogPostVisualProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden border border-slate-200/80",
        visualVariants[variant],
        className,
      )}
    >
      <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(to_right,rgba(148,163,184,0.11)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.11)_1px,transparent_1px)] [background-size:36px_36px]" />
      <div className="absolute -left-6 top-8 h-24 w-24 rounded-full border border-emerald-200/80 bg-white/70" />
      <div className="absolute right-8 top-10 h-14 w-24 rounded-full border border-slate-200/80 bg-white/80" />
      <div className="absolute left-[18%] top-[42%] h-px w-[64%] bg-slate-300/80" />
      <div className="absolute left-[18%] top-[42%] h-3 w-3 -translate-y-1/2 rounded-full bg-emerald-500" />
      <div className="absolute right-[18%] top-[42%] h-3 w-3 -translate-y-1/2 rounded-full bg-slate-400" />
      <div className="absolute bottom-6 left-6 right-6 rounded-2xl border border-white/80 bg-white/88 p-4 backdrop-blur-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-700">
          {category}
        </p>
        <div className="mt-3 space-y-2">
          <div className="h-2.5 w-2/3 rounded-full bg-slate-900/90" />
          <div className="h-2.5 w-full rounded-full bg-slate-300/80" />
          <div className="h-2.5 w-4/5 rounded-full bg-slate-300/70" />
        </div>
      </div>
    </div>
  );
}
