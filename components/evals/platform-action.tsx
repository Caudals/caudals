"use client";

import { useCallback, useState } from "react";
import { EvalRequestError } from "./api";
import { Status } from "./primitives";
import { notify } from "./overlays";
import { useReauth } from "./reauth";
import { t } from "@/lib/evals/messages/en";

export function usePlatformAction() {
  const [error, setError] = useState<{ message: string } | null>(null);
  const [pending, setPending] = useState(false);
  const reauth = useReauth();
  const { confirm } = reauth;
  const run = useCallback(async (work: () => Promise<unknown>, done: string) => {
    setPending(true);
    setError(null);
    try {
      try {
        await work();
      } catch (reason) {
        // A sensitive change asks for a fresh confirmation: confirm in place, then retry once.
        if (!(reason instanceof EvalRequestError && reason.code === "REAUTHENTICATION_REQUIRED") || !(await confirm())) throw reason;
        await work();
      }
      notify(done);
      return true;
    } catch (reason) {
      setError({ message: reason instanceof Error ? reason.message : t("error") });
      return false;
    } finally {
      setPending(false);
    }
  }, [confirm]);
  const messages = (
    <>
      {reauth.dialog}
      {error ? <Status error>{error.message}</Status> : null}
    </>
  );
  return { run, pending, messages, clearError: () => setError(null) };
}

