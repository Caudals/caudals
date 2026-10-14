/**
 * Partner referral codes (launch L-28): `cp-` and ten hex characters, issued
 * by the database (evals.partner_create_code). A code travels on demo and
 * sign-up links as `?partner=` (or `?ref=`) and is saved with the first
 * consented touch (L-02, `caudals_attribution_v2`), so it reaches the
 * workspace at sign-up and its first payment.
 */
export const PARTNER_CODE = /^cp-[0-9a-f]{10}$/;

export function isPartnerCode(value: unknown): value is string {
  return typeof value === "string" && PARTNER_CODE.test(value);
}

/** The links a partner shares: the free test (demo) and direct sign-up, in each language. */
export function referralLinks(code: string, origins: { marketing: string; app: string }) {
  if (!isPartnerCode(code)) throw new Error("invalid_partner_code");
  const query = `utm_source=partner&utm_medium=referral&partner=${code}`;
  const marketing = origins.marketing.replace(/\/$/, "");
  const app = origins.app.replace(/\/$/, "");
  return {
    demo: { en: `${marketing}/en/demo?${query}`, es: `${marketing}/es/demo?${query}` },
    signup: `${app}/workspace/start?${query}`,
  };
}
