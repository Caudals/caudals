"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { RotateCw } from "lucide-react";

import {
  requestOperatorSecurityResetLinks,
  type OperatorSecurityResetLinksState,
} from "@/lib/actions/operator-security-actions";
import { Button } from "@/components/ui/button";

type OperatorSecurityResetButtonProps = {
  actionLabel: string;
  pendingCount: number;
  sendingLabel: string;
};

const initialState: OperatorSecurityResetLinksState = {
  ok: true,
  message: "",
  resetRequests: 0,
  failedRequests: 0,
};

function SubmitButton({
  actionLabel,
  sendingLabel,
}: {
  actionLabel: string;
  sendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="sm"
      variant="outline"
      className="gap-2 rounded-full border-gray-200 bg-white"
      disabled={pending}
    >
      <RotateCw className={pending ? "animate-spin" : ""} />
      {pending ? sendingLabel : actionLabel}
    </Button>
  );
}

export function OperatorSecurityResetButton({
  actionLabel,
  pendingCount,
  sendingLabel,
}: OperatorSecurityResetButtonProps) {
  const [state, formAction] = useActionState(
    requestOperatorSecurityResetLinks,
    initialState
  );

  if (pendingCount === 0) {
    return null;
  }

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <SubmitButton actionLabel={actionLabel} sendingLabel={sendingLabel} />
      {state.message ? (
        <p
          className={
            state.ok
              ? "text-xs font-medium text-emerald-700"
              : "text-xs font-medium text-red-700"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
