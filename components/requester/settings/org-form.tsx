"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { saveOrgSettings } from "@/lib/actions/requester-actions";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/use-translations";

export type OrgSettings = {
  company_name: string | null;
  contact_email: string | null;
  tax_id: string | null;
  default_currency: string | null;
};

export function OrgForm({ org }: { org: OrgSettings | null }) {
  const [form, setForm] = useState({
    company_name: org?.company_name ?? "",
    contact_email: org?.contact_email ?? "",
    tax_id: org?.tax_id ?? "",
    default_currency: org?.default_currency ?? "USD",
  });
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useLocaleToast();
  const router = useRouter();
  const t = useTranslations();

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveOrgSettings(form);
      if ("error" in result) {
        toast.error(result.error);
        setError(result.error ?? "Unable to update organization");
      } else {
        toast.success(t("Organization updated"));
        setSavedAt(new Date().toLocaleTimeString());
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>{t("Company")}</Label>
        <Input value={form.company_name} onChange={(event) => setForm((prev) => ({ ...prev, company_name: event.target.value }))} />
      </div>
      <div>
        <Label>{t("Billing contact")}</Label>
        <Input value={form.contact_email} onChange={(event) => setForm((prev) => ({ ...prev, contact_email: event.target.value }))} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>{t("Tax ID")}</Label>
          <Input value={form.tax_id} onChange={(event) => setForm((prev) => ({ ...prev, tax_id: event.target.value }))} />
        </div>
        <div>
          <Label>{t("Default currency")}</Label>
          <Input value={form.default_currency} onChange={(event) => setForm((prev) => ({ ...prev, default_currency: event.target.value.toUpperCase() }))} />
        </div>
      </div>
      <Button onClick={handleSave} disabled={isPending}>
        {isPending ? t("Saving...") : t("Save organization")}
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
