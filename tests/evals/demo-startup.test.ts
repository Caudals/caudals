import { afterEach, expect, it, vi } from "vitest";

const ensureDemoRunner = vi.hoisted(() => vi.fn());
vi.mock("@sentry/nextjs", () => ({ captureRequestError: vi.fn() }));
vi.mock("../../sentry.server.config", () => ({}));
vi.mock("../../sentry.edge.config", () => ({}));
vi.mock("@/lib/observability/opentelemetry", () => ({ registerOpenTelemetry: vi.fn() }));
vi.mock("@/lib/demo/runner", () => ({ ensureDemoRunner }));

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it.each([
  ["nodejs", "true", "phase-production-server", true],
  ["nodejs", "true", "phase-production-build", false],
  ["nodejs", "false", "phase-production-server", false],
  ["edge", "true", "phase-production-server", false],
])("starts durable demo work only in an enabled server (%s, %s, %s)", async (runtime, enabled, phase, starts) => {
  vi.stubEnv("NEXT_RUNTIME", runtime);
  vi.stubEnv("DEMO_ENABLED", enabled);
  vi.stubEnv("NEXT_PHASE", phase);
  const { register } = await import("../../instrumentation");
  await register();
  expect(ensureDemoRunner).toHaveBeenCalledTimes(starts ? 1 : 0);
});
