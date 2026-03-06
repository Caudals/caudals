"use client";

import { motion } from "framer-motion";
import { Quote } from "lucide-react";
import { useTranslations } from "@/lib/i18n/use-translations";

export function TestimonialsSection() {
  const t = useTranslations();

  const testimonials = [
    {
      quote: t(
        "Caudals unlocked a global contributor base that matched our medical imaging criteria in record time. The review tooling kept clinicians in control of every approval.",
      ),
      name: "Dr. Anika Forster",
      role: t("Director of Data Science, HelioLabs"),
    },
    {
      quote: t(
        "Within two weeks we launched three multimodal programs across Spanish and Korean markets. Contributor training modules reduced rework by over 60%.",
      ),
      name: "Joel Reyes",
      role: t("Lead Researcher, Polyphonic AI"),
    },
    {
      quote: t(
        "The partnership team felt like an extension of ours—designing incentives, QA policies, and even helping us publish a public dataset for the research community.",
      ),
      name: "Mina Patel",
      role: t("Head of AI Innovation, Northwind Robotics"),
    },
  ];

  return (
    <section className="relative py-24">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.5),transparent_65%)]" />
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <div className="mb-12 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            {t("Customer stories")}
          </p>
          <h2 className="mt-4 text-3xl font-semibold text-foreground sm:text-4xl">
            {t("Teams shipping production AI trust Caudals")}
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((testimonial, index) => (
            <motion.blockquote
              key={testimonial.name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: index * 0.08 }}
              viewport={{ once: true, margin: "-60px" }}
              className="flex h-full flex-col gap-6 rounded-[1.6rem] border border-border/40 bg-white/80 p-6 text-left shadow-sm backdrop-blur-xl"
            >
              <Quote className="h-6 w-6 text-[#7f8cff]" />
              <p className="text-base leading-relaxed text-slate-500">{testimonial.quote}</p>
              <div className="mt-auto space-y-1">
                <p className="text-sm font-semibold text-foreground">{testimonial.name}</p>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {testimonial.role}
                </p>
              </div>
            </motion.blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}








