import { afterEach, describe, expect, it, vi } from "vitest";

// Launch L-07: the senders switch to the branded templates only with
// BRANDED_EMAILS_ENABLED, and pick the language from the request or the run.
const sent = vi.hoisted(() => [] as Array<{ message: Record<string, unknown>; options?: Record<string, unknown> }>);
vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({ emails: { send: async (message: Record<string, unknown>, options?: Record<string, unknown>) => { sent.push({ message, options }); return { data: { id: "fake" }, error: null }; } } }),
}));

afterEach(() => {
  sent.length = 0;
  vi.unstubAllEnvs();
});

describe("password reset email", () => {
  const reset = async (headers: Record<string, string>) => {
    const { createBetterAuthOptions } = await import("@/lib/auth/better-auth-options");
    const options = createBetterAuthOptions({} as never);
    await options.emailAndPassword!.sendResetPassword!(
      { user: { email: "person@example.test" } as never, url: "https://app.caudals.com/api/auth/reset-password/tok", token: "tok" },
      new Request("https://app.caudals.com/api/auth/request-password-reset", { headers }),
    );
    return sent.at(-1)!.message;
  };

  it("stays plain while the flag is off", async () => {
    vi.stubEnv("RESEND_FROM_EMAIL", "Caudals <hello@example.test>");
    const message = await reset({ cookie: "caudals_locale=es" });
    expect(message.subject).toBe("Reset your Caudals password");
    expect(message.html).toBe('<p>Use this link to reset your Caudals password:</p><p><a href="https://app.caudals.com/api/auth/reset-password/tok">Reset password</a></p>');
  });

  it("is branded in the language of the page that asked", async () => {
    vi.stubEnv("RESEND_FROM_EMAIL", "hello@example.test");
    vi.stubEnv("BRANDED_EMAILS_ENABLED", "true");
    const spanish = await reset({ cookie: "other=1; caudals_locale=es" });
    // A bare sender address gets the company name.
    expect(spanish.from).toBe("Caudals <hello@example.test>");
    expect(spanish.subject).toBe("Restablece tu contraseña de Caudals");
    expect(spanish.html).toContain('<html lang="es"');
    expect(spanish.text).toContain("caduca en 30 minutos");
    const browser = await reset({ "accept-language": "es-ES,es;q=0.9" });
    expect(browser.subject).toBe("Restablece tu contraseña de Caudals");
    const english = await reset({ cookie: "caudals_locale=en", "accept-language": "es-ES" });
    expect(english.subject).toBe("Reset your Caudals password");
  });
});

describe("demo share email", () => {
  const run = { id: "00000000-0000-4000-8000-00000000d001", locale: "es" as const, target_host: "acme.example", summary: { total: 8, scored: 8, correct: 5, partial: 0, incorrect: 3, no_answer: 0, unscored: 0, causes: {} }, expires_at: new Date("2026-10-19T10:00:00Z") };

  it("links the public site and keeps the plain text while the flag is off", async () => {
    const { composeShareEmail } = await import("@/lib/demo/share");
    const message = composeShareEmail(run, "t".repeat(32));
    expect(message.html).toBeUndefined();
    expect(message.text).toContain(`https://caudals.com/es/demo#r=${run.id}.${"t".repeat(32)}`);
  });

  it("is branded, in the run's language, with the same public link", async () => {
    vi.stubEnv("BRANDED_EMAILS_ENABLED", "true");
    const { composeShareEmail } = await import("@/lib/demo/share");
    const message = composeShareEmail(run, "t".repeat(32));
    expect(message.html).toContain('<html lang="es"');
    expect(message.html).toContain(`href="https://caudals.com/es/demo#r=${run.id}.${"t".repeat(32)}"`);
    expect(message.text).toContain("Ver el informe");
    expect(message.text).not.toContain("app.caudals.com");
  });
});
