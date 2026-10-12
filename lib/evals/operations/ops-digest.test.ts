import { describe, expect, it } from "vitest";
import { composeDigest, digestSummary, digestWeek, madridInstant } from "./ops-digest";
import type { OpsDigestData } from "../../analytics/targets";

const data: OpsDigestData = {
  from: "2026-10-04T22:00:00.000Z",
  to: "2026-10-11T22:00:00.000Z",
  funnel: {
    sessions: 87, page_views: 140, demo_starts: 9, demo_finished: 9, demo_succeeded: 7, demo_p50_s: 192, new_accounts: 2,
    activation_cohort: 2, activation_activated: 1, runs_started: 4, reports_viewed: 3, snapshots_created: 6, snapshots_shared: 4,
    paying_customers: 0, purchases_recorded: false, credits_sold: null,
  },
  demo_failures: [{ reason: "site_thin", count: 3 }, { reason: "chat_not_found", count: 1 }],
  demo_queue: 2,
  stuck_runs: [{ orgId: "00000000-0000-4000-8000-000000000001", runId: "00000000-0000-4000-8000-000000000002", workspace: "Acme", status: "running", phase: "target_execution", since: "2026-10-11T12:02:00.000Z" }],
  stuck_run_count: 1,
  old_holds: [],
  low_balance: [{ orgId: "00000000-0000-4000-8000-000000000003", workspace: "Beta SL", credits: 120.5 }],
  signups: [{ orgId: "00000000-0000-4000-8000-000000000004", company: "Foo SL", source: "demo", createdAt: "2026-10-09T09:00:00.000Z", domain: "foo.es", stage: "run_started" }],
};

describe("weekly ops digest (launch L-21)", () => {
  it("is due from Monday 08:00 Madrid in summer time (06:00 UTC)", () => {
    expect(digestWeek(new Date("2026-10-12T05:59:00Z")).due).toBe(false);
    const week = digestWeek(new Date("2026-10-12T06:00:00Z"));
    expect(week).toMatchObject({ weekStart: "2026-10-12", due: true });
    expect(week.from.toISOString()).toBe("2026-10-04T22:00:00.000Z");
    expect(week.to.toISOString()).toBe("2026-10-11T22:00:00.000Z");
    expect(week.sendAt.toISOString()).toBe("2026-10-12T06:00:00.000Z");
    expect(digestWeek(new Date("2026-10-13T07:00:00Z")).due).toBe(false); // Tuesday
    expect(digestWeek(new Date("2026-10-13T07:00:00Z")).weekStart).toBe("2026-10-12");
  });

  it("moves to 07:00 UTC after the October change and covers the 169-hour week", () => {
    const week = digestWeek(new Date("2026-10-26T07:00:00Z"));
    expect(digestWeek(new Date("2026-10-26T06:30:00Z")).due).toBe(false);
    expect(week).toMatchObject({ weekStart: "2026-10-26", due: true });
    expect(week.from.toISOString()).toBe("2026-10-18T22:00:00.000Z");
    expect(week.to.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(week.sendAt.toISOString()).toBe("2026-10-26T07:00:00.000Z");
  });

  it("moves back to 06:00 UTC after the March change", () => {
    expect(digestWeek(new Date("2027-03-29T05:59:00Z")).due).toBe(false);
    expect(digestWeek(new Date("2027-03-29T06:00:00Z"))).toMatchObject({ weekStart: "2027-03-29", due: true });
    expect(digestWeek(new Date("2027-03-22T06:59:00Z")).due).toBe(false); // winter time, the Monday before
    expect(digestWeek(new Date("2027-03-22T07:00:00Z")).due).toBe(true);
    expect(madridInstant(2027, 3, 29, 8).toISOString()).toBe("2027-03-29T06:00:00.000Z");
    // A Sunday late in the evening belongs to the week that started six days earlier.
    expect(digestWeek(new Date("2026-10-18T21:30:00Z")).weekStart).toBe("2026-10-12");
  });

  it("writes last week's numbers against the Gate A targets and today's to-dos", () => {
    const { subject, text } = composeDigest(data, { locale: "en", stage: "gate_a", appUrl: "https://app.caudals.com" });
    expect(subject).toBe("Caudals weekly digest · 5 Oct – 11 Oct");
    expect(text).toContain("- Site sessions (consented): 87 / 150");
    expect(text).toContain("- Demo starts: 9 / 15");
    expect(text).toContain("- Demo success: 78 % (7 of 9) / ≥ 85 %");
    expect(text).toContain("- Demo p50 duration: 3 min 12 s / ≤ 5 min 0 s");
    expect(text).toContain("- New accounts: 2 / 3");
    expect(text).toContain("- Activation (own report within 7 days): 50 % (1 of 2) / 30 %");
    expect(text).toContain("- Evidence snapshots shared: 4 (made: 6) / 15");
    expect(text).toContain("- Paying customers: — (no purchases recorded yet) / 0");
    expect(text).toContain("Stuck runs (no progress for 2 hours) (1):");
    expect(text).toContain("https://app.caudals.com/ops/runs/00000000-0000-4000-8000-000000000002?orgId=00000000-0000-4000-8000-000000000001");
    expect(text).toContain("- site_thin 3, chat_not_found 1");
    expect(text).toMatch(/Credit holds older than 24 hours:\n- none/);
    expect(text).toContain("- Beta SL · 120.5 cr");
    expect(text).toContain("- Foo SL · foo.es · demo · run started · 9 Oct");
    expect(text).not.toContain("@");
  });

  it("never invents a rate from nothing, and writes Spanish", () => {
    const empty: OpsDigestData = { ...data, funnel: { ...data.funnel, demo_finished: 0, demo_succeeded: 0, activation_cohort: 0, activation_activated: 0, demo_p50_s: null, purchases_recorded: true, paying_customers: 1 },
      stuck_runs: [], stuck_run_count: 0, low_balance: [], signups: [], demo_failures: [] };
    const en = composeDigest(empty, { locale: "en", stage: "gate_b" }).text;
    expect(en).toContain("- Demo success: — (0 of 0) / ≥ 90 %");
    expect(en).toContain("- Paying customers: 1 / 1");
    expect(en).toContain("- Demo p50 duration: — / ≤ 4 min 0 s");
    const es = composeDigest(data, { locale: "es", stage: "gate_a" });
    expect(es.subject).toBe("Resumen semanal de Caudals · 5 oct – 11 oct");
    expect(es.text).toContain("- Sesiones en la web (con consentimiento): 87 / 150");
    expect(es.text).toContain("- Demos con éxito: 78 % (7 de 9) / ≥ 85 %");
    expect(es.text).toContain("- Clientes de pago: — (aún no hay compras registradas) / 0");
    expect(es.text).toContain("ejecución iniciada");
    expect(digestSummary(data)).toEqual({ sessions: 87, demo_starts: 9, demo_finished: 9, demo_succeeded: 7, new_accounts: 2, snapshots_shared: 4, stuck_runs: 1, old_holds: 0, low_balance: 1, signups: 1 });
  });
});
