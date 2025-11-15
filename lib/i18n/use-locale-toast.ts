"use client";

import { toast as baseToast, type ExternalToast } from "sonner";
import { useTranslations } from "./use-translations";

type ToastMessage = Parameters<typeof baseToast.success>[0];
type ToastPromiseData = NonNullable<Parameters<typeof baseToast.promise>[1]>;

const translateMessage = (
  message: ToastMessage,
  translator: ReturnType<typeof useTranslations>,
) => {
  if (typeof message === "string") {
    return translator(message);
  }

  return message;
};

type ToastFunction = (message: ToastMessage, data?: ExternalToast) => unknown;

const wrapToast =
  (fn: ToastFunction, translator: ReturnType<typeof useTranslations>) =>
  (message: ToastMessage, data?: ExternalToast) => {
    const translatedMessage =
      typeof message === "string" ? translator(message as string) : message;
    return fn(translatedMessage, data);
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
      data?: Parameters<typeof baseToast.promise>[1],
    ) => {
      const normalizedData = (data ?? {}) as ToastPromiseData;
      return baseToast.promise(promise, {
        ...normalizedData,
        loading: translateMessage(messages.loading, t) as ToastPromiseData["loading"],
        success: translateMessage(messages.success, t) as ToastPromiseData["success"],
        error: translateMessage(messages.error, t) as ToastPromiseData["error"],
      });
    },
    dismiss: baseToast.dismiss,
  };
}
