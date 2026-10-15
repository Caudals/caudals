/**
 * Browser error monitoring.
 *
 * The browser reports to Sentry only when the build gives it a DSN
 * (`NEXT_PUBLIC_SENTRY_DSN`). Production images receive none (the image build
 * passes only `NEXT_PUBLIC_APP_URL`, and `SENTRY_DSN` is server-only), so the
 * SDK used to ship on every page, public and app, initialised with
 * `enabled: false`. It now loads only when a browser DSN is configured
 * (launch L-24b). Server, edge and worker reporting are unchanged
 * (`instrumentation.ts`, docs/TOOLS.md "Observability Runtime").
 */
type SentryModule = typeof import("@sentry/nextjs");

const browserDsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
let sentry: SentryModule | null = null;

if (browserDsn) {
  void Promise.all([import("@sentry/nextjs"), import("@/lib/observability/sentry-config")])
    .then(([module, { getSentryOptions }]) => {
      module.init(getSentryOptions(process.env, browserDsn));
      sentry = module;
    })
    .catch(() => {
      // Monitoring must never break the page.
    });
}

export function onRouterTransitionStart(...args: Parameters<SentryModule["captureRouterTransitionStart"]>) {
  sentry?.captureRouterTransitionStart(...args);
}
