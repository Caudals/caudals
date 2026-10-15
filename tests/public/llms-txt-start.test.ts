/**
 * llms.txt "Empezar" (gap G3, after L-30 and L-20): the offers in the site's
 * order (the free test, the free account, credits in the app without prices,
 * pilots at a fixed price quoted before we start, the manual diagnostic last)
 * and the current five-field pilot form, never the earlier long form.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/blog/posts", () => ({ getBlogPosts: vi.fn(async () => []) }));
vi.mock("@/lib/newsletter/client", () => ({ getPublishedIssues: vi.fn(async () => []) }));

const { GET: llms } = await import("@/app/llms.txt/route");
const { buildAppUrl, buildMarketingUrl } = await import("@/lib/seo");

afterEach(() => vi.unstubAllEnvs());

async function start() {
  const text = await (await llms()).text();
  const section = /## Empezar\n\n([\s\S]*?)\n\n## /.exec(text)?.[1] ?? "";
  return { text, section, lines: section.split("\n").filter((line) => line.startsWith("- ")) };
}

describe("llms.txt offers and contact form", () => {
  it("lists the offers in the site's order, the diagnostic last, with the five-field form", async () => {
    vi.stubEnv("DEMO_PUBLIC", "true");
    vi.stubEnv("SELF_SERVE_DIRECT_SIGNUP", "true");
    const { text, section, lines } = await start();
    expect(lines.map((line) => /^- \[([^\]]+)\]/.exec(line)?.[1])).toEqual(["Prueba gratuita", "Cuenta gratuita", "Pago por uso", "Solicitar una evaluación piloto", "Diagnóstico inicial"]);
    expect(lines[0]).toContain(`(${buildMarketingUrl("/es/demo")})`);
    expect(lines[1]).toContain(`(${buildAppUrl("/workspace/start")})`);
    expect(lines[2]).toContain(`(${buildAppUrl("/workspace/sign-in")})`);
    expect(lines[3]).toContain(`(${buildMarketingUrl("/es/contacto")}?offer=pilot-evaluation)`);
    expect(lines[4]).toContain(`(${buildMarketingUrl("/es/contacto")}?offer=reality-check)`);
    // The five fields of the current form, and a fixed price quoted before we start.
    expect(lines[3]).toContain("formulario de cinco campos (nombre completo, correo corporativo, empresa, sector y qué debería cubrir el piloto)");
    expect(lines[3]).toContain("precio cerrado que presupuestamos antes de empezar");
    // Never the earlier long form or a price (D-06).
    expect(text).not.toMatch(/tipo de sistema|quién es responsable/);
    expect(section).not.toMatch(/€|\bEUR\b|\d+\s?euros?/i);
    expect(section).not.toMatch(/certific|complian|cumple con/i);
    // The call and the sample report are not offers: they follow.
    expect(text.indexOf("## Hablar con Caudals")).toBeGreaterThan(text.indexOf("## Empezar"));
    expect(text).toMatch(/## Hablar con Caudals\n\n- \[Reservar una llamada\]/);
  });

  it("leaves out the free test and the free account while their flags are off", async () => {
    vi.stubEnv("DEMO_PUBLIC", "false");
    vi.stubEnv("SELF_SERVE_DIRECT_SIGNUP", "false");
    const { lines } = await start();
    expect(lines.map((line) => /^- \[([^\]]+)\]/.exec(line)?.[1])).toEqual(["Pago por uso", "Solicitar una evaluación piloto", "Diagnóstico inicial"]);
  });
});
