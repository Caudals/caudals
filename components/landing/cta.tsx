import Link from "next/link";
import { ArrowRight, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CTASection() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <div className="flex flex-col gap-6 rounded-[2.4rem] border border-border/80 bg-card px-8 py-12 text-center">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Next steps</p>
          <h2 className="text-3xl font-semibold text-foreground sm:text-4xl">
            Ready to co-build your dataset or partnerships program?
          </h2>
          <p className="mx-auto max-w-3xl text-base text-muted-foreground">
            Jump straight into the dashboard to post a blueprint or head to the Partnerships tab to
            co-design a custom engagement with Caudals Labs.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Button size="lg" className="h-12 min-w-[220px]" asChild>
              <Link href="/dashboard/requests/new">
                Start collecting data
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 min-w-[220px] border-border/80"
              asChild
            >
              <Link href="/#partnerships">Go to Partnerships</Link>
            </Button>
          </div>
          <div className="flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground sm:flex-row sm:gap-6">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-accent" />
              Payment, QA, and compliance rails included
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-accent" />
              Dedicated human support in every time zone
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
