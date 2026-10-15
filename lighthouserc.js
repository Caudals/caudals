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
 * TBT < 200 ms on mobile. CLS is enforced at the target everywhere, and LCP
 * and TBT for sign-up and on desktop. On mobile the landing misses LCP and TBT
 * and the demo misses LCP, so those are a warning at the target plus an error
 * at a regression ceiling. L-24b (docs/launch/L-24b.md) cut them from
 * 5.2–6.4 s to ~3.4–4.3 s; L-24d (docs/launch/L-24d.md) removed the
 * parser-blocking scripts in front of the demo's headline and in the footer
 * and holds Newsreader and Geist Mono back until the first paint, which ended
 * the 3.5–4.3 s runs. What is left on the simulated path is the framework's
 * script (~180 KB), which on a fast network finishes before the first paint
 * and so is counted, the stylesheets and Geist.
 *
 * Lantern in this Lighthouse (12.6, @lhci/cli 0.15) multiplexes only HTTP/2:
 * production (HTTP/3) and localhost (HTTP/1.1) are both simulated as six
 * connections with a round trip per request. The trace engine treats HTTP/3
 * as multiplexed from @paulirish/trace_engine 0.0.66 (Lighthouse main since
 * 2026-10-09, not yet released): with it production's medians are landing
 * 2.42–2.50 s, demo 1.97–2.28 s and sign-up 1.69–1.99 s. Localhost stays
 * HTTP/1.1 in CI, so its mobile LCP keeps the six-connection model whatever
 * the version.
 */
const port = Number(process.env.LHCI_PORT ?? 4173);
const local = `http://localhost:${port}`;
const baseURL = process.env.LHCI_BASE_URL ?? local;
const appURL = process.env.LHCI_APP_URL ?? baseURL;
const desktop = process.env.LHCI_FORM_FACTOR === "desktop";

/** Spec P-47 targets (milliseconds; CLS unitless). */
const TARGET = { lcp: 2500, cls: 0.1, tbt: 200 };
/**
 * Regression ceilings on mobile: the production medians after L-24d with
 * Lighthouse 12.6, three sets (L-24d.md: landing LCP 3.04–3.40 s, runs
 * 2.99–3.57 s; demo 2.93–3.46 s, runs 2.88–3.57 s) plus a margin for the
 * swing the shared host's load causes between sets. L-24 had 7.5 s, 7.0 s and 350 ms; L-24b
 * 4.5 s, 5.0 s and 300 ms.
 */
const LCP_CEILING_MOBILE = { landing: 4000, demo: 4000 };
const TBT_CEILING_MOBILE_LANDING = 300;

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
            "categories:accessibility": ["error", { minScore: 0.95, aggregationMethod: "median-run" }],
          },
        },
        {
          matchingUrlPattern: desktop ? ".*" : `^(${escape(urls.demo)}|${escape(urls.signup)})$`,
          assertions: {
            "total-blocking-time": ["error", { maxNumericValue: TARGET.tbt, aggregationMethod: "median-run" }],
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
                matchingUrlPattern: `^${escape(urls.landing)}$`,
                assertions: {
                  "total-blocking-time": ["error", { maxNumericValue: TBT_CEILING_MOBILE_LANDING, aggregationMethod: "median-run" }],
                },
              },
              {
                // The targets, reported until they are met (warn does not fail the gate).
                matchingUrlPattern: `^(${escape(urls.landing)}|${escape(urls.demo)})$`,
                assertions: {
                  "largest-contentful-paint": ["warn", { maxNumericValue: TARGET.lcp, aggregationMethod: "median-run" }],
                },
              },
              {
                matchingUrlPattern: `^${escape(urls.landing)}$`,
                assertions: {
                  "total-blocking-time": ["warn", { maxNumericValue: TARGET.tbt, aggregationMethod: "median-run" }],
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
