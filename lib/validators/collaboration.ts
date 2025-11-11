import { z } from "zod";

export const collaborationFocusAreas = [
  "data-collection",
  "joint-research",
  "co-marketing",
  "public-sector",
  "other",
] as const;

export const collaborationTeamSizes = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "500+",
] as const;

const websiteSchema = z
  .string()
  .trim()
  .transform((value) => (value ? value : undefined))
  .refine(
    (value) => {
      if (!value) {
        return true;
      }
      try {
        const url = new URL(value.startsWith("http") ? value : `https://${value}`);
        return Boolean(url.protocol === "http:" || url.protocol === "https:");
      } catch (error) {
        return false;
      }
    },
    { message: "Please enter a valid URL" }
  )
  .transform((value) => {
    if (!value) {
      return undefined;
    }
    return value.startsWith("http") ? value : `https://${value}`;
  });

export const collaborationFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, { message: "Please enter your full name" })
    .max(120, { message: "Name is too long" }),
  workEmail: z
    .string()
    .trim()
    .email({ message: "Please enter a valid work email" })
    .max(320, { message: "Email is too long" }),
  organization: z
    .string()
    .trim()
    .min(2, { message: "Organization name is required" })
    .max(160, { message: "Organization name is too long" }),
  organizationWebsite: websiteSchema.optional(),
  focusArea: z.enum(collaborationFocusAreas, {
    message: "Select the collaboration focus",
  }),
  teamSize: z.enum(collaborationTeamSizes).optional(),
  message: z
    .string()
    .trim()
    .min(20, { message: "Tell us more about how we can collaborate" })
    .max(2000, { message: "Message is too long" }),
});

export type CollaborationFormValues = z.infer<typeof collaborationFormSchema>;
