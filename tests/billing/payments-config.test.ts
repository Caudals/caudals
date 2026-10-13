/** Who may pay, in which mode, with which key (spec §6.18; decisions I-3, I-9). */
import { describe, expect, it } from "vitest";
import { keyMatchesMode, paymentsAccess, stripeMode, stripeSecretKey, stripeWebhookSecret, testWorkspaceIds } from "../../lib/billing/payments-config";
import { billingEmailAllowed } from "../../lib/billing/emails";
import { checkoutText } from "../../lib/billing/checkout";
import { creditsToUcr } from "../../lib/billing/units";

const ORG = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";
const ENTITY = { LEGAL_ENTITY_NAME: "Real Company SL", LEGAL_ENTITY_NIF: "B99999999", LEGAL_ENTITY_ADDRESS: "Real Street 1, Madrid" };

describe("Stripe mode and keys", () => {
  it("defaults to test mode; only an exact 'live' switches", () => {
    expect(stripeMode({})).toBe("test");
    expect(stripeMode({ BILLING_STRIPE_MODE: "LIVE" })).toBe("test");
    expect(stripeMode({ BILLING_STRIPE_MODE: "live" })).toBe("live");
  });
  it("accepts a key only for its own mode, judged by prefix", () => {
    expect(keyMatchesMode("sk_test_x", "test")).toBe(true);
    expect(keyMatchesMode("rk_test_x", "test")).toBe(true);
    expect(keyMatchesMode("sk_live_x", "test")).toBe(false);
    expect(keyMatchesMode("sk_test_x", "live")).toBe(false);
    expect(() => stripeSecretKey({ STRIPE_SECRET_KEY: "sk_live_x" })).toThrow("STRIPE_MODE_MISMATCH");
    expect(() => stripeSecretKey({})).toThrow("STRIPE_KEY_MISSING");
    expect(stripeSecretKey({ STRIPE_SECRET_KEY: "sk_test_x" })).toBe("sk_test_x");
  });
  it("uses one webhook secret per mode", () => {
    expect(stripeWebhookSecret({ STRIPE_TEST_WEBHOOK_SECRET: "whsec_t", STRIPE_LIVE_WEBHOOK_SECRET: "whsec_l" })).toBe("whsec_t");
    expect(stripeWebhookSecret({ BILLING_STRIPE_MODE: "live", STRIPE_TEST_WEBHOOK_SECRET: "whsec_t", STRIPE_LIVE_WEBHOOK_SECRET: "whsec_l" })).toBe("whsec_l");
    expect(() => stripeWebhookSecret({ STRIPE_WEBHOOK_SECRET: "whsec_legacy" })).toThrow("WEBHOOK_SECRET_MISSING");
  });
});

describe("payments access", () => {
  it("test mode serves only the listed internal workspaces, whatever BILLING_CREDITS_ENABLED says", () => {
    const env = { STRIPE_SECRET_KEY: "sk_test_x", BILLING_TEST_WORKSPACE_IDS: ` ${ORG.toUpperCase()} , not-a-uuid`, BILLING_CREDITS_ENABLED: "true" };
    expect([...testWorkspaceIds(env)]).toEqual([ORG]);
    expect(paymentsAccess(ORG, env)).toBe("test_workspace");
    expect(paymentsAccess(OTHER, env)).toBe("closed");
  });
  it("live mode opens to owners only with BILLING_CREDITS_ENABLED and the real company data", () => {
    const live = { BILLING_STRIPE_MODE: "live", STRIPE_SECRET_KEY: "sk_live_x" };
    expect(paymentsAccess(ORG, live)).toBe("closed");
    expect(paymentsAccess(ORG, { ...live, BILLING_CREDITS_ENABLED: "true" })).toBe("closed");
    expect(paymentsAccess(ORG, { ...live, BILLING_CREDITS_ENABLED: "true", ...ENTITY })).toBe("open");
    expect(paymentsAccess(ORG, { ...live, BILLING_CREDITS_ENABLED: "true", ...ENTITY, LEGAL_ENTITY_NIF: "B00000000" })).toBe("closed");
    expect(paymentsAccess(ORG, { ...live, BILLING_CREDITS_ENABLED: "true" }, { requireEntity: false })).toBe("open");
  });
  it("closes when the key is missing or of the other mode", () => {
    expect(paymentsAccess(ORG, { BILLING_TEST_WORKSPACE_IDS: ORG })).toBe("closed");
    expect(paymentsAccess(ORG, { STRIPE_SECRET_KEY: "sk_live_x", BILLING_TEST_WORKSPACE_IDS: ORG })).toBe("closed");
  });
});

describe("billing emails in test mode", () => {
  it("go only to Caudals' own addresses", () => {
    const env = { COLLABORATION_NOTIFICATION_EMAIL: "Team@Internal.example" };
    expect(billingEmailAllowed("team@internal.example", env)).toBe(true);
    expect(billingEmailAllowed("ops@caudals.com", env)).toBe(true);
    expect(billingEmailAllowed("customer@acme.es", env)).toBe(false);
    expect(billingEmailAllowed("customer@acme.es", { BILLING_STRIPE_MODE: "live" })).toBe(true);
  });
});

describe("Checkout page text", () => {
  const order = { baseUcr: creditsToUcr(2000), packBonusUcr: BigInt(0), firstBonusUcr: creditsToUcr(400) };
  it("names the credits and the bonus in the buyer's language, with the legal mention when no IVA applies", () => {
    expect(checkoutText({ ...order, taxTreatment: "es_vat" }, "en")).toEqual({ productName: "2,000 Caudals credits", productDescription: "Includes 400 bonus credits. Valid for 24 months.", submitMessage: null });
    expect(checkoutText({ ...order, taxTreatment: "eu_reverse_charge" }, "es")).toMatchObject({ productName: "2000 créditos de Caudals", submitMessage: "Inversión del sujeto pasivo: no se aplica IVA español." });
    expect(checkoutText({ ...order, firstBonusUcr: BigInt(0), taxTreatment: "non_eu_not_subject" }, "en")).toMatchObject({ productDescription: "Valid for 24 months.", submitMessage: "Not subject to Spanish VAT (Operación no sujeta)." });
  });
});

describe("no placeholder company data in what Stripe or customers see (spec §3.2)", () => {
  it("the Stripe-facing code and the receipt copy carry none of the §3.2 values", async () => {
    const { readFileSync } = await import("node:fs");
    const { LEGAL_CONTENT_BANNED } = await import("../../lib/legal/placeholders");
    const sources = ["lib/billing/stripe.ts", "lib/billing/checkout.ts", "lib/billing/emails.ts", "lib/email/copy.ts"].map(file => readFileSync(file, "utf8"));
    for (const text of sources) expect(LEGAL_CONTENT_BANNED.filter(value => text.toLowerCase().includes(value.toLowerCase()))).toEqual([]);
  });
});
