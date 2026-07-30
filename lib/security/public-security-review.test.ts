import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FALLBACK_PUBLIC_SECURITY_REVIEW,
  getPublicSecurityReviewData,
} from "@/lib/security/public-security-review";
import type { OperatorDbSession, QueryValue } from "@/lib/db/client";

describe("public security review library", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reads only published public review artifacts in display order", async () => {
    vi.stubEnv("PUBLIC_SECURITY_REVIEW_ORG_ID", "or_01J20000000000000000000001");
    vi.stubEnv("CAUDALS_TENANT_ORG_ID", "or_01J20000000000000000000002");

    const query = async <T extends Record<string, unknown>>(
      sql: string,
      values?: QueryValue[],
      session?: OperatorDbSession,
    ): Promise<T[]> => {
      expect(sql).toContain("FROM security_review_artifact");
      expect(sql).toContain("org_id = $1");
      expect(sql).toContain("audience = 'public'");
      expect(sql).toContain("state = 'published'");
      expect(sql).toContain("ORDER BY display_order ASC");
      expect(values).toEqual(["or_01J20000000000000000000001"]);
      expect(session).toEqual({
        orgId: "or_01J20000000000000000000001",
        serviceRole: true,
      });

      return [
        {
          id: "sr_01J30000000000000000000001",
          artifactKey: "buyer_supplier_data_isolation",
          artifactType: "questionnaire_answer",
          title: "Identity and tenant isolation",
          question: "How is buyer and supplier data isolated?",
          answer:
            "Production data access is scoped through Postgres RLS and server-side session context.",
          summary: "RLS isolation",
          controlFamily: "identity_access",
          controlRefs: ["Postgres RLS"],
          evidenceRefs: [],
          ownerTeam: "security",
          displayOrder: 10,
          updatedAt: "2026-05-10T12:00:00.000Z",
          reviewDueAt: "2026-08-10T12:00:00.000Z",
        },
        {
          id: "sr_01J30000000000000000000006",
          artifactKey: "standard_dpa_review_path",
          artifactType: "dpa_review_path",
          title: "Standard DPA review path",
          question: null,
          answer:
            "DPA requests are routed through contact intake for operator review.",
          summary: "Legal follow-up is routed rather than published unsigned.",
          controlFamily: "governance",
          controlRefs: ["contact"],
          evidenceRefs: [],
          ownerTeam: "operations",
          displayOrder: 120,
          updatedAt: "2026-05-12T12:00:00.000Z",
          reviewDueAt: "2026-07-10T12:00:00.000Z",
        },
      ] as unknown as T[];
    };

    const data = await getPublicSecurityReviewData(query);

    expect(data.questionnaire).toEqual([
      {
        id: "sr_01J30000000000000000000001",
        key: "buyer_supplier_data_isolation",
        question: "How is buyer and supplier data isolated?",
        answer:
          "Production data access is scoped through Postgres RLS and server-side session context.",
        controlFamily: "identity_access",
        controlRefs: ["Postgres RLS"],
      },
    ]);
    expect(data.reviewPacket).toEqual([
      {
        id: "sr_01J30000000000000000000006",
        key: "standard_dpa_review_path",
        title: "Standard DPA review path",
        summary: "Legal follow-up is routed rather than published unsigned.",
        artifactType: "dpa_review_path",
      },
    ]);
    expect(data.updatedAt).toBe("2026-05-12T12:00:00.000Z");
    expect(data.reviewDueAt).toBe("2026-07-10T12:00:00.000Z");
  });

  it("returns curated fallback content (does not throw) when the query fails", async () => {
    // Reproduces the production /security 500: an unguarded DB query throwing
    // (missing migration 026 table, unreachable/empty DATABASE_URL) previously
    // propagated out of the server component. It must now degrade gracefully.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const query = async () => {
      throw new Error(
        "relation \"security_review_artifact\" does not exist",
      );
    };

    const data = await getPublicSecurityReviewData(query);

    expect(data).toEqual(FALLBACK_PUBLIC_SECURITY_REVIEW);
    expect(data.questionnaire.length).toBeGreaterThan(0);
    expect(data.reviewPacket.length).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatchObject({
      event: "public_security_review.query_failed",
    });
  });

  it("returns curated fallback content when no published artifacts exist", async () => {
    const query = async <T extends Record<string, unknown>>(): Promise<T[]> =>
      [] as unknown as T[];

    const data = await getPublicSecurityReviewData(query);

    expect(data).toEqual(FALLBACK_PUBLIC_SECURITY_REVIEW);
    expect(data.questionnaire.length).toBeGreaterThan(0);
    expect(data.reviewPacket.length).toBeGreaterThan(0);
  });
});
