/**
 * UI contracts for the partner dashboard (launch L-28, spec P-52): clients and
 * their activity, referral links (create, copy, revoke), referred accounts
 * with revenue left empty until they pay, the allowance, the statement
 * download and the report logo; admin and member views; the Partner entry in
 * the navigation; 390, 768 and 1440 px; English and Spanish. Runs against the
 * isolated harness (ui.config.ts); the API is routed per test.
 */
import { expect, test, type Page } from "@playwright/test";

const PARTNER = "00000000-0000-4000-8000-000000000a01";
const CLIENT = "00000000-0000-4000-8000-000000000b01";
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const spanish = (page: Page) => page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
const links = (code: string) => ({
  demo: { en: `https://caudals.com/en/demo?utm_source=partner&utm_medium=referral&partner=${code}`, es: `https://caudals.com/es/demo?utm_source=partner&utm_medium=referral&partner=${code}` },
  signup: `https://app.caudals.com/workspace/start?utm_source=partner&utm_medium=referral&partner=${code}`,
});

type Client = { orgId: string; name: string; access: string; origin: string; plan: string; linkedAt: string; myRole: string; lastActivity: string | null; evaluations: number;
  runsThisMonth: number; lastRun: { status: string; at: string } | null; latestScore: number | null; latestScored: number | null; reportAt: string | null; availableCredits: number | null; usedThisMonthCredits: number };
type Code = { id: string; code: string; label: string | null; createdAt: string; revokedAt: string | null; links: ReturnType<typeof links> };
function overview(role: "admin" | "member") {
  return {
    partner: { id: PARTNER, name: "Agencia Norte", status: "active", revenueShareBps: 2000, agreementNote: null, maxClients: 25, createdAt: "2026-10-01T09:00:00.000Z", logo: null as null | { sha256: string; mediaType: string; bytes: number; updatedAt: string } },
    role, platformAdmin: false, livemode: false,
    members: [
      { userId: "u1", email: "ana@agencianorte.es", name: "Ana Ruiz", role: "admin", since: "2026-10-01T09:00:00.000Z" },
      { userId: "u2", email: "luis@agencianorte.es", name: "Luis Gil", role: "member", since: "2026-10-02T09:00:00.000Z" },
    ],
    clients: ([
      { orgId: CLIENT, name: "Seguros Ribera", access: "manage", origin: "created", plan: "partner", linkedAt: "2026-10-03T09:00:00.000Z", myRole: role === "admin" ? "owner" : "editor",
        lastActivity: "2026-10-12T18:00:00.000Z", evaluations: 3, runsThisMonth: 4, lastRun: { status: "completed", at: "2026-10-12T18:00:00.000Z" }, latestScore: 0.72, latestScored: 46, reportAt: "2026-10-12T18:05:00.000Z", availableCredits: 1250.5, usedThisMonthCredits: 380 },
      { orgId: "00000000-0000-4000-8000-000000000b02", name: "Clínica Dental Sol, una empresa con un nombre bastante largo", access: "work", origin: "linked", plan: "payg", linkedAt: "2026-10-05T09:00:00.000Z", myRole: "editor",
        lastActivity: null, evaluations: 0, runsThisMonth: 0, lastRun: null, latestScore: null, latestScored: null, reportAt: null, availableCredits: null, usedThisMonthCredits: 0 },
    ] as Client[]),
    codes: ([
      { id: "c1", code: "cp-0a1b2c3d4e", label: "LinkedIn", createdAt: "2026-10-04T09:00:00.000Z", revokedAt: null, links: links("cp-0a1b2c3d4e") },
      { id: "c2", code: "cp-9f8e7d6c5b", label: "Feria Valladolid", createdAt: "2026-09-04T09:00:00.000Z", revokedAt: "2026-10-01T09:00:00.000Z", links: links("cp-9f8e7d6c5b") },
    ] as Code[]),
    referrals: [
      { orgId: "r1", workspace: "Gestoría Centro", code: "cp-0a1b2c3d4e", attributedVia: "signup", attributedAt: "2026-10-06T09:00:00.000Z", firstPaidAt: "2026-10-07T09:00:00.000Z", paidOrders: 2, revenueNetCents: 7000, revenueShareCents: 1400 },
      { orgId: "r2", workspace: "Hotel Mirador", code: "cp-0a1b2c3d4e", attributedVia: "signup", attributedAt: "2026-10-08T09:00:00.000Z", firstPaidAt: null, paidOrders: 0, revenueNetCents: null, revenueShareCents: null },
    ],
    revenue: { netCents: 7000, shareCents: 1400 },
    allowance: { monthlyCredits: 5000, validFrom: "2026-10-01", validUntil: null, period: "2026-10", grantedCredits: 1500, remainingCredits: 3500,
      grants: [{ id: "g1", orgId: CLIENT, workspace: "Seguros Ribera", period: "2026-10", credits: 1500, at: "2026-10-03T10:00:00.000Z" }] },
  };
}

type Call = { method: string; path: string; body: unknown; key: string | null };
async function routePartner(page: Page, role: "admin" | "member" = "admin") {
  const calls: Call[] = [];
  const state = overview(role);
  await page.route("**/api/evals/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const body = method === "GET" || method === "HEAD" ? null : route.request().postDataJSON();
    if (method !== "GET") calls.push({ method, path: url.pathname, body, key: route.request().headers()["idempotency-key"] ?? null });
    const json = (data: unknown) => route.fulfill({ json: { data, meta: {} } });
    if (url.pathname === `/api/evals/v1/partners/${PARTNER}` && method === "GET") return json(state);
    if (url.pathname === `/api/evals/v1/partners/${PARTNER}/clients` && method === "POST") {
      const name = (body as { name: string }).name;
      state.clients.unshift({ ...state.clients[0], orgId: "00000000-0000-4000-8000-000000000b09", name, evaluations: 0, runsThisMonth: 0, lastRun: null, latestScore: null, latestScored: null, availableCredits: 0, usedThisMonthCredits: 0 });
      return json({ orgId: "00000000-0000-4000-8000-000000000b09", name });
    }
    if (url.pathname === `/api/evals/v1/partners/${PARTNER}/codes` && method === "POST") {
      state.codes.unshift({ id: "c3", code: "cp-1234567890", label: (body as { label?: string }).label ?? null, createdAt: new Date().toISOString(), revokedAt: null, links: links("cp-1234567890") });
      return json(state.codes[0]);
    }
    if (url.pathname === `/api/evals/v1/partners/${PARTNER}/codes` && method === "DELETE") {
      const code = state.codes.find((item) => item.id === (body as { codeId: string }).codeId)!;
      code.revokedAt = new Date().toISOString();
      return json({ id: code.id, revokedAt: code.revokedAt });
    }
    if (url.pathname === `/api/evals/v1/partners/${PARTNER}/logo` && method === "PUT") {
      state.partner.logo = { sha256: "ab".repeat(32), mediaType: "image/png", bytes: 120, updatedAt: new Date().toISOString() };
      return json({ sha256: "ab".repeat(32), mediaType: "image/png", bytes: 120, width: 120, height: 40 });
    }
    if (url.pathname === `/api/evals/v1/partners/${PARTNER}/logo` && method === "GET") return route.fulfill({ status: 200, headers: { "content-type": "image/png" }, body: Buffer.from("89504e470d0a1a0a", "hex") });
    if (url.pathname === `/api/evals/v1/partners/${PARTNER}/logo` && method === "DELETE") { state.partner.logo = null; return json({ removed: true }); }
    // Shell polling (notifications, activity) answers empty.
    return json([]);
  });
  return calls;
}

for (const width of [1440, 768, 390]) {
  test(`partner dashboard for a partner admin at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await routePartner(page);
    await page.goto("/partner?viewer");
    await expect(page.getByRole("heading", { level: 1, name: "Agencia Norte" })).toBeVisible();
    await expect(page.locator(".p-head-meta").getByText("Partner admin", { exact: true })).toBeVisible();
    await expect(page.getByText("Stripe test mode: these amounts are test payments, not revenue.")).toBeVisible();
    await page.screenshot({ path: `/tmp/caudals-l28-partner-top-${width}.png` });
    // Stats: revenue and share from paid referrals; the allowance left this month.
    await expect(page.locator(".p-stat").filter({ hasText: "Referred revenue" })).toContainText("€70.00");
    await expect(page.locator(".p-stat").filter({ hasText: "Your share" })).toContainText("€14.00");
    await expect(page.locator(".p-stat").filter({ hasText: "Your share" })).toContainText("20 % or 1,400 credits");
    await expect(page.locator(".p-stat").filter({ hasText: "Allowance left this month" })).toContainText("3,500");
    // Clients with activity; unknown values show a dash.
    const clients = page.getByRole("region", { name: "Clients" });
    await expect(clients.getByRole("row", { name: /Seguros Ribera/ })).toContainText("72 %");
    await expect(clients.getByRole("row", { name: /Clínica Dental Sol/ })).toContainText("Shared with you");
    await expect(clients.getByRole("link", { name: "Open Seguros Ribera" })).toHaveAttribute("href", `/workspace/evaluations?orgId=${CLIENT}`);
    // Referred accounts: revenue stays empty until a payment.
    const referred = page.getByRole("region", { name: "Referred accounts" });
    await expect(referred.getByRole("row", { name: /Gestoría Centro/ })).toContainText("€70.00");
    await expect(referred.getByRole("row", { name: /Hotel Mirador/ })).toContainText("None yet");
    await expect(referred.getByRole("row", { name: /Hotel Mirador/ })).not.toContainText("€0");
    // Statement download for the chosen month in the running mode.
    await page.getByLabel("Month").fill("2026-09");
    await expect(page.getByRole("link", { name: "Download CSV" })).toHaveAttribute("href", `/api/evals/v1/partners/${PARTNER}/statement?month=2026-09&mode=test`);
    // Navigation: the Partner group.
    if (width > 768) await expect(page.getByRole("link", { name: "Partner dashboard" })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `/tmp/caudals-l28-partner-${width}.png`, fullPage: true });
  });
}

test("partner admins create a client, a referral link (copied) and revoke one with a reason", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const calls = await routePartner(page);
  await page.goto("/partner?viewer");
  await page.getByRole("button", { name: "New client workspace" }).click();
  await page.getByLabel("Client name").fill("Bodegas Duero");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("region", { name: "Clients" }).getByRole("row", { name: /Bodegas Duero/ })).toBeVisible();
  const create = calls.find((call) => call.path.endsWith("/clients"))!;
  expect(create).toMatchObject({ method: "POST", body: { name: "Bodegas Duero" } });
  expect(create.key).toMatch(/^[0-9a-f-]{36}$/);

  await page.getByRole("button", { name: "New referral link" }).click();
  await page.getByLabel("Label (optional)").fill("Newsletter");
  await page.getByRole("button", { name: "Create link" }).click();
  const links = page.getByRole("region", { name: "Referral links" });
  await expect(links.getByRole("row", { name: /cp-1234567890/ })).toContainText("Newsletter");
  await links.getByRole("row", { name: /cp-1234567890/ }).getByRole("button", { name: /Sign-up/ }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("https://app.caudals.com/workspace/start?utm_source=partner&utm_medium=referral&partner=cp-1234567890");

  await links.getByRole("row", { name: /cp-0a1b2c3d4e/ }).getByRole("button", { name: "Revoke" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Revoke" })).toBeDisabled();
  await dialog.getByLabel("Reason").fill("Campaign ended");
  await dialog.getByRole("button", { name: "Revoke" }).click();
  await expect(links.getByRole("row", { name: /cp-0a1b2c3d4e/ })).toContainText("Revoked");
  expect(calls.find((call) => call.method === "DELETE")).toMatchObject({ path: `/api/evals/v1/partners/${PARTNER}/codes`, body: { codeId: "c1", reason: "Campaign ended" } });
  // A revoked link offers nothing to copy.
  await expect(links.getByRole("row", { name: /cp-9f8e7d6c5b/ }).getByRole("button", { name: /Sign-up/ })).toHaveCount(0);
});

test("partner admins upload a PNG logo; other files are refused in the browser", async ({ page }) => {
  const calls = await routePartner(page);
  await page.goto("/partner?viewer");
  await expect(page.getByText("No logo yet.")).toBeVisible();
  const input = page.getByTestId("partner-logo-input");
  await input.setInputFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await expect(page.getByText("Use a PNG or JPEG image.")).toBeVisible();
  expect(calls.filter((call) => call.path.endsWith("/logo"))).toHaveLength(0);
  await input.setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a0000000d49484452", "hex") });
  await expect(page.locator(".p-partner-logo img")).toHaveAttribute("src", `/api/evals/v1/partners/${PARTNER}/logo?v=${"ab".repeat(6)}`);
  expect(calls.find((call) => call.method === "PUT")?.body).toEqual({ imageBase64: Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").toString("base64") });
  await page.getByRole("button", { name: "Remove logo" }).click();
  await expect(page.getByText("No logo yet.")).toBeVisible();
});

test("partner members read but create nothing", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await routePartner(page, "member");
  await page.goto("/partner?viewer&member");
  await expect(page.locator(".p-head-meta").getByText("Partner member", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "New client workspace" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New referral link" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Revoke" })).toHaveCount(0);
  await expect(page.getByText("A partner admin manages the logo.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Referral links" }).getByRole("row", { name: /cp-0a1b2c3d4e/ })).toContainText("Live");
  expect(await noHorizontalScroll(page)).toBe(true);
});

for (const width of [1440, 390]) {
  test(`the partner dashboard reads in Spanish at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await spanish(page);
    await routePartner(page);
    await page.goto("/partner?viewer");
    await expect(page.locator(".p-head-meta").getByText("Admin del partner", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Enlaces de referido" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cuentas referidas" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Extracto mensual" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Marca en los informes" })).toBeVisible();
    await expect(page.locator(".p-stat").filter({ hasText: "Ingresos referidos" })).toContainText("70,00");
    await expect(page.getByRole("region", { name: "Cuentas referidas" }).getByRole("row", { name: /Hotel Mirador/ })).toContainText("Todavía ninguno");
    await expect(page.getByRole("button", { name: "Nuevo espacio de cliente" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Descargar CSV" })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `/tmp/caudals-l28-partner-es-${width}.png`, fullPage: true });
  });
}
