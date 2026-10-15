import { describe, expect, it, vi } from "vitest";

import {
  buildEvaluationRequestSlackMessage,
  notifySlack,
} from "@/lib/notifications/slack";
import type { EvaluationRequestFormValues } from "@/lib/validators/evaluation-request";

const request: EvaluationRequestFormValues = {
  fullName: "Ana Pérez",
  workEmail: "ana@example.com",
  organization: "Seguros <Norte> & Co",
  organizationWebsite: "https://norte.example/a|b",
  companySize: "200-500",
  systemType: "customer-assistant",
  sector: "insurance",
  ownerRole: "customer-service",
  systemStage: "live",
  systemAnswers: "Policy and claims questions",
  requestedOffer: "pilot-evaluation",
  message: "Private notes about our incident",
} as EvaluationRequestFormValues;

const env = { SLACK_BOT_TOKEN: "xoxb-test", SLACK_CUSTOMERS_CHANNEL_ID: "C123" };

function okFetch() {
  return vi.fn(async () => new Response(JSON.stringify({ ok: true, ts: "1.2" })));
}

describe("notifySlack", () => {
  it("does nothing until the token and channel are configured", async () => {
    const fetchImpl = okFetch();
    expect(await notifySlack("customers", { text: "hi" }, { env: {}, fetchImpl })).toBe(false);
    expect(
      await notifySlack("customers", { text: "hi" }, {
        env: { SLACK_BOT_TOKEN: "xoxb-test" },
        fetchImpl,
      }),
    ).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts to the configured channel with the bot token", async () => {
    const fetchImpl = okFetch();
    expect(await notifySlack("customers", { text: "hi" }, { env, fetchImpl })).toBe(true);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer xoxb-test");
    expect(JSON.parse(String(init.body))).toMatchObject({ channel: "C123", text: "hi" });
  });

  it("never throws when Slack fails or is unreachable", async () => {
    const slackError = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "not_in_channel" })));
    const offline = vi.fn(async () => {
      throw new Error("network down");
    });

    await expect(notifySlack("customers", { text: "hi" }, { env, fetchImpl: slackError })).resolves.toBe(false);
    await expect(notifySlack("customers", { text: "hi" }, { env, fetchImpl: offline })).resolves.toBe(false);
  });
});

describe("buildEvaluationRequestSlackMessage", () => {
  const message = buildEvaluationRequestSlackMessage(request, {
    evaluationRequestId: "req_1",
    opsUrl: "https://app.caudals.com/ops/clients",
  });
  const rendered = JSON.stringify(message);

  it("summarises the request and links to Ops", () => {
    expect(message.text).toBe("New evaluation request: Seguros <Norte> & Co");
    expect(rendered).toContain("Seguros &lt;Norte&gt; &amp; Co");
    expect(rendered).toContain("Customer assistant or chatbot");
    expect(rendered).toContain("<https://app.caudals.com/ops/clients|Open in Ops>");
    expect(rendered).toContain("req_1");
  });

  it("keeps the requester's name, email and notes out of Slack", () => {
    expect(rendered).not.toContain("Ana");
    expect(rendered).not.toContain("ana@example.com");
    expect(rendered).not.toContain("Private notes");
  });

  it("builds a message when the optional fields are missing", () => {
    const minimal = buildEvaluationRequestSlackMessage(
      { ...request, systemType: undefined, ownerRole: undefined, systemStage: undefined },
      { opsUrl: "https://app.caudals.com/ops/clients" },
    );
    expect(JSON.stringify(minimal)).not.toContain("undefined");
    expect(JSON.stringify(minimal)).toContain("Insurance");
  });

  it("cannot break out of the website link", () => {
    expect(rendered).toContain("<https://norte.example/a%7Cb|Website>");
  });
});
