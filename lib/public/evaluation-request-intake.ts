import "server-only";

import * as Sentry from "@sentry/nextjs";
import { SpanStatusCode, trace } from "@opentelemetry/api";

import { generatePrefixedUlid } from "@/lib/db/ids";
import {
  withOperatorDbSession,
  type DbQueryClient,
  type OperatorDbSession,
} from "@/lib/db/client";
import {
  evaluationOwnerRoleLabels,
  evaluationRequestOfferLabels,
  evaluationSectorLabels,
  evaluationSystemStageLabels,
  evaluationSystemTypeLabels,
  type EvaluationRequestFormValues,
} from "@/lib/validators/evaluation-request";

const DEFAULT_PUBLIC_INTAKE_ORG_ID = "or_01J20000000000000000000001";

type RoutePublicEvaluationRequestContext = {
  clientIp?: string | null;
  referer?: string | null;
  userAgent?: string | null;
};

type RoutePublicEvaluationRequestDeps = {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  generateId?: typeof generatePrefixedUlid;
  runInSession?: <T>(
    session: OperatorDbSession,
    callback: (client: DbQueryClient) => Promise<T>,
  ) => Promise<T>;
};

export type PublicEvaluationRequestRoutingResult =
  | { status: "disabled" }
  | { status: "routed"; contactId: string; buyerOpportunityId: string };

/**
 * `/contact` has always been switched by PUBLIC_BUYER_BRIEF_INTAKE_ENABLED and
 * scoped by PUBLIC_BUYER_BRIEF_TENANT_ORG_ID. The evaluation intake reads the
 * same variables so production configuration carries over unchanged.
 */
export function isPublicEvaluationRequestIntakeEnabled(
  env: NodeJS.ProcessEnv = process.env,
) {
  return env.PUBLIC_BUYER_BRIEF_INTAKE_ENABLED !== "false";
}

/** Operator-facing summary, stored as the opportunity's use case. */
export function buildEvaluationRequestSummary(data: EvaluationRequestFormValues) {
  const lines = [
    `What it answers: ${data.systemAnswers}`,
    `System: ${evaluationSystemTypeLabels[data.systemType]}`,
    data.systemStage ? `Stage: ${evaluationSystemStageLabels[data.systemStage]}` : null,
    `Sector: ${evaluationSectorLabels[data.sector]}`,
    `Owner: ${evaluationOwnerRoleLabels[data.ownerRole]}`,
    data.systemUrl ? `System URL: ${data.systemUrl}` : null,
    data.requestedOffer
      ? `Wants to start with: ${evaluationRequestOfferLabels[data.requestedOffer]}`
      : null,
    data.message ? `Notes: ${data.message}` : null,
  ];

  return lines.filter((line): line is string => line !== null).join("\n");
}

/**
 * Structured copy of the request, kept on the audit transition until
 * evaluation requests have a table of their own. Free text stays in the
 * opportunity use case.
 */
function buildAuditMetadata(
  data: EvaluationRequestFormValues,
  context: RoutePublicEvaluationRequestContext,
  submittedAt: string,
) {
  return {
    from_state: null,
    to_state: "new",
    source: "public_contact",
    request_type: "evaluation_request",
    evaluation_request: {
      system_type: data.systemType,
      system_stage: data.systemStage ?? null,
      sector: data.sector,
      owner_role: data.ownerRole,
      requested_offer: data.requestedOffer ?? null,
      company_size: data.companySize ?? null,
      organization_website: data.organizationWebsite ?? null,
      system_url: data.systemUrl ?? null,
      submitted_at: submittedAt,
      referer: context.referer ?? null,
    },
  };
}

export async function routePublicEvaluationRequestIntake(
  data: EvaluationRequestFormValues,
  context: RoutePublicEvaluationRequestContext = {},
  deps: RoutePublicEvaluationRequestDeps = {},
): Promise<PublicEvaluationRequestRoutingResult> {
  const env = deps.env ?? process.env;

  if (!isPublicEvaluationRequestIntakeEnabled(env)) {
    return { status: "disabled" };
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
  const auditId = generateId("ae");
  const submittedAt = now.toISOString();
  const tracer = trace.getTracer("caudals-web");

  return tracer.startActiveSpan(
    "public.evaluation_request_intake.route",
    async (span) => {
      span.setAttributes({
        "caudals.feature": "public_evaluation_request_intake",
        "caudals.system_type": data.systemType,
        "caudals.sector": data.sector,
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
                "Public evaluation request contact",
                submittedAt,
              ],
            );

            await client.query(
              `
                INSERT INTO buyer_opportunity (
                  id, org_id, contact_id, title, use_case, state,
                  created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, 'new', $6, $6)
              `,
              [
                buyerOpportunityId,
                tenantOrgId,
                contactId,
                `Evaluation request from ${data.organization}`,
                buildEvaluationRequestSummary(data),
                submittedAt,
              ],
            );

            await client.query(
              `
                INSERT INTO audit_event (
                  id, org_id, action, target_type, target_id, metadata, created_at
                )
                VALUES ($1, $2, 'state_transition', 'buyer_opportunity', $3, $4::jsonb, $5)
              `,
              [
                auditId,
                tenantOrgId,
                buyerOpportunityId,
                JSON.stringify(buildAuditMetadata(data, context, submittedAt)),
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
        };
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message:
            error instanceof Error
              ? error.message
              : "Failed to route public evaluation request",
        });
        Sentry.captureException(error);
        throw error;
      } finally {
        span.end();
      }
    },
  );
}
