import { z } from "zod";

export const collaborationFocusAreas = [
  "sell-data",
  "buy-dataset",
  "custom-dataset",
  "ai-consulting",
] as const;

export const collaborationTeamSizes = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "500+",
] as const;

export const collaborationIndustries = [
  "logistics",
  "retail",
  "healthcare",
  "agriculture",
  "fintech",
  "energy",
  "manufacturing",
  "real-estate",
  "telecom",
  "insurance",
  "other",
] as const;

export const collaborationDatasetModalities = [
  "tabular",
  "text",
  "image",
  "video",
  "audio",
  "geospatial",
  "timeseries",
  "document",
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

const optionalTextField = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, { message })
    .transform((value) => (value ? value : undefined))
    .optional();

const optionalPrefixedId = (prefix: string) =>
  z
    .union([
      z.literal("").transform(() => undefined),
      z
        .string()
        .trim()
        .regex(new RegExp(`^${prefix}_[0-9A-HJKMNP-TV-Z]{10,}$`), {
          message: "Invalid dataset reference",
        }),
    ])
    .optional();

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
    message: "Please select what you're looking for",
  }),
  industry: z.enum(collaborationIndustries, {
    message: "Please select your industry",
  }).optional(),
  teamSize: z.enum(collaborationTeamSizes).optional(),
  datasetModality: z.enum(collaborationDatasetModalities).optional(),
  geography: optionalTextField(160, "Geography is too long"),
  freshness: optionalTextField(160, "Freshness requirement is too long"),
  volume: optionalTextField(160, "Volume requirement is too long"),
  budgetRange: optionalTextField(160, "Budget range is too long"),
  timeline: optionalTextField(160, "Timeline is too long"),
  targetFormats: optionalTextField(240, "Target formats are too long"),
  sensitivityConstraints: optionalTextField(
    500,
    "Sensitivity constraints are too long"
  ),
  catalogueListingId: optionalPrefixedId("cl"),
  requestedDatasetId: optionalPrefixedId("ds"),
  message: z
    .string()
    .trim()
    .min(20, { message: "Tell us more about the data you need or have" })
    .max(2000, { message: "Message is too long" }),
}).superRefine((value, ctx) => {
  const isBuyerBrief =
    value.focusArea === "buy-dataset" || value.focusArea === "custom-dataset";

  if (
    isBuyerBrief &&
    !value.datasetModality &&
    !value.catalogueListingId &&
    !value.requestedDatasetId
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["datasetModality"],
      message: "Please select the dataset type",
    });
  }
});

export type CollaborationFormValues = z.infer<typeof collaborationFormSchema>;
