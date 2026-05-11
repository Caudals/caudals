"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2 } from "lucide-react";

import { createOperatorSigningKey } from "@/lib/actions/signing-key-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function OperatorSigningKeyCard() {
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleCreate = () => {
    setError(null);
    setFeedback(null);

    startTransition(async () => {
      const result = await createOperatorSigningKey({ reason });

      if ("error" in result) {
        setError(result.error);
        return;
      }

      setReason("");
      setFeedback(
        `Created ${result.signingKey.id} / ${result.signingKey.publicKeyFingerprint.slice(
          0,
          16
        )}`
      );
    });
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-emerald-700" />
            <p className="text-sm font-semibold text-gray-950">
              Ed25519 delivery signing keys
            </p>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
            Generate platform delivery keys from Settings. The public key is
            stored for verification; the private key is encrypted before it is
            written to PostgreSQL, and creation is logged to the audit trail.
          </p>
        </div>
        <Badge
          variant="outline"
          className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700"
        >
          Ed25519
        </Badge>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="grid gap-2">
          <Label htmlFor="operator-signing-key-reason">
            Creation reason
          </Label>
          <Textarea
            id="operator-signing-key-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={isPending}
            placeholder="Example: rotate delivery signing key before private beta release"
            className="min-h-20 border-gray-200 text-sm shadow-none"
          />
        </div>
        <Button
          type="button"
          className="w-fit bg-gray-950 text-white shadow-none hover:bg-gray-800"
          disabled={isPending || reason.trim().length < 10}
          onClick={handleCreate}
        >
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Generate key
        </Button>
      </div>

      <div aria-live="polite" className="mt-3 min-h-5">
        {error ? (
          <p className="text-xs font-medium text-red-700">{error}</p>
        ) : feedback ? (
          <p className="text-xs font-medium text-emerald-700">{feedback}</p>
        ) : null}
      </div>
    </section>
  );
}
