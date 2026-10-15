/**
 * Lighthouse CI budgets (launch L-24, spec P-47; made consistent in gap G4):
 * the landing, the demo, the public sample report (L-33) and direct sign-up,
 * on mobile (the default: Lighthouse's simulated slow 4G and 4× CPU) and
 * desktop (`LHCI_FORM_FACTOR=desktop`).
 *
 * - CI builds the app and starts it locally (`.github/workflows/ci.yml`).
 * - Against a deployed site: `LHCI_BASE_URL=https://caudals.com
 *   LHCI_APP_URL=https://app.caudals.com npx lhci autorun` (docs/TOOLS.md).
 *
 * Every URL runs three times and the median run is asserted, so one noisy run
 * cannot fail the gate. Two levels, the same on every page and form factor:
 *
 * - **Warning at the spec budget** (P-47: LCP < 2.5 s, TBT < 200 ms,
 *   CLS < 0.1), reported until it is met; a warning does not fail the job.
 * - **Error at a regression ceiling** (`CEILING`): the worst production median
 *   measured with the Lighthouse below, plus a margin for the swing between
 *   hosts and sets, and never below the budget. Where production meets the
 *   budget with room, the ceiling is the budget itself.
 *
 * The numbers refer to **Lighthouse 12.6.1** (pinned through `@lhci/cli`
 * 0.15.1 in package-lock.json). Lantern in this version multiplexes only
 * HTTP/2: production (HTTP/3) and localhost (HTTP/1.1) are both simulated as
 * six connections with a round trip per request, so mobile LCP is bound by the
 * number of requests before the first paint (L-24c, L-24d). A Lighthouse built
 * on `@paulirish/trace_engine` ≥ 0.0.66 multiplexes HTTP/3 and reports lower
 * values for production (L-24d.md); re-measure and reset the ceilings when the
 * version changes (`LIGHTHOUSE_VERSION` below warns when it does).
 */
const port = Number(process.env.LHCI_PORT ?? 4173);
const local = `http://localhost:${port}`;
const baseURL = process.env.LHCI_BASE_URL ?? local;
const appURL = process.env.LHCI_APP_URL ?? baseURL;
const formFactor = process.env.LHCI_FORM_FACTOR === "desktop" ? "desktop" : "mobile";

/** The Lighthouse version the ceilings were measured with. */
const LIGHTHOUSE_VERSION = "12.6.1";
try {
  const installed = require("lighthouse/package.json").version;
  if (installed !== LIGHTHOUSE_VERSION) {
    console.warn(`lighthouserc.js: the ceilings were measured with Lighthouse ${LIGHTHOUSE_VERSION}; this is ${installed}. Re-measure production and update CEILING.`);
  }
} catch {
  /* lhci resolves its own Lighthouse; the check is advisory */
}

/** Spec P-47 budget (milliseconds; CLS unitless): warnings everywhere. */
const BUDGET = { lcp: 2500, tbt: 200, cls: 0.1 };

/**
 * Regression ceilings (errors), per form factor and page, from production
 * with Lighthouse 12.6.1 (simulated throttling, the median run lhci asserts):
 * three mobile sets of L-24d (2026-10-15 08:33–09:23 UTC) and two of G4
 * (10:00–10:09 UTC), one desktop set of each (docs/launch/G4.md has every
 * value). Rule: the worst median run + 20 % for LCP and + 50 % for TBT (TBT
 * swings more with the host's load), rounded up to 0.25 s and 50 ms, never
 * below the budget. CLS stays at the budget: production measures ≤ 0.015.
 *
 *   mobile          worst LCP → ceiling   worst TBT → ceiling
 *   landing         3.57 s → 4.5 s        243 ms → 400 ms
 *   demo            3.46 s → 4.25 s        81 ms → 200 ms (budget)
 *   sample report   3.40 s → 4.25 s        76 ms → 200 ms (budget)
 *   sign-up         3.43 s → 4.25 s       153 ms → 250 ms
 *   desktop: every page ≤ 0.86 s LCP, ≤ 23 ms TBT, ≤ 0.015 CLS → the budget.
 */
const CEILING = {
  mobile: {
    landing: { lcp: 4500, tbt: 400, cls: BUDGET.cls },
    demo: { lcp: 4250, tbt: BUDGET.tbt, cls: BUDGET.cls },
    sampleReport: { lcp: 4250, tbt: BUDGET.tbt, cls: BUDGET.cls },
    signup: { lcp: 4250, tbt: 250, cls: BUDGET.cls },
  },
  desktop: {
    landing: BUDGET,
    demo: BUDGET,
    sampleReport: BUDGET,
    signup: BUDGET,
  },
};

const pages = {
  landing: `${baseURL}/en`,
  demo: `${baseURL}/en/demo`,
  // L-33: served while EXAMPLE_EVALUATION_ENABLED is on (404 otherwise), so the local server below starts with it.
  sampleReport: `${baseURL}/en/sample-report`,
  signup: `${appURL}/workspace/start`,
};
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const AUDITS = { lcp: "largest-contentful-paint", tbt: "total-blocking-time", cls: "cumulative-layout-shift" };
const limits = (level, values) =>
  Object.fromEntries(Object.entries(AUDITS).map(([key, audit]) => [audit, [level, { maxNumericValue: values[key], aggregationMethod: "median-run" }]]));

/** @type {import('@lhci/cli/src/types').LighthouseCiConfig} */
module.exports = {
  ci: {
    collect: {
      ...(process.env.LHCI_BASE_URL
        ? {}
        : {
            startServerCommand: `EXAMPLE_EVALUATION_ENABLED=true npm run start -- --port ${port}`,
            startServerReadyPattern: "Ready in",
          }),
      url: Object.values(pages),
      numberOfRuns: 3,
      settings: {
        ...(formFactor === "desktop" ? { preset: "desktop" } : {}),
        onlyCategories: ["performance", "accessibility"],
        // A stable runner: no extensions, no first-run noise, the same Chrome flags locally and in CI.
        chromeFlags: "--headless=new --no-sandbox --disable-dev-shm-usage --disable-extensions",
      },
    },
    assert: {
      assertMatrix: [
        {
          matchingUrlPattern: ".*",
          assertions: {
            ...limits("warn", BUDGET),
            "categories:accessibility": ["error", { minScore: 0.95, aggregationMethod: "median-run" }],
          },
        },
        ...Object.entries(pages).map(([page, url]) => ({
          matchingUrlPattern: `^${escape(url)}$`,
          assertions: limits("error", CEILING[formFactor][page]),
        })),
      ],
    },
    upload: {
      target: "filesystem",
      outputDir: process.env.LHCI_OUTPUT_DIR ?? `lighthouse-reports/${formFactor}`,
    },
  },
};
