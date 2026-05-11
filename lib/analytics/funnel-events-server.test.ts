import { beforeEach, describe, expect, it, vi } from "vitest";

const { generatePrefixedUlidMock, queryRowsMock, logWarnMock } = vi.hoisted(
  () => ({
    generatePrefixedUlidMock: vi.fn(() => "pa_01J2AN7YTC0000000000000000"),
    queryRowsMock: vi.fn(),
    logWarnMock: vi.fn(),
  })
);

vi.mock("@/lib/db/ids", () => ({
  generatePrefixedUlid: generatePrefixedUlidMock,
}));

vi.mock("@/lib/db/client", () => ({
  queryRows: queryRowsMock,
}));

vi.mock("@/lib/security/structured-logger", () => ({
  logError: vi.fn(),
  logWarn: logWarnMock,
}));

import { recordProductEvent } from "@/lib/analytics/funnel-events-server";

describe("recordProductEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRowsMock.mockResolvedValue([]);
    globalThis.__caudalsAnalyticsIngestDisabledUntilMs = undefined;
    globalThis.__caudalsAnalyticsMissingTableLogged = false;
  });

  it("writes sanitized analytics events to PostgreSQL", async () => {
    const result = await recordProductEvent({
      eventName: "funnel_visit",
      userId: "au_01J2USER000000000000000000",
      userRole: "admin",
      sessionId: "session_1",
      path: "/",
      source: "client",
      payload: {
        page: "home",
        value: 2,
        ignored: undefined,
      },
    });

    expect(result).toEqual({ ok: true });
    expect(generatePrefixedUlidMock).toHaveBeenCalledWith("pa");
    expect(queryRowsMock).toHaveBeenCalledTimes(1);
    expect(queryRowsMock.mock.calls[0]?.[0]).toContain(
      "INSERT INTO product_analytics_event"
    );
    expect(queryRowsMock.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining([
        "pa_01J2AN7YTC0000000000000000",
        "funnel_visit",
        "funnel",
        "au_01J2USER000000000000000000",
        "admin",
        "session_1",
        "/",
        "client",
        JSON.stringify({ page: "home", value: 2 }),
      ])
    );
  });

  it("pauses ingest when the analytics table is missing", async () => {
    const missingTableError = Object.assign(new Error("relation missing"), {
      code: "42P01",
    });
    queryRowsMock.mockRejectedValueOnce(missingTableError);

    const result = await recordProductEvent({
      eventName: "dashboard_view",
      source: "server",
    });

    expect(result).toMatchObject({
      skipped: true,
      error: "relation missing",
    });
    expect(logWarnMock).toHaveBeenCalledWith(
      "analytics.product_events_table_missing_ingest_paused",
      expect.objectContaining({ error: missingTableError })
    );
  });
});
