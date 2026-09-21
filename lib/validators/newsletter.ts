import { z } from "zod";
import type { MessageKey } from "@/lib/i18n/messages";

/**
 * Validation messages are message keys, not sentences.
 *
 * Zod runs on both the client and the server, where no locale is in scope, so
 * the schema emits keys and the form resolves them in the reader's language at
 * render time. Typing them as `MessageKey` means a key that does not exist
 * fails `tsc` instead of surfacing as raw text under an input.
 */
const messageKey = (key: Extract<MessageKey, `validation.${string}`>) => key;

export const newsletterFormSchema = z.object({
  email: z
    .string({ message: messageKey("validation.invalidEmail") })
    .trim()
    .email(messageKey("validation.invalidEmail"))
    .max(320, messageKey("validation.emailTooLong")),
  fullName: z
    .string()
    .trim()
    .max(120, messageKey("validation.nameTooLong"))
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional(),
});

export type NewsletterFormValues = z.infer<typeof newsletterFormSchema>;
