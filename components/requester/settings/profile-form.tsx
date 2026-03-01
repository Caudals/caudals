"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateProfile } from "@/lib/actions/profile-actions";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/use-translations";

export type ProfileData = {
  full_name: string | null;
  bio: string | null;
  timezone: string | null;
  locale: string | null;
};

export function ProfileForm({ profile }: { profile: ProfileData | null }) {
  const [form, setForm] = useState({
    full_name: profile?.full_name ?? "",
    bio: profile?.bio ?? "",
    timezone: profile?.timezone ?? "",
    locale: profile?.locale ?? "en",
  });
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useLocaleToast();
  const router = useRouter();
  const t = useTranslations();

  const handleSave = () => {
    setError(null);
    if (form.locale.trim().length === 0) {
      setError(t("Locale is required") ?? "Locale is required");
      return;
    }

    startTransition(async () => {
      const result = await updateProfile(form);
      if ("error" in result) {
        toast.error(result.error);
        setError(result.error ?? "Unable to update profile");
      } else {
        toast.success(t("Profile updated"));
        setSavedAt(new Date().toLocaleTimeString());
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>{t("Name")}</Label>
        <Input value={form.full_name} onChange={(event) => setForm((prev) => ({ ...prev, full_name: event.target.value }))} />
      </div>
      <div>
        <Label>{t("Bio")}</Label>
        <Textarea value={form.bio} onChange={(event) => setForm((prev) => ({ ...prev, bio: event.target.value }))} rows={4} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>{t("Timezone")}</Label>
          <Input value={form.timezone} onChange={(event) => setForm((prev) => ({ ...prev, timezone: event.target.value }))} />
        </div>
        <div>
          <Label>{t("Locale")}</Label>
          <Input value={form.locale} onChange={(event) => setForm((prev) => ({ ...prev, locale: event.target.value }))} />
        </div>
      </div>
      <Button onClick={handleSave} disabled={isPending}>
        {isPending ? t("Saving...") : t("Save profile")}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {savedAt ? (
        <p className="text-xs text-muted-foreground">
          {t("Last saved at {{time}}", { time: savedAt })}
        </p>
      ) : null}
    </div>
  );
}
