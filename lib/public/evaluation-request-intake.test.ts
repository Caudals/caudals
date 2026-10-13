import { describe, expect, it, vi } from "vitest";

import {
  buildEvaluationRequestSummary,
  isPublicEvaluationRequestIntakeEnabled,
  routePublicEvaluationRequestIntake,
} from "@/lib/public/evaluation-request-intake";
import { CONTACT_FORM_VERSION, type EvaluationRequestFormValues } from "@/lib/validators/evaluation-request";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

function makeEvaluationRequest(
  overrides: Partial<EvaluationRequestFormValues> = {},
): EvaluationRequestFormValues {
  return {
    fullName: "Lucía Martín",
    workEmail: "LUCIA@MUTUA.EXAMPLE",
    organization: "Mutua Ejemplo",
    organizationWebsite: "https://mutua.example",
    companySize: "200-500",
    systemType: "customer-assistant",
    systemStage: "live",
    sector: "insurance",
    ownerRole: "customer-service",
    systemAnswers: "Coverage, waiting periods and claims for our health policies.",
    systemUrl: "https://mutua.example/asistente",
    requestedOffer: "reality-check",
    message: "We launched it in March and have no test suite yet.",
    ...overrides,
  };
}

describe("public evaluation request intake", () => {
  it("honors the public intake feature flag", async () => {
    const runInSession = vi.fn();
    const env = { NODE_ENV: "test", PUBLIC_BUYER_BRIEF_INTAKE_ENABLED: "false" } as const;

    await expect(
      routePublicEvaluationRequestIntake(makeEvaluationRequest(), {}, { env, runInSession }),
    ).resolves.toEqual({ status: "disabled" });
    expect(isPublicEvaluationRequestIntakeEnabled(env)).toBe(false);
    expect(runInSession).not.toHaveBeenCalled();
  });

  it("records contact, opportunity, evaluation request and both audit transitions", async () => {
    const queries: Array<{ sql: string; values?: unknown[] }> = [];
    const sessionSeen: unknown[] = [];
    const ids: string[] = [];

    const result = await routePublicEvaluationRequestIntake(
      makeEvaluationRequest(),
      { referer: "https://caudals.com/contact?offer=reality-check" },
      {
        env: {
          NODE_ENV: "test",
          CAUDALS_TENANT_ORG_ID: "or_01J20000000000000000000001",
        },
        now: () => new Date("2026-09-11T08:00:00.000Z"),
        generateId: (prefix) => {
          const id = `${prefix}_01J2000000000000000000000${ids.length + 1}`;
          ids.push(id);
          return id;
        },
        runInSession: async (session, callback) => {
          sessionSeen.push(session);
          return callback({
            query: async (sql, values) => {
              queries.push({ sql, values });
              return { rows: [] };
            },
          });
        },
      },
    );

    const [contactId, buyerOpportunityId, evaluationRequestId] = ids;
    expect(result).toEqual({
      status: "routed",
      contactId,
      buyerOpportunityId,
      evaluationRequestId,
    });
    expect(evaluationRequestId).toMatch(/^er_/);
    expect(sessionSeen).toEqual([
      { orgId: "or_01J20000000000000000000001", serviceRole: true },
    ]);
    expect(queries.map((query) => query.sql)).toEqual([
      expect.stringContaining("INSERT INTO contact"),
      expect.stringContaining("INSERT INTO buyer_opportunity"),
      expect.stringContaining("INSERT INTO evaluation_request"),
      expect.stringContaining("INSERT INTO audit_event"),
    ]);
    expect(queries.some((query) => query.sql.includes("dataset_brief"))).toBe(false);

    expect(queries[0]?.values).toEqual(
      expect.arrayContaining([
        "lucia@mutua.example",
        "Public evaluation request contact",
      ]),
    );
    expect(queries[1]?.values?.[3]).toBe("Evaluation request from Mutua Ejemplo");
    expect(String(queries[1]?.values?.[4])).toContain("Owner: Customer service");

    const requestValues = queries[2]?.values ?? [];
    expect(requestValues.slice(0, 15)).toEqual([
      evaluationRequestId,
      "or_01J20000000000000000000001",
      buyerOpportunityId,
      contactId,
      "Mutua Ejemplo",
      "https://mutua.example",
      "200-500",
      "customer-assistant",
      "live",
      "insurance",
      "customer-service",
      "Coverage, waiting periods and claims for our health policies.",
      "https://mutua.example/asistente",
      "reality-check",
      "We launched it in March and have no test suite yet.",
    ]);
    expect(JSON.parse(String(requestValues[15]))).toEqual({
      channel: "public_contact",
      form: null,
      referer: "https://caudals.com/contact?offer=reality-check",
      submitted_at: "2026-09-11T08:00:00.000Z",
    });

    const auditValues = queries[3]?.values ?? [];
    expect(auditValues[2]).toBe(buyerOpportunityId);
    expect(JSON.parse(String(auditValues[3]))).toMatchObject({
      to_state: "new",
      request_type: "evaluation_request",
      evaluation_request_id: evaluationRequestId,
    });
    expect(auditValues[5]).toBe(evaluationRequestId);
    const requestAudit = JSON.parse(String(auditValues[6]));
    expect(requestAudit).toMatchObject({
      to_state: "new",
      buyer_opportunity_id: buyerOpportunityId,
      evaluation_request: {
        system_type: "customer-assistant",
        sector: "insurance",
        owner_role: "customer-service",
        requested_offer: "reality-check",
      },
    });
    expect(JSON.stringify(requestAudit)).not.toContain("lucia@mutua.example");
  });

  it("records a five-field pilot request with the unasked columns as other (launch L-30)", async () => {
    const queries: Array<{ sql: string; values?: unknown[] }> = [];
    const data = {
      fullName: "Lucía Martín",
      workEmail: "lucia@mutua.example",
      organization: "Mutua Ejemplo",
      sector: "insurance",
      systemAnswers: "The chat on mutua.example/ayuda, on coverage and claims.",
      requestedOffer: "pilot-evaluation",
      formVersion: CONTACT_FORM_VERSION,
    } satisfies EvaluationRequestFormValues;

    const result = await routePublicEvaluationRequestIntake(data, { referer: "https://caudals.com/es/contacto" }, {
      env: { NODE_ENV: "test" },
      runInSession: async (_session, callback) =>
        callback({
          query: async (sql, values) => {
            queries.push({ sql, values });
            return { rows: [] };
          },
        }),
    });

    expect(result.status).toBe("routed");
    const requestValues = queries[2]?.values ?? [];
    // system_type and owner_role are required columns (migration 030).
    expect(requestValues[7]).toBe("other");
    expect(requestValues[9]).toBe("insurance");
    expect(requestValues[10]).toBe("other");
    expect(requestValues[13]).toBe("pilot-evaluation");
    expect(JSON.parse(String(requestValues[15]))).toMatchObject({ channel: "public_contact", form: "pilot-request-v2" });
    expect(String(queries[1]?.values?.[4])).toBe(
      ["What it answers: The chat on mutua.example/ayuda, on coverage and claims.", "Sector: Insurance and brokerage", "Wants to start with: Pilot Evaluation"].join("\n"),
    );
    const requestAudit = JSON.parse(String(queries[3]?.values?.[6]));
    expect(requestAudit.evaluation_request).toMatchObject({ form: "pilot-request-v2", system_type: null, owner_role: null, sector: "insurance" });
  });

  it("stores missing optional fields as nulls", async () => {
    const queries: Array<{ sql: string; values?: unknown[] }> = [];

    await routePublicEvaluationRequestIntake(
      makeEvaluationRequest({
        organizationWebsite: undefined,
        companySize: undefined,
        systemStage: undefined,
        systemUrl: undefined,
        requestedOffer: undefined,
        message: undefined,
      }),
      {},
      {
        env: { NODE_ENV: "test" },
        runInSession: async (_session, callback) =>
          callback({
            query: async (sql, values) => {
              queries.push({ sql, values });
              return { rows: [] };
            },
          }),
      },
    );

    const requestValues = queries[2]?.values ?? [];
    for (const index of [5, 6, 8, 12, 13, 14]) {
      expect(requestValues[index], `value ${index}`).toBeNull();
    }
  });

  it("summarises only the fields the requester filled in", () => {
    expect(
      buildEvaluationRequestSummary(
        makeEvaluationRequest({
          systemStage: undefined,
          systemUrl: undefined,
          requestedOffer: undefined,
          message: undefined,
        }),
      ),
    ).toBe(
      [
        "What it answers: Coverage, waiting periods and claims for our health policies.",
        "System: Customer assistant or chatbot",
        "Sector: Insurance and brokerage",
        "Owner: Customer service",
      ].join("\n"),
    );
  });
});
