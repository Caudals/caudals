import { z } from "zod";

export const newsletterFormSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Please enter a valid email")
    .max(320, "Email is too long"),
  fullName: z
    .string()
    .trim()
    .max(120, "Name is too long")
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional(),
});

export type NewsletterFormValues = z.infer<typeof newsletterFormSchema>;
