"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateRequesterApiKey, revokeRequesterApiKey } from "@/lib/actions/requester-actions";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/use-translations";

export type ApiKey = {
  id: string;
  name: string | null;
  created_at: string;
  revoked_at: string | null;
};

export function ApiKeysCard({ keys }: { keys: ApiKey[] }) {
  const [label, setLabel] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useLocaleToast();
  const router = useRouter();
  const t = useTranslations();

  const createKey = () => {
    setError(null);
    startTransition(async () => {
      const result = await generateRequesterApiKey(label || t("Integration"));
      if ("error" in result) {
        toast.error(result.error);
        setError(result.error ?? "Unable to create API key");
      } else {
        setGeneratedKey(result.data.apiKey);
        toast.success(t("API key created"));
        setLabel("");
        router.refresh();
      }
    });
  };

  const revoke = (id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await revokeRequesterApiKey(id);
      if ("error" in result) {
        toast.error(result.error);
        setError(result.error ?? "Unable to revoke API key");
      } else {
        toast.success(t("API key revoked"));
        router.refresh();
      }
    });
  };

  const copyGeneratedKey = async () => {
    if (!generatedKey) return;
    try {
      await navigator.clipboard.writeText(generatedKey);
      toast.success(t("Key copied"));
    } catch (_error) {
      toast.error(t("Unable to copy key"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder={t("Label")} value={label} onChange={(event) => setLabel(event.target.value)} />
        <Button onClick={createKey} disabled={isPending}>
          {t("Generate")}
        </Button>
      </div>
      {generatedKey && (
        <div className="rounded-xl border border-border/70 p-4 text-sm">
          <p className="font-medium">{t("Copy your key:")}</p>
          <p className="mt-2 font-mono text-xs">{generatedKey}</p>
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={copyGeneratedKey}>
              {t("Copy")}
            </Button>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("No keys yet.")}</p>
        ) : (
          keys.map((key) => (
            <div key={key.id} className="flex items-center justify-between rounded-xl border border-border/70 p-3 text-sm">
              <div>
                <p className="font-medium">{key.name || t("API key")}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(key.created_at).toLocaleDateString()}
                </p>
              </div>
              <Button variant="outline" size="sm" disabled={isPending || Boolean(key.revoked_at)} onClick={() => revoke(key.id)}>
                {key.revoked_at ? t("Revoked") : t("Revoke")}
              </Button>
            </div>
          ))
        )}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
