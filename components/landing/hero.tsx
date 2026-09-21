"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/context";
import { useHeavyVisualsDisabled } from "@/lib/hooks/use-heavy-visuals-disabled";
import { cn } from "@/lib/utils";
import { ParticleMountains } from "@/components/landing/particle-mountains";
import { TypewriterSubtitle } from "@/components/landing/typewriter-subtitle";

/** Splits "text *accent* text" so each locale picks its own serif-italic word. */
function splitAccent(sentence: string) {
  const match = /^(.*?)\*(.+?)\*(.*)$/.exec(sentence);
  return match
    ? { before: match[1], accent: match[2], after: match[3] }
    : { before: sentence, accent: "", after: "" };
}

export function HeroSection() {
  const t = useTranslations("hero");
  const headline = splitAccent(t("headline"));
  const trackRef = useRef<HTMLElement>(null);
  const staticScene = useHeavyVisualsDisabled({ respectReducedMotion: false });

  return (
    // Tall scroll track (sits under the translucent sticky header) with a pinned stage.
    // The flight plays out over 220svh of pin; the negative bottom margin pulls the
    // next section up over the last 100svh, so it rises into the clearing sky while
    // the final stars dissolve, and the stage unpins just as that section arrives.
    <section
      ref={trackRef}
      className={cn(
        "relative -mt-16",
        staticScene ? "h-svh" : "mb-[-100svh] h-[320svh]",
      )}
    >
      <div className="sticky top-0 h-svh w-full overflow-hidden">
        <ParticleMountains trackRef={trackRef} className="absolute inset-0 z-0" />

        <div
          data-hero-copy
          className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-6 pt-[calc(4rem+9svh)] text-center will-change-transform sm:pt-[calc(4rem+11svh)]"
        >
          <motion.h1
            aria-label={`${headline.before}${headline.accent}${headline.after}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
            className="text-balance text-4xl font-normal tracking-tight text-black sm:text-6xl lg:text-7xl"
          >
            {headline.before}
            {headline.accent ? (
              <span className="font-serif italic text-teal-700/90">{headline.accent}</span>
            ) : null}
            {headline.after}
          </motion.h1>

          <motion.p
            aria-label={t("subtitle")}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-gray-600 sm:text-lg lg:text-xl"
          >
            <TypewriterSubtitle
              text={t("subtitle")}
            />
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
            className="mt-8 flex flex-col items-center gap-3"
          >
            <Button
              asChild
              size="lg"
              className="group h-12 rounded-full bg-black px-7 text-base font-bold text-white transition-all duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02] hover:bg-black/90 hover:shadow-xs active:scale-[0.99]"
            >
              <Link href="/contact?offer=reality-check">
                {t("primaryCta")}
                <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-1" />
              </Link>
            </Button>
            <p className="max-w-md text-[13px] leading-relaxed text-gray-500">
              {t("note")}
              <br />
              <Link
                href="/call"
                className="mt-1 inline-block font-medium text-black underline decoration-1 underline-offset-4 transition-colors duration-300 hover:text-neutral-600"
              >
                {t("secondaryCta")}
              </Link>
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
