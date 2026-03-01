import { z } from "zod";

export const uuidSchema = z.string().uuid("Invalid id format");

export const requesterDatasetListFiltersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  quickFilter: z
    .enum(["needs_funding", "pending_review", "download_ready", "drafts"])
    .optional(),
  status: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  page: z.coerce.number().int().min(1).max(10000).optional(),
  perPage: z.coerce.number().int().min(1).max(50).optional(),
});

export const requesterDatasetStatusUpdateSchema = z.object({
  id: uuidSchema,
  status: z.enum(["paused", "active", "archived"]),
});

export const requesterDatasetIdSchema = z.object({
  id: uuidSchema,
});

const requesterDatasetCategorySchema = z.enum([
  "computer-vision",
  "natural-language",
  "speech-audio",
  "healthcare",
  "robotics",
  "other",
]);

const requesterDatasetDataTypeSchema = z.enum([
  "image",
  "video",
  "audio",
  "text",
  "mixed",
]);

const requesterDatasetBuilderBaseSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().min(10).max(6000),
  category: requesterDatasetCategorySchema,
  dataType: requesterDatasetDataTypeSchema,
  samplesNeeded: z.preprocess((value) => {
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string") {
      const normalized = value.replace(/[^\d-]/g, "");
      return Number(normalized);
    }
    return value;
  }, z.number().int().min(1).max(100000)),
  rewardAmount: z.preprocess((value) => {
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string") {
      const raw = value.trim().replace(/\s+/g, "");
      let normalized = raw;
      if (normalized.includes(",") && normalized.includes(".")) {
        normalized = normalized.replace(/,/g, "");
      } else if (normalized.includes(",") && !normalized.includes(".")) {
        normalized = normalized.replace(/,/g, ".");
      }
      normalized = normalized.replace(/[^0-9.-]/g, "");
      return Number(normalized);
    }
    return value;
  }, z.number().min(0.01).max(100000)),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "Currency must be a 3-letter ISO code"),
  deadline: z.string().trim().min(10).max(10),
  imageUrl: z
    .union([
      z.string().trim().url(),
      z.string().trim().regex(/^\/.+/, "Image URL must be absolute or start with /"),
      z.literal(""),
      z.undefined(),
    ])
    .optional(),
  qualityCriteria: z.array(z.string().trim().min(1).max(240)).max(25),
  requirements: z.array(z.string().trim().min(1).max(240)).max(25),
  publish: z.boolean().default(false),
});

export const requesterDatasetCreateSchema = requesterDatasetBuilderBaseSchema;

export const requesterDatasetUpdateSchema = requesterDatasetBuilderBaseSchema.extend({
  datasetId: uuidSchema,
});

export const requesterExportIdSchema = z.object({
  exportId: uuidSchema,
});

export const requesterAutomationConfigSchema = z.object({
  datasetId: uuidSchema,
  config: z.record(z.string(), z.unknown()),
});

export const requesterOnboardingUpdateSchema = z.object({
  stepId: z.enum(["profile", "dataset", "download"]),
  status: z.enum(["pending", "in_progress", "done"]),
});

export const requesterOrgSettingsSchema = z.object({
  company_name: z.string().trim().max(200).optional(),
  contact_email: z
    .string()
    .trim()
    .email("Invalid billing contact email")
    .max(320)
    .optional()
    .or(z.literal("")),
  tax_id: z.string().trim().max(120).optional(),
  default_currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "Currency must be a 3-letter ISO code")
    .optional(),
});

export const requesterApiKeyGenerateSchema = z.object({
  label: z.string().trim().max(120).optional(),
});

export const requesterApiKeyRevokeSchema = z.object({
  id: uuidSchema,
});

export const requesterSupportTicketSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
});

export const requesterSupportTicketIdSchema = z.object({
  ticketId: uuidSchema,
});

export const requesterSupportTicketReplySchema = z.object({
  ticketId: uuidSchema,
  body: z.string().trim().min(1).max(5000),
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
});

export const adminActivityFiltersSchema = z.object({
  actionType: z.string().trim().max(100).optional().nullable(),
  targetType: z.string().trim().max(100).optional().nullable(),
  adminId: uuidSchema.optional().nullable(),
  dateFrom: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dateFrom must use YYYY-MM-DD format")
    .optional()
    .nullable(),
  dateTo: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dateTo must use YYYY-MM-DD format")
    .optional()
    .nullable(),
  page: z.coerce.number().int().min(1).max(100000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(), // legacy alias for pageSize
});

export const adminWaitlistStatusUpdateSchema = z.object({
  id: uuidSchema,
  status: z.enum(["pending", "contacted", "qualified", "converted"]),
  notes: z.string().trim().max(1000).optional(),
});

export const adminWaitlistListSchema = z.object({
  status: z
    .enum(["pending", "contacted", "qualified", "converted"])
    .optional()
    .nullable(),
  search: z.string().trim().max(320).optional().nullable(),
  page: z.coerce.number().int().min(1).max(100000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const adminSupportTicketListSchema = z.object({
  status: z
    .enum(["open", "in_progress", "resolved", "closed"])
    .optional()
    .nullable(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional().nullable(),
  assignedTo: uuidSchema.optional().nullable(),
  search: z.string().trim().max(320).optional().nullable(),
  page: z.coerce.number().int().min(1).max(100000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const adminSupportTicketUpdateSchema = z.object({
  ticketId: uuidSchema,
  status: z.enum(["open", "in_progress", "resolved", "closed"]),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assignedTo: uuidSchema.nullable().optional(),
  reply: z.string().trim().max(5000).optional(),
});

export const contributorSettingsSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  bio: z.string().trim().max(1000).optional().or(z.literal("")),
  portfolio_url: z
    .string()
    .trim()
    .url("Portfolio URL must be a valid URL")
    .max(500)
    .optional()
    .or(z.literal("")),
  timezone: z.string().trim().max(80).optional().or(z.literal("")),
  availability: z.enum(["open", "limited", "unavailable"]).default("open"),
  focus_areas: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  notifications: z.object({
    review_updates: z.boolean(),
    payout_updates: z.boolean(),
    recommendations: z.boolean(),
  }),
});

export const walletCreateSchema = z.object({
  userId: uuidSchema,
});
