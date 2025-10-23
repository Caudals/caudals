"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LiquidMetal } from "@paper-design/shaders-react";
import { cn } from "@/lib/utils";
import { useWebGLSupport } from "@/hooks/use-webgl-support";

export function HeroSection() {
  const supportsWebGL = useWebGLSupport();

  return (
    <section className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-20 sm:px-8 lg:px-12">
      <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6"
        >
          <Badge
            variant="outline"
            className="border-primary/20 bg-primary/0 px-4 py-1.5 text-sm font-medium text-primary"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Trusted by leading AI companies
          </Badge>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-6 max-w-4xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-5xl font-bold leading-tight tracking-tight text-transparent sm:text-6xl lg:text-7xl"
        >
          Build production-grade datasets with a global network
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-10 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
        >
          Collective connects your organization with skilled contributors
          worldwide to create rich, diverse datasets for machine learning—faster
          and more cost-effectively than ever before.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-col gap-4 sm:flex-row"
        >
          <Link
            href="/dashboard/requests/new"
            className={cn(
              buttonVariants({ size: "lg" }),
              "group relative h-12 overflow-hidden px-10 text-base font-semibold text-slate-900 shadow-[0_12px_40px_rgba(14,30,80,0.18)] ring-1 ring-white/30 transition-transform duration-200 hover:-translate-y-0.5 hover:ring-white/50"
            )}
          >
            <span className="relative z-20 flex items-center justify-center gap-2">
              Post a request
            </span>
            {supportsWebGL ? (
              <LiquidMetal
                width={1280}
                height={720}
                image="https://shaders.paper.design/images/logos/diamond.svg"
                colorBack="#aaaaac"
                colorTint="#ffffff"
                shape="diamond"
                repetition={2}
                softness={0.1}
                shiftRed={0.3}
                shiftBlue={0.3}
                distortion={0.07}
                contour={0.4}
                angle={70}
                speed={1}
                scale={0.6}
                fit="contain"
                className="pointer-events-none absolute inset-0 h-full w-full"
                style={{ width: "100%", height: "100%" }}
              />
            ) : (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.85),rgba(229,229,229,0.4))]"
              />
            )}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-white/20 mix-blend-screen"
            />
          </Link>
          <Button
            size="lg"
            className="h-12 px-8  hover:text-primary/70 hover:bg-transparent"
            asChild
            variant="ghost"
          >
            <Link href="/browse">
              Explore datasets
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-12 flex items-center gap-8 text-sm text-muted-foreground"
        >
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-primary"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>No setup fees</span>
          </div>
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-primary"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>Pay per submission</span>
          </div>
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-primary"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>Quality guaranteed</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
