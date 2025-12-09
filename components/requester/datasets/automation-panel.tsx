"use client";

import { useState, useTransition } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { saveAutomationConfig } from "@/lib/actions/requester-actions";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/use-translations";

export function AutomationPanel({ datasetId, config }: { datasetId: string; config: Record<string, unknown> }) {
  const [value, setValue] = useState(() => JSON.stringify(config ?? {}, null, 2));
  const [isPending, startTransition] = useTransition();
  const toast = useLocaleToast();
  const router = useRouter();
  const t = useTranslations();

  const handleSave = () => {
    startTransition(async () => {
      try {
        const parsed = value ? JSON.parse(value) : {};
        const result = await saveAutomationConfig(datasetId, parsed);
        if ("error" in result) {
          toast.error(result.error);
        } else {
          toast.success(t("Automation updated"));
          router.refresh();
        }
      } catch (error) {
        toast.error(t("Invalid JSON payload"));
      }
    });
  };

  return (
    <div className="space-y-3">
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="font-mono"
        rows={8}
      />
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isPending}>
          {t("Save automation rules")}
        </Button>
      </div>
    </div>
  );
}
