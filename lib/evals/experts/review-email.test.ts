/**
 * The founders' notice (launch L-26) goes to the internal address whether it
 * is set as a variable (the app) or mounted as a secret file (the workers).
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mail = vi.hoisted(() => vi.fn(async (_message: { to: string; subject: string; text: string }, _options?: unknown) => ({ data: { id: "fake" }, error: null })));
vi.mock("@/lib/resend/client", () => ({ getResendClient: () => ({ emails: { send: mail } }) }));

const input = { requestId: "00000000-0000-4000-8000-000000000801", workspace: "Example\nclient", report: "Report", scopeKind: "failed_answers", sector: "insurance", deadline: null, replyDueAt: "2026-10-15T09:00:00.000Z", hasNote: true };

afterEach(() => { vi.unstubAllEnvs(); mail.mockClear(); });

describe("founders' notice", () => {
  it("reads the internal address from the variable or its secret file, and carries no customer content", async () => {
    const { notifyFoundersOfReviewRequest } = await import("./review-email");
    vi.stubEnv("RESEND_FROM_EMAIL", "Caudals <noreply@caudals.test>");
    vi.stubEnv("COLLABORATION_NOTIFICATION_EMAIL", "ops-variable@caudals.test");
    await notifyFoundersOfReviewRequest(input);
    expect(mail.mock.calls[0][0].to).toBe("ops-variable@caudals.test");
    vi.stubEnv("COLLABORATION_NOTIFICATION_EMAIL", "");
    const dir = mkdtempSync(join(tmpdir(), "l26-"));
    writeFileSync(join(dir, "to"), "ops-file@caudals.test\n");
    vi.stubEnv("COLLABORATION_NOTIFICATION_EMAIL_FILE", join(dir, "to"));
    await notifyFoundersOfReviewRequest(input);
    const [message, options] = mail.mock.calls[1];
    expect(message.to).toBe("ops-file@caudals.test");
    expect(message.subject).toBe("Expert review requested: Example client");
    expect(message.text).toContain("Scope: failed answers (with a note)");
    expect(message.text).toContain(`/ops/experts/reviews/${input.requestId}`);
    expect(options).toEqual({ idempotencyKey: `expert-review-request-${input.requestId}` });
  });
});
