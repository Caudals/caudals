"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Sparkles, ArrowRight, Files } from "lucide-react";

const STEPS = [
  {
    title: "Find a dataset",
    description: "Scroll the feed and open briefs that match your skills.",
  },
  {
    title: "Review the requirements",
    description: "Each brief outlines quality criteria, deadlines, and rewards.",
  },
  {
    title: "Upload & track",
    description:
      "Submit files from the Upload tab and monitor approvals and notes.",
  },
];

const STORAGE_KEY = "caudals-pwa-onboarding-dismissed";

export function PwaOnboardingCard() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return Boolean(window.localStorage.getItem(STORAGE_KEY));
  });
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleDismiss = () => {
    window.localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  };

  if (dismissed) {
    return null;
  }

  return (
    <>
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/15 to-white/0 p-4 text-white shadow-[0_20px_45px_rgba(3,7,18,0.55)]">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl border border-white/20 bg-white/20 p-2">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.4em] text-white/60">
              New here?
            </p>
            <p className="text-base font-semibold">
              Quick guide to contributing on mobile
            </p>
            <p className="text-sm text-white/70">
              Swipe through the steps or jump straight into the feed.
            </p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            size="sm"
            className="flex-1 rounded-2xl bg-white text-slate-900"
            onClick={() => setDialogOpen(true)}
          >
            Show walkthrough
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="rounded-2xl border border-white/20 text-white"
            onClick={handleDismiss}
          >
            Skip
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-3xl bg-slate-950 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Files className="h-5 w-5" />
              How the workflow fits together
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Follow these three beats every time you contribute.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {STEPS.map((step, index) => (
              <div
                key={step.title}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <p className="text-xs uppercase tracking-[0.4em] text-white/50">
                  Step {index + 1}
                </p>
                <p className="text-base font-semibold">{step.title}</p>
                <p className="text-sm text-white/70">{step.description}</p>
              </div>
            ))}
          </div>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="ghost"
              className="rounded-2xl border border-white/10 bg-transparent text-white"
              onClick={() => setDialogOpen(false)}
            >
              Close
            </Button>
            <Button
              className="rounded-2xl bg-white text-slate-900"
              onClick={() => {
                setDialogOpen(false);
                handleDismiss();
              }}
            >
              Let&apos;s browse
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
