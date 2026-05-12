import { describe, expect, it, vi } from "vitest";

import {
  isPublicBuyerBriefIntakeEnabled,
  parseTargetFormats,
  routePublicBuyerBriefIntake,
} from "@/lib/public/buyer-brief-intake";
import type { CollaborationFormValues } from "@/lib/validators/collaboration";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

function makeBuyerBriefInput(
  overrides: Partial<CollaborationFormValues> = {},
): CollaborationFormValues {
  return {
    fullName: "Jane Smith",
    workEmail: "JANE@EXAMPLE.COM",
    organization: "Acme AI",
    organizationWebsite: "https://acme.example",
    focusArea: "custom-dataset",
    industry: "retail",
    teamSize: "51-200",
    datasetModality: "document",
    geography: "EU",
    freshness: "last 24 months",
    volume: "50k receipts",
    budgetRange: "$25k-$75k",
    timeline: "pilot in 30 days",
    targetFormats: "Parquet, JSONL, parquet",
    sensitivityConstraints: "Receipts may contain PII.",
    catalogueListingId: undefined,
    requestedDatasetId: undefined,
    message:
      "We need a multilingual receipt extraction dataset for model evaluation.",
    ...overrides,
  };
}

describe("public buyer brief intake", () => {
  it("normalizes target formats for dataset briefs", () => {
    expect(parseTargetFormats(" Parquet, JSONL\nSnowflake; parquet ")).toEqual([
      "parquet",
      "jsonl",
      "snowflake",
    ]);
  });

  it("honors the public buyer brief feature flag", async () => {
    const runInSession = vi.fn();

    await expect(
      routePublicBuyerBriefIntake(makeBuyerBriefInput(), {}, {
        env: {
          NODE_ENV: "test",
          PUBLIC_BUYER_BRIEF_INTAKE_ENABLED: "false",
        },
        runInSession,
      }),
    ).resolves.toEqual({ status: "disabled" });
    expect(isPublicBuyerBriefIntakeEnabled({
      NODE_ENV: "test",
      PUBLIC_BUYER_BRIEF_INTAKE_ENABLED: "false",
    })).toBe(false);
    expect(runInSession).not.toHaveBeenCalled();
  });

  it("routes buyer contact submissions into opportunity, brief, and audit rows", async () => {
    const queries: Array<{ sql: string; values?: unknown[] }> = [];
    const sessionSeen: unknown[] = [];
    let counter = 0;

    const result = await routePublicBuyerBriefIntake(
      makeBuyerBriefInput({
        catalogueListingId: "cl_01J20000000000000000000001",
      }),
      { referer: "https://app.caudals.com/catalogue" },
      {
        env: {
          NODE_ENV: "test",
          CAUDALS_TENANT_ORG_ID: "or_01J20000000000000000000001",
        },
        now: () => new Date("2026-05-12T08:00:00.000Z"),
        generateId: (prefix) => {
          counter += 1;
          return `${prefix}_01J20000000000000000000${counter}`;
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

    expect(result).toMatchObject({
      status: "routed",
      contactId: "co_01J200000000000000000001",
      buyerOpportunityId: "bo_01J200000000000000000002",
      datasetBriefId: "br_01J200000000000000000003",
    });
    expect(sessionSeen).toEqual([
      {
        orgId: "or_01J20000000000000000000001",
        serviceRole: true,
      },
    ]);
    expect(queries.map((query) => query.sql)).toEqual([
      expect.stringContaining("INSERT INTO contact"),
      expect.stringContaining("INSERT INTO buyer_opportunity"),
      expect.stringContaining("INSERT INTO dataset_brief"),
      expect.stringContaining("INSERT INTO audit_event"),
    ]);

    expect(queries[1]?.values).toEqual(
      expect.arrayContaining([
        "Catalogue access request from Acme AI",
        "document",
        "pilot in 30 days",
      ]),
    );
    const briefRequirements = JSON.parse(String(queries[2]?.values?.[4]));
    expect(briefRequirements).toMatchObject({
      source: "public_contact",
      catalogueListingId: "cl_01J20000000000000000000001",
      geography: "EU",
      freshness: "last 24 months",
      targetFormats: ["parquet", "jsonl"],
      referer: "https://app.caudals.com/catalogue",
    });
    expect(queries[2]?.values?.[6]).toEqual(["parquet", "jsonl"]);
    expect(queries[3]?.values?.[3]).toContain("public_contact");
  });

  it("does not create buyer records for supplier or consulting inquiries", async () => {
    const runInSession = vi.fn();

    await expect(
      routePublicBuyerBriefIntake(
        makeBuyerBriefInput({ focusArea: "sell-data" }),
        {},
        { runInSession },
      ),
    ).resolves.toEqual({ status: "not_buyer_brief" });
    expect(runInSession).not.toHaveBeenCalled();
  });
});
