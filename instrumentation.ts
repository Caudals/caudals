import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerOpenTelemetry } = await import(
      "./lib/observability/opentelemetry"
    );
    registerOpenTelemetry();
    await import("./sentry.server.config");
    // Resume durable demo work and pending notifications after a restart,
    // even when the visitor closed the report page. Build workers never run it.
    if (process.env.DEMO_ENABLED === "true" && process.env.NEXT_PHASE !== "phase-production-build") {
      const { ensureDemoRunner } = await import("./lib/demo/runner");
      ensureDemoRunner();
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
