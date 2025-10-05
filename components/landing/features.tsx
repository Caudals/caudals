import {
  Database,
  Users,
  Shield,
  Zap,
  Globe,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: Database,
    title: "Any data modality",
    description:
      "From images and text to audio, video, and sensor data—collect any type of data your model needs.",
  },
  {
    icon: Users,
    title: "Global contributor network",
    description:
      "Access a diverse pool of verified contributors from around the world for authentic, representative datasets.",
  },
  {
    icon: Shield,
    title: "Built-in quality control",
    description:
      "Automated validation, manual review workflows, and consensus mechanisms ensure data quality.",
  },
  {
    icon: Zap,
    title: "Ship faster",
    description:
      "Launch collection campaigns in minutes and start receiving submissions within hours, not weeks.",
  },
  {
    icon: Globe,
    title: "Compliance ready",
    description:
      "GDPR, CCPA, and custom consent flows built in. Store data securely with automatic audit trails.",
  },
  {
    icon: CheckCircle2,
    title: "Flexible pricing",
    description:
      "Pay only for approved submissions. No upfront costs, subscriptions, or hidden fees.",
  },
];

export function FeaturesSection() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Everything you need to build better datasets
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Purpose-built for ML teams who need high-quality, diverse training
            data at scale
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className="group relative overflow-hidden border-border/50 bg-white/80 backdrop-blur-sm transition-all hover:border-primary/20 hover:shadow-lg"
            >
              <CardContent className="p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-slate-900">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
