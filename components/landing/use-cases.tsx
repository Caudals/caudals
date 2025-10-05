import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, MessageSquare, Mic, Video, MapPin } from "lucide-react";

const useCases = [
  {
    icon: Brain,
    category: "Computer Vision",
    title: "Image classification & object detection",
    description:
      "Collect labeled images for training models across industries—from medical imaging to autonomous vehicles.",
    tag: "Popular",
  },
  {
    icon: MessageSquare,
    category: "Natural Language",
    title: "Text annotation & sentiment analysis",
    description:
      "Build datasets for NLP tasks including named entity recognition, intent classification, and conversational AI.",
    tag: "Trending",
  },
  {
    icon: Mic,
    category: "Speech & Audio",
    title: "Voice data collection",
    description:
      "Gather diverse voice samples across languages, accents, and demographics for speech recognition models.",
    tag: null,
  },
  {
    icon: Video,
    category: "Video Analysis",
    title: "Action recognition & tracking",
    description:
      "Collect video data with temporal annotations for activity recognition and video understanding models.",
    tag: null,
  },
  {
    icon: MapPin,
    category: "Geospatial",
    title: "Location-based data",
    description:
      "Build datasets with geographic context for mapping, navigation, and location-aware applications.",
    tag: null,
  },
  {
    icon: Brain,
    category: "Multimodal",
    title: "Cross-modal datasets",
    description:
      "Create datasets that combine multiple data types for advanced AI systems that understand the world holistically.",
    tag: "New",
  },
];

export function UseCasesSection() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Built for every AI use case
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            From computer vision to NLP—we support all data modalities and
            annotation types
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {useCases.map((useCase) => (
            <Card
              key={useCase.title}
              className="group relative overflow-hidden border-border/50 bg-white/80 backdrop-blur-sm transition-all hover:border-primary/20 hover:shadow-lg"
            >
              <CardContent className="p-6">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5">
                    <useCase.icon className="h-6 w-6 text-primary" />
                  </div>
                  {useCase.tag && (
                    <Badge
                      variant="outline"
                      className="border-primary/20 bg-primary/5 text-primary"
                    >
                      {useCase.tag}
                    </Badge>
                  )}
                </div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-primary">
                  {useCase.category}
                </div>
                <h3 className="mb-2 text-lg font-semibold text-slate-900">
                  {useCase.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {useCase.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
