"use client";

import { toast as baseToast } from "sonner";
import { useTranslations } from "./use-translations";

type ToastMessage = Parameters<typeof baseToast.success>[0];

const translateMessage = (
  message: ToastMessage,
  translator: ReturnType<typeof useTranslations>,
) => {
  if (typeof message === "string") {
    return translator(message);
  }

  return message;
};

const wrapToast =
  <Fn extends (...args: any[]) => any>(
    fn: Fn,
    translator: ReturnType<typeof useTranslations>,
  ) =>
  (...args: Parameters<Fn>) => {
    const [message, ...rest] = args;
    const translatedMessage =
      typeof message === "string"
        ? translator(message as string)
        : message;
    return fn(translatedMessage, ...rest);
  };

export function useLocaleToast() {
  const t = useTranslations();

  return {
    ...baseToast,
    success: wrapToast(baseToast.success, t),
    error: wrapToast(baseToast.error, t),
    info: wrapToast(baseToast.info, t),
    warning: wrapToast(baseToast.warning, t),
    message: wrapToast(baseToast.message, t),
    promise: <T>(
      promise: Promise<T>,
      messages: { loading: ToastMessage; success: ToastMessage; error: ToastMessage },
      options?: Parameters<typeof baseToast.promise>[2],
    ) =>
      baseToast.promise(
        promise,
        {
          loading: translateMessage(messages.loading, t),
          success: translateMessage(messages.success, t),
          error: translateMessage(messages.error, t),
        },
        options,
      ),
    dismiss: baseToast.dismiss,
  };
}
