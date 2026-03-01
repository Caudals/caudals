"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { createSupportTicket } from "@/lib/actions/requester-actions";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/use-translations";

export function SupportForm() {
  const [form, setForm] = useState({ subject: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useLocaleToast();
  const router = useRouter();
  const t = useTranslations();

  const handleSubmit = () => {
    setError(null);
    if (form.subject.trim().length < 3) {
      setError(
        t("Subject must be at least 3 characters") ??
          "Subject must be at least 3 characters"
      );
      return;
    }

    startTransition(async () => {
      const result = await createSupportTicket(form);
      if ("error" in result) {
        toast.error(result.error);
        setError(result.error ?? "Unable to create support ticket");
      } else {
        toast.success(t("Request sent"));
        setForm({ subject: "", description: "" });
        router.push(`/requester/support/${result.id}`);
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4">
      <Input
        placeholder={t("Subject")}
        value={form.subject}
        onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
      />
      <Textarea
        rows={4}
        placeholder={t("Describe your issue")}
        value={form.description}
        onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
      />
      <Button onClick={handleSubmit} disabled={isPending}>
        {t("Submit ticket")}
      </Button>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
