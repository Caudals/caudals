/**
 * Lighthouse CI budgets (launch L-24, spec P-47): the landing, the demo and
 * direct sign-up, on mobile (the default: Lighthouse's simulated slow 4G and
 * 4× CPU) and desktop (`LHCI_FORM_FACTOR=desktop`).
 *
 * - CI builds the app and starts it locally (`.github/workflows/ci.yml`).
 * - Against a deployed site: `LHCI_BASE_URL=https://caudals.com
 *   LHCI_APP_URL=https://app.caudals.com npx lhci autorun` (docs/TOOLS.md).
 *
 * Every URL runs three times and the median run is asserted, so one noisy run
 * cannot fail the gate. The spec's targets are LCP < 2.5 s, CLS < 0.1 and
 * TBT < 200 ms on mobile. CLS and TBT are enforced at the target. LCP is
 * enforced at the target for sign-up; the landing and the demo do not meet it
 * yet (their shared site weight, see docs/launch/L-24.md), so their LCP is a
 * warning at the target plus an error at a regression ceiling until the
 * public-site weight follow-up lands.
 */
const port = Number(process.env.LHCI_PORT ?? 4173);
const local = `http://localhost:${port}`;
const baseURL = process.env.LHCI_BASE_URL ?? local;
const appURL = process.env.LHCI_APP_URL ?? baseURL;
const desktop = process.env.LHCI_FORM_FACTOR === "desktop";

/** Spec P-47 targets (milliseconds; CLS unitless). */
const TARGET = { lcp: 2500, cls: 0.1, tbt: 200 };
/** Regression ceilings for the landing and demo LCP on mobile, from the production medians in L-24.md plus a margin. */
const LCP_CEILING_MOBILE = { landing: 6000, demo: 6000 };

const urls = {
  landing: `${baseURL}/en`,
  demo: `${baseURL}/en/demo`,
  signup: `${appURL}/workspace/start`,
};
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** @type {import('@lhci/cli/src/types').LighthouseCiConfig} */
module.exports = {
  ci: {
    collect: {
      ...(process.env.LHCI_BASE_URL
        ? {}
        : {
            startServerCommand: `npm run start -- --port ${port}`,
            startServerReadyPattern: "Ready in",
          }),
      url: Object.values(urls),
      numberOfRuns: 3,
      settings: {
        ...(desktop ? { preset: "desktop" } : {}),
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
            "cumulative-layout-shift": ["error", { maxNumericValue: TARGET.cls, aggregationMethod: "median-run" }],
            "total-blocking-time": ["error", { maxNumericValue: TARGET.tbt, aggregationMethod: "median-run" }],
            "categories:accessibility": ["error", { minScore: 0.95, aggregationMethod: "median-run" }],
          },
        },
        {
          matchingUrlPattern: `^${escape(urls.signup)}$`,
          assertions: {
            "largest-contentful-paint": ["error", { maxNumericValue: TARGET.lcp, aggregationMethod: "median-run" }],
          },
        },
        ...(desktop
          ? [
              {
                matchingUrlPattern: `^(${escape(urls.landing)}|${escape(urls.demo)})$`,
                assertions: {
                  "largest-contentful-paint": ["error", { maxNumericValue: TARGET.lcp, aggregationMethod: "median-run" }],
                },
              },
            ]
          : [
              {
                matchingUrlPattern: `^${escape(urls.landing)}$`,
                assertions: {
                  "largest-contentful-paint": ["error", { maxNumericValue: LCP_CEILING_MOBILE.landing, aggregationMethod: "median-run" }],
                },
              },
              {
                matchingUrlPattern: `^${escape(urls.demo)}$`,
                assertions: {
                  "largest-contentful-paint": ["error", { maxNumericValue: LCP_CEILING_MOBILE.demo, aggregationMethod: "median-run" }],
                },
              },
              {
                // The target, reported until it is met (warn does not fail the gate).
                matchingUrlPattern: `^(${escape(urls.landing)}|${escape(urls.demo)})$`,
                assertions: {
                  "largest-contentful-paint": ["warn", { maxNumericValue: TARGET.lcp, aggregationMethod: "median-run" }],
                },
              },
            ]),
      ],
    },
    upload: {
      target: "filesystem",
      outputDir: process.env.LHCI_OUTPUT_DIR ?? `lighthouse-reports/${desktop ? "desktop" : "mobile"}`,
    },
  },
};
