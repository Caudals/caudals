import "server-only";

import * as Sentry from "@sentry/nextjs";
import { SpanStatusCode, trace } from "@opentelemetry/api";

import { generatePrefixedUlid } from "@/lib/db/ids";
import {
  withOperatorDbSession,
  type DbQueryClient,
  type OperatorDbSession,
} from "@/lib/db/client";
import type { CollaborationFormValues } from "@/lib/validators/collaboration";

const DEFAULT_PUBLIC_INTAKE_ORG_ID = "or_01J20000000000000000000001";

type RoutePublicBuyerBriefContext = {
  clientIp?: string | null;
  referer?: string | null;
  userAgent?: string | null;
};

type RoutePublicBuyerBriefDeps = {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  generateId?: typeof generatePrefixedUlid;
  runInSession?: <T>(
    session: OperatorDbSession,
    callback: (client: DbQueryClient) => Promise<T>,
  ) => Promise<T>;
};

type BuyerBriefInsertResult = {
  contactId: string;
  buyerOpportunityId: string;
  datasetBriefId: string;
};

export type PublicBuyerBriefRoutingResult =
  | { status: "disabled" }
  | { status: "not_buyer_brief" }
  | ({ status: "routed" } & BuyerBriefInsertResult);

export function isPublicBuyerBriefIntakeEnabled(
  env: NodeJS.ProcessEnv = process.env,
) {
  return env.PUBLIC_BUYER_BRIEF_INTAKE_ENABLED !== "false";
}

export function isBuyerBriefFocusArea(focusArea: CollaborationFormValues["focusArea"]) {
  return focusArea === "buy-dataset" || focusArea === "custom-dataset";
}

export function parseTargetFormats(value?: string) {
  if (!value) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(/[\n,;]/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 8);
}

function buildOpportunityTitle(data: CollaborationFormValues) {
  if (data.catalogueListingId) {
    return `Catalogue access request from ${data.organization}`;
  }

  if (data.requestedDatasetId) {
    return `Dataset expansion request from ${data.organization}`;
  }

  if (data.focusArea === "custom-dataset") {
    return `Custom dataset brief from ${data.organization}`;
  }

  return `Dataset acquisition request from ${data.organization}`;
}

function buildBriefRequirements(
  data: CollaborationFormValues,
  context: RoutePublicBuyerBriefContext,
  submittedAt: Date,
) {
  return {
    source: "public_contact",
    focusArea: data.focusArea,
    industry: data.industry ?? null,
    teamSize: data.teamSize ?? null,
    organizationWebsite: data.organizationWebsite ?? null,
    modality: data.datasetModality ?? null,
    geography: data.geography ?? null,
    freshness: data.freshness ?? null,
    volume: data.volume ?? null,
    targetFormats: parseTargetFormats(data.targetFormats),
    catalogueListingId: data.catalogueListingId ?? null,
    requestedDatasetId: data.requestedDatasetId ?? null,
    message: data.message,
    submittedAt: submittedAt.toISOString(),
    referer: context.referer ?? null,
  };
}

function buildSensitivityConstraints(data: CollaborationFormValues) {
  return {
    notes: data.sensitivityConstraints ?? null,
    declaredByBuyer: Boolean(data.sensitivityConstraints),
  };
}

function buildBudgetRange(data: CollaborationFormValues) {
  return {
    label: data.budgetRange ?? null,
    source: "public_contact",
  };
}

export async function routePublicBuyerBriefIntake(
  data: CollaborationFormValues,
  context: RoutePublicBuyerBriefContext = {},
  deps: RoutePublicBuyerBriefDeps = {},
): Promise<PublicBuyerBriefRoutingResult> {
  const env = deps.env ?? process.env;

  if (!isPublicBuyerBriefIntakeEnabled(env)) {
    return { status: "disabled" };
  }

  if (!isBuyerBriefFocusArea(data.focusArea)) {
    return { status: "not_buyer_brief" };
  }

  const now = deps.now?.() ?? new Date();
  const generateId = deps.generateId ?? generatePrefixedUlid;
  const tenantOrgId =
    env.PUBLIC_BUYER_BRIEF_TENANT_ORG_ID ??
    env.CAUDALS_TENANT_ORG_ID ??
    DEFAULT_PUBLIC_INTAKE_ORG_ID;
  const runInSession =
    deps.runInSession ??
    (<T>(
      session: OperatorDbSession,
      callback: (client: DbQueryClient) => Promise<T>,
    ) => withOperatorDbSession(session, callback));
  const contactId = generateId("co");
  const buyerOpportunityId = generateId("bo");
  const datasetBriefId = generateId("br");
  const buyerAuditId = generateId("ae");
  const briefAuditId = generateId("ae");
  const title = buildOpportunityTitle(data);
  const targetFormats = parseTargetFormats(data.targetFormats);
  const submittedAt = now.toISOString();
  const tracer = trace.getTracer("caudals-web");

  return tracer.startActiveSpan(
    "public.buyer_brief_intake.route",
    async (span) => {
      span.setAttributes({
        "caudals.feature": "public_buyer_brief_intake",
        "caudals.focus_area": data.focusArea,
        "caudals.tenant_org_id": tenantOrgId,
      });

      try {
        await runInSession(
          { orgId: tenantOrgId, serviceRole: true },
          async (client) => {
            await client.query(
              `
                INSERT INTO contact (
                  id, org_id, full_name, email, role, signing_authority,
                  created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, false, $6, $6)
              `,
              [
                contactId,
                tenantOrgId,
                data.fullName,
                data.workEmail.toLowerCase(),
                "Public buyer brief contact",
                submittedAt,
              ],
            );

            await client.query(
              `
                INSERT INTO buyer_opportunity (
                  id, org_id, contact_id, title, use_case, modality,
                  budget_range, timeline, state, created_at, updated_at
                )
                VALUES (
                  $1, $2, $3, $4, $5, $6, $7::jsonb, $8, 'new', $9, $9
                )
              `,
              [
                buyerOpportunityId,
                tenantOrgId,
                contactId,
                title,
                data.message,
                data.datasetModality ?? null,
                JSON.stringify(buildBudgetRange(data)),
                data.timeline ?? null,
                submittedAt,
              ],
            );

            await client.query(
              `
                INSERT INTO dataset_brief (
                  id, org_id, buyer_opportunity_id, title, requirements,
                  sensitivity_constraints, target_formats, state,
                  created_at, updated_at
                )
                VALUES (
                  $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::text[],
                  'new', $8, $8
                )
              `,
              [
                datasetBriefId,
                tenantOrgId,
                buyerOpportunityId,
                title,
                JSON.stringify(buildBriefRequirements(data, context, now)),
                JSON.stringify(buildSensitivityConstraints(data)),
                targetFormats,
                submittedAt,
              ],
            );

            await client.query(
              `
                INSERT INTO audit_event (
                  id, org_id, action, target_type, target_id, metadata, created_at
                )
                VALUES
                  ($1, $2, 'state_transition', 'buyer_opportunity', $3, $4::jsonb, $7),
                  ($5, $2, 'state_transition', 'dataset_brief', $6, $4::jsonb, $7)
              `,
              [
                buyerAuditId,
                tenantOrgId,
                buyerOpportunityId,
                JSON.stringify({
                  from_state: null,
                  to_state: "new",
                  source: "public_contact",
                  focus_area: data.focusArea,
                }),
                briefAuditId,
                datasetBriefId,
                submittedAt,
              ],
            );
          },
        );

        span.setStatus({ code: SpanStatusCode.OK });
        return {
          status: "routed" as const,
          contactId,
          buyerOpportunityId,
          datasetBriefId,
        };
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message:
            error instanceof Error
              ? error.message
              : "Failed to route public buyer brief",
        });
        Sentry.captureException(error);
        throw error;
      } finally {
        span.end();
      }
    },
  );
}
