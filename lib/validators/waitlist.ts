import { z } from "zod";

const optionalString = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional();

export const waitlistFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Please enter your name")
    .max(120, "Name is too long"),
  email: z
    .string()
    .trim()
    .email("Please enter a valid email")
    .max(320, "Email is too long"),
  company: optionalString(160, "Company name is too long"),
  useCase: optionalString(240, "Use case is too long"),
});

export type WaitlistFormValues = z.infer<typeof waitlistFormSchema>;
