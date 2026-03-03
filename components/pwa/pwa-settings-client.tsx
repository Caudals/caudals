"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth/provider";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Home } from "lucide-react";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useTranslations } from "@/lib/i18n/use-translations";

export function PwaSettingsClient() {
  const { user, loading, userRole } = useAuth();
  const supabase = createClient();
  const router = useRouter();
  const toast = useLocaleToast();
  const t = useTranslations();

  const [offlineSync, setOfflineSync] = useState(true);
  const [cellularUploads, setCellularUploads] = useState(false);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Signed out");
      router.push("/");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("Failed to sign out");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        {t("Loading settings...")}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center text-white">
        <Home className="mx-auto mb-3 h-10 w-10 text-white/60" />
        <h2 className="text-xl font-semibold">{t("Sign in to customize settings")}</h2>
        <p className="mt-2 text-sm text-white/70">
          {t("Manage notifications, offline sync, and account actions once you log in.")}
        </p>
        <Button asChild className="mt-4 rounded-2xl bg-white text-slate-900">
          <Link href="/auth/sign-in">{t("Open sign-in")}</Link>
        </Button>
      </div>
    );
  }

  const displayName =
    user.user_metadata?.full_name || user.email?.split("@")[0] || "Contributor";
  const email = user.email || "";
  const initials = displayName
    .split(" ")
    .map((part: string) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const desktopHref =
    userRole === "admin"
      ? "/admin"
      : userRole === "contributor"
        ? "/contributor"
        : "/requester";

  return (
    <>
      <section className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-5 text-white">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage
              src={user.user_metadata?.avatar_url || undefined}
              alt={displayName}
            />
            <AvatarFallback className="bg-white/20 text-lg text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm text-white/60">{t("Signed in as")}</p>
            <p className="text-lg font-semibold">{displayName}</p>
            <p className="text-xs text-white/60">{email}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            asChild
            className="flex-1 rounded-2xl border border-white/20 bg-white/10 text-white hover:bg-white/20"
          >
            <Link href={desktopHref}>{t("Open desktop dashboard")}</Link>
          </Button>
          <Button
            variant="ghost"
            className="flex-1 rounded-2xl border border-white/20 text-white"
            onClick={handleSignOut}
          >
            {t("Sign out")}
          </Button>
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-5 text-white">
        <p className="text-xs uppercase tracking-[0.3em] text-white/50">
          {t("Preferences")}
        </p>
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 p-4">
          <div>
            <p className="font-semibold">{t("Offline sync on Wi-Fi")}</p>
            <p className="text-sm text-white/60">
              {t("Cache briefs and drafts when connected to Wi-Fi.")}
            </p>
          </div>
          <Switch
            checked={offlineSync}
            onCheckedChange={setOfflineSync}
            aria-label={t("Toggle offline sync")}
          />
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 p-4">
          <div>
            <p className="font-semibold">{t("Allow uploads on cellular")}</p>
            <p className="text-sm text-white/60">
              {t("Enable to send files over mobile data connections.")}
            </p>
          </div>
          <Switch
            checked={cellularUploads}
            onCheckedChange={setCellularUploads}
            aria-label={t("Toggle cellular uploads")}
          />
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-5 text-white">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">
            {t("Install")}
          </p>
          <h3 className="text-lg font-semibold">{t("Add to home screen")}</h3>
          <p className="text-sm text-white/70">
            {t("Keep Caudals Companion one tap away. Works offline and syncs when you return.")}
          </p>
        </div>
        <Button
          className="w-full rounded-2xl bg-white text-slate-900"
          onClick={() => setInstallDialogOpen(true)}
        >
          {t("View instructions")}
        </Button>
      </section>

      <Dialog open={installDialogOpen} onOpenChange={setInstallDialogOpen}>
        <DialogContent className="rounded-3xl bg-slate-950 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Install Caudals Companion")}</DialogTitle>
            <DialogDescription className="text-white/60">
              {t("Follow the quick steps for your device.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm text-white/80">
            <div>
              <p className="font-semibold">{t("iOS (Safari)")}</p>
              <ol className="ml-4 mt-1 list-decimal space-y-1">
                <li>{t("Tap the Share icon in Safari.")}</li>
                <li>{t('Select "Add to Home Screen."')}</li>
                <li>{t("Confirm the name and tap Add.")}</li>
              </ol>
            </div>
            <div>
              <p className="font-semibold">{t("Android (Chrome)")}</p>
              <ol className="ml-4 mt-1 list-decimal space-y-1">
                <li>{t("Open the browser menu.")}</li>
                <li>{t('Tap "Install app" or "Add to Home screen."')}</li>
                <li>{t("Confirm when prompted.")}</li>
              </ol>
            </div>
          </div>
          <Button
            variant="ghost"
            className="mt-4 w-full rounded-2xl border border-white/10 text-white"
            onClick={() => setInstallDialogOpen(false)}
          >
            {t("Done")}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
