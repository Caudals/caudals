import { MarketingPageLayout } from "@/components/marketing/marketing-page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildPublicMetadata } from "@/lib/seo";

export const metadata = buildPublicMetadata({
  title: "Sobre Caudals",
  description:
    "Caudals obtiene, licencia y prepara datasets a medida para IA mediante operaciones trazables, controles de calidad y revisión humana responsable.",
  pathname: "/about",
});

export default function AboutPage() {
  return (
    <MarketingPageLayout
      title="A dataset platform designed for operational trust"
      description="Caudals helps teams ship high-quality datasets through managed buyer intake, supplier data operations, and auditable admin controls."
    >
      <div className="grid gap-5 md:grid-cols-3">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Mission</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-500">
            Make production dataset delivery reliable, safe, and measurable across global teams.
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Approach</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-500">
            Combine managed service intake with review discipline, rights tracking, and operational visibility.
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Promise</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-500">
            Clear accountability from first brief to final export, with no black-box handoffs.
          </CardContent>
        </Card>
      </div>
    </MarketingPageLayout>
  );
}
