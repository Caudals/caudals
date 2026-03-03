"use client";

import { useEffect, useMemo, useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getFundingCheckoutSessionStatus } from "@/lib/actions/payment-actions";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";

export function FundingCheckoutStatusSync() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useLocaleToast();
  const [isChecking, startTransition] = useTransition();
  const handledKeyRef = useRef<string | null>(null);

  const fundingFlag = searchParams.get("funding");
  const sessionId = searchParams.get("session_id");
  const querySnapshot = searchParams.toString();

  const clearFundingParams = useMemo(
    () => () => {
      const next = new URLSearchParams(querySnapshot);
      next.delete("funding");
      next.delete("session_id");
      const nextQuery = next.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    },
    [pathname, querySnapshot, router]
  );

  useEffect(() => {
    if (!fundingFlag) return;

    const requestKey = `${pathname}:${fundingFlag}:${sessionId ?? "none"}`;
    if (handledKeyRef.current === requestKey || isChecking) {
      return;
    }
    handledKeyRef.current = requestKey;

    if (fundingFlag === "cancelled") {
      toast.warning("Stripe checkout was cancelled.");
      clearFundingParams();
      return;
    }

    if (!sessionId) {
      toast.error("Missing checkout session reference.");
      clearFundingParams();
      return;
    }

    startTransition(async () => {
      const result = await getFundingCheckoutSessionStatus(sessionId);

      if ("error" in result) {
        toast.error(result.error);
        clearFundingParams();
        return;
      }

      const status = result.data.status;
      if (status === "succeeded") {
        toast.success(
          result.data.funding_type === "dataset_funding"
            ? "Dataset funding completed."
            : "Wallet funding completed."
        );
        router.refresh();
      } else if (status === "pending") {
        toast.info("Payment is still processing. Refreshing latest funding state.");
        router.refresh();
      } else if (status === "cancelled") {
        toast.warning("Stripe checkout was cancelled.");
      } else {
        toast.error("Funding payment did not complete.");
      }

      clearFundingParams();
    });
  }, [
    clearFundingParams,
    fundingFlag,
    isChecking,
    pathname,
    router,
    sessionId,
    toast,
  ]);

  return null;
}
