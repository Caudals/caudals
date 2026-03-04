"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { saveContributorSettings } from "@/lib/actions/contributor-actions";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useTranslations } from "@/lib/i18n/use-translations";

type ContributorSettingsPayload = {
  full_name: string;
  bio: string;
  portfolio_url: string;
  timezone: string;
  availability: "open" | "limited" | "unavailable";
  focus_areas: string[];
  notifications: {
    review_updates: boolean;
    payout_updates: boolean;
    recommendations: boolean;
  };
};

export function ContributorSettingsForm({
  initial,
}: {
  initial: ContributorSettingsPayload;
}) {
  const [form, setForm] = useState({
    full_name: initial.full_name || "",
    bio: initial.bio || "",
    portfolio_url: initial.portfolio_url || "",
    timezone: initial.timezone || "",
    availability: initial.availability || "open",
    focusAreasInput: (initial.focus_areas || []).join(", "),
    review_updates: initial.notifications.review_updates,
    payout_updates: initial.notifications.payout_updates,
    recommendations: initial.notifications.recommendations,
  });
  const [isPending, startTransition] = useTransition();
  const toast = useLocaleToast();
  const t = useTranslations();
  const router = useRouter();

  const focusAreaCount = useMemo(
    () =>
      form.focusAreasInput
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean).length,
    [form.focusAreasInput]
  );

  const submit = () => {
    startTransition(async () => {
      const focusAreas = form.focusAreasInput
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      const result = await saveContributorSettings({
        full_name: form.full_name,
        bio: form.bio,
        portfolio_url: form.portfolio_url,
        timezone: form.timezone,
        availability: form.availability,
        focus_areas: focusAreas,
        notifications: {
          review_updates: form.review_updates,
          payout_updates: form.payout_updates,
          recommendations: form.recommendations,
        },
      });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("Contributor settings updated.");
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-sm border-border bg-white">
        <CardHeader>
          <CardTitle>{t("Contributor profile")}</CardTitle>
          <CardDescription>
            {t("Keep your profile complete so requesters and reviewers can trust your work.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fullName">{t("Display name")}</Label>
              <Input
                id="fullName"
                value={form.full_name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, full_name: event.target.value }))
                }
                placeholder={t("Jane Doe")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portfolio">{t("Portfolio URL")}</Label>
              <Input
                id="portfolio"
                value={form.portfolio_url}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, portfolio_url: event.target.value }))
                }
                placeholder="https://portfolio.example.com"
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="timezone">{t("Timezone")}</Label>
              <Input
                id="timezone"
                value={form.timezone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, timezone: event.target.value }))
                }
                placeholder="America/New_York"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="availability">{t("Availability")}</Label>
              <select
                id="availability"
                value={form.availability}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    availability: event.target.value as ContributorSettingsPayload["availability"],
                  }))
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="open">{t("open")}</option>
                <option value="limited">{t("limited")}</option>
                <option value="unavailable">{t("unavailable")}</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">{t("Bio")}</Label>
            <Textarea
              id="bio"
              rows={4}
              value={form.bio}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, bio: event.target.value }))
              }
              placeholder={t("Share your data collection strengths and review experience.")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="focusAreas">{t("Focus areas (comma separated)")}</Label>
            <Input
              id="focusAreas"
              value={form.focusAreasInput}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, focusAreasInput: event.target.value }))
              }
              placeholder={t("computer vision, audio annotation, quality review")}
            />
            <p className="text-xs text-muted-foreground">
              {focusAreaCount} {focusAreaCount === 1 ? t("area selected") : t("areas selected")}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-border bg-white">
        <CardHeader>
          <CardTitle>{t("Notification preferences")}</CardTitle>
          <CardDescription>
            {t("Control alerts for review feedback, payouts, and new opportunities.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PreferenceRow
            title={t("Review updates")}
            description={t("Get notified when submissions are approved, rejected, or need changes.")}
            checked={form.review_updates}
            onCheckedChange={(checked) =>
              setForm((prev) => ({ ...prev, review_updates: checked }))
            }
          />
          <PreferenceRow
            title={t("Payout updates")}
            description={t("Get notified when payout transactions move from pending to settled.")}
            checked={form.payout_updates}
            onCheckedChange={(checked) =>
              setForm((prev) => ({ ...prev, payout_updates: checked }))
            }
          />
          <PreferenceRow
            title={t("Opportunity recommendations")}
            description={t("Get matched dataset opportunities based on your focus areas.")}
            checked={form.recommendations}
            onCheckedChange={(checked) =>
              setForm((prev) => ({ ...prev, recommendations: checked }))
            }
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={submit} disabled={isPending}>
          {isPending ? t("Saving...") : t("Save settings")}
        </Button>
      </div>
    </div>
  );
}

function PreferenceRow({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between rounded-lg border border-border p-3">
      <div className="space-y-1 pr-4">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
