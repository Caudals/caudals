import Link from "next/link";
import { ArrowRight, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CTASection() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-8 py-16 text-white shadow-2xl sm:px-16 lg:px-24">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 rounded-full bg-primary/20 blur-[140px]" />
          <div className="relative z-10 flex flex-col items-center gap-6 text-center">
            <span className="rounded-full bg-white/10 px-4 py-1 text-xs font-semibold uppercase text-primary/80">
              Let&apos;s collaborate
            </span>
            <h2 className="text-3xl font-semibold sm:text-4xl lg:text-[2.9rem]">
              Ready to launch your next dataset or partnerships program?
            </h2>
            <p className="max-w-2xl text-base text-slate-200">
              Partner with Caudals to design contributor workflows, run responsible
              collection campaigns, and pay teams automatically. Start with a discovery call
              or jump directly into the dashboard.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Button size="lg" className="h-12 min-w-[200px]" asChild>
                <Link href="/dashboard/requests/new">
                  Start collecting data
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 min-w-[200px] border-white/30 bg-transparent text-white hover:bg-white/10"
                asChild
              >
                <Link href="/browse">See live opportunities</Link>
              </Button>
            </div>
            <div className="mt-4 flex flex-col gap-4 text-sm text-slate-200 sm:flex-row sm:items-center sm:gap-8">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary/70" />
                <span>Payment and compliance rails built in</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                <span>Dedicated human support in every time zone</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
