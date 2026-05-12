import { describe, expect, it } from "vitest";

import {
  getOpenTelemetryRuntimeConfig,
  parseOtelHeaders,
} from "@/lib/observability/opentelemetry";

function env(values: Record<string, string | undefined> = {}) {
  return values as unknown as NodeJS.ProcessEnv;
}

describe("OpenTelemetry runtime config", () => {
  it("stays disabled unless an exporter is configured", () => {
    expect(getOpenTelemetryRuntimeConfig(env())).toEqual({
      serviceName: "caudals-web",
      stdoutEnabled: false,
      otlpTracesEndpoint: null,
      otlpHeaders: {},
    });
  });

  it("maps OTLP trace endpoint and headers for Tempo", () => {
    expect(
      getOpenTelemetryRuntimeConfig(
        env({
          OTEL_SERVICE_NAME: "caudals-api",
          OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:
            "http://tempo:4318/v1/traces",
          OTEL_EXPORTER_OTLP_HEADERS: "x-scope-orgid=generic",
          OTEL_EXPORTER_OTLP_TRACES_HEADERS:
            "x-scope-orgid=caudals,api-key=test=1",
        }),
      ),
    ).toEqual({
      serviceName: "caudals-api",
      stdoutEnabled: false,
      otlpTracesEndpoint: "http://tempo:4318/v1/traces",
      otlpHeaders: {
        "api-key": "test=1",
        "x-scope-orgid": "caudals",
      },
    });
  });

  it("ignores malformed OTLP header entries", () => {
    expect(parseOtelHeaders("good=value,missing,bad=,also=ok")).toEqual({
      also: "ok",
      good: "value",
    });
  });
});
