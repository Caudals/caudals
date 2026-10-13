import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();

vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({ emails: { send } }),
}));
vi.mock("@/lib/public/evaluation-request-intake", () => ({
  routePublicEvaluationRequestIntake: vi.fn(async () => ({ status: "routed", buyerOpportunityId: "bo_1", evaluationRequestId: "er_1" })),
}));
vi.mock("@/lib/resend/subscribers", () => ({
  ensureAudienceContact: vi.fn(async () => false),
  addContactEmailToSegment: vi.fn(),
}));
vi.mock("@/lib/security/rate-limit", () => ({
  consumeRateLimit: vi.fn(async () => ({ allowed: true, limit: 10, remaining: 9, resetAt: Date.now() + 1000 })),
  buildRateLimitHeaders: () => ({}),
  getClientIpFromHeaders: () => "203.0.113.7",
}));

const { POST } = await import("./route");

const request = (body: Record<string, unknown>) =>
  new NextRequest("https://caudals.com/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const form = {
  fullName: "Laura González",
  workEmail: "Laura@Seguros-Norte.example",
  organization: "Seguros Norte",
  systemType: "customer-assistant",
  sector: "insurance",
  ownerRole: "customer-service",
  systemAnswers: "Coberturas y carencias de nuestras pólizas de salud.",
};

describe("contact intake emails", () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({ data: { id: "email" }, error: null });
    process.env.RESEND_FROM_EMAIL = "Caudals <hello@caudals.com>";
    process.env.CONTACT_NOTIFICATION_EMAIL = "team@caudals.example";
  });

  it("notifies the team with the lead as reply-to and acknowledges the lead in Spanish", async () => {
    const response = await POST(request({ ...form, locale: "es" }));
    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(2);

    const [notification, acknowledgement] = send.mock.calls.map(([payload]) => payload);
    expect(notification).toMatchObject({ to: "team@caudals.example", replyTo: "laura@seguros-norte.example" });
    expect(acknowledgement).toMatchObject({
      to: "laura@seguros-norte.example",
      replyTo: "team@caudals.example",
      subject: "Hemos recibido tu solicitud — Caudals",
    });
    const html = renderToStaticMarkup(acknowledgement.react);
    expect(html).toContain('href="https://caudals.com/es/llamada"');
    expect(html).toContain("Hola, Laura:");
  });

  it("acknowledges in English when the form was sent from the English site", async () => {
    await POST(request(form));
    const acknowledgement = send.mock.calls[1]?.[0];
    expect(acknowledgement.subject).toBe("We have received your request — Caudals");
    expect(renderToStaticMarkup(acknowledgement.react)).toContain('href="https://caudals.com/en/call"');
  });

  it("still succeeds when only the acknowledgement fails", async () => {
    send
      .mockResolvedValueOnce({ data: { id: "notification" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "rejected" } });
    const response = await POST(request({ ...form, locale: "es" }));
    expect(response.status).toBe(200);
  });

  it("records and acknowledges the five-field pilot request (launch L-30)", async () => {
    const { routePublicEvaluationRequestIntake } = await import("@/lib/public/evaluation-request-intake");
    const intake = vi.mocked(routePublicEvaluationRequestIntake);
    intake.mockClear();
    const pilot = {
      fullName: "Laura González",
      workEmail: "laura@seguros-norte.example",
      organization: "Seguros Norte",
      sector: "insurance",
      systemAnswers: "El chat de seguros-norte.example/ayuda, sobre coberturas y siniestros.",
      requestedOffer: "pilot-evaluation",
      formVersion: "pilot-request-v2",
      locale: "es",
    };
    const response = await POST(request(pilot));
    expect(response.status).toBe(200);
    expect(intake).toHaveBeenCalledTimes(1);
    expect(intake.mock.calls[0]?.[0]).toMatchObject({ sector: "insurance", requestedOffer: "pilot-evaluation", formVersion: "pilot-request-v2" });
    expect(intake.mock.calls[0]?.[0]).not.toHaveProperty("systemType");
    const [notification, acknowledgement] = send.mock.calls.map(([payload]) => payload);
    const summary = renderToStaticMarkup(notification.react);
    expect(summary).toContain("Seguros Norte");
    expect(summary).not.toContain(">System<");
    expect(acknowledgement.subject).toBe("Hemos recibido tu solicitud — Caudals");
  });

  it("refuses a pilot request without the sector or what it should cover", async () => {
    const response = await POST(request({ fullName: "Laura González", workEmail: "laura@seguros-norte.example", organization: "Seguros Norte", systemAnswers: "" }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(Object.keys(body.details.fieldErrors).sort()).toEqual(["sector", "systemAnswers"]);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends nothing to a bot that filled the hidden field", async () => {
    const response = await POST(request({ ...form, website: "https://spam.example" }));
    expect(response.status).toBe(200);
    expect(send).not.toHaveBeenCalled();
  });
});
