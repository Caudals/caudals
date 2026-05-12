import "server-only";

import { trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  ConsoleSpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

declare global {
  var __caudalsOpenTelemetryProvider: BasicTracerProvider | undefined;
}

export type OpenTelemetryRuntimeConfig = {
  serviceName: string;
  stdoutEnabled: boolean;
  otlpTracesEndpoint: string | null;
  otlpHeaders: Record<string, string>;
};

export function parseOtelHeaders(value?: string | null) {
  if (!value) {
    return {};
  }

  return Object.fromEntries(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [key, ...rest] = entry.split("=");
        return [key.trim(), rest.join("=").trim()];
      })
      .filter(([key, headerValue]) => key && headerValue),
  );
}

export function getOpenTelemetryRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): OpenTelemetryRuntimeConfig {
  return {
    serviceName: env.OTEL_SERVICE_NAME ?? "caudals-web",
    stdoutEnabled: env.OTEL_STDOUT_ENABLED === "true",
    otlpTracesEndpoint: env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || null,
    otlpHeaders: parseOtelHeaders(
      env.OTEL_EXPORTER_OTLP_TRACES_HEADERS ?? env.OTEL_EXPORTER_OTLP_HEADERS,
    ),
  };
}

export function registerOpenTelemetry() {
  if (globalThis.__caudalsOpenTelemetryProvider) {
    return;
  }

  const config = getOpenTelemetryRuntimeConfig();
  const spanProcessors = [];

  if (config.otlpTracesEndpoint) {
    spanProcessors.push(
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: config.otlpTracesEndpoint,
          headers: config.otlpHeaders,
        }),
      ),
    );
  }

  if (config.stdoutEnabled) {
    spanProcessors.push(new BatchSpanProcessor(new ConsoleSpanExporter()));
  }

  if (spanProcessors.length === 0) {
    return;
  }

  const provider = new BasicTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
    }),
    spanProcessors,
  });

  const registered = trace.setGlobalTracerProvider(provider);
  if (!registered) {
    console.warn(
      "[otel] OpenTelemetry provider was already registered; Caudals OTLP exporter was not installed.",
    );
    return;
  }

  globalThis.__caudalsOpenTelemetryProvider = provider;

  const bootstrapSpan = trace
    .getTracer("caudals.observability")
    .startSpan("observability.bootstrap");
  bootstrapSpan.setAttribute(
    "caudals.otel.otlp_enabled",
    Boolean(config.otlpTracesEndpoint),
  );
  bootstrapSpan.setAttribute("caudals.otel.stdout_enabled", config.stdoutEnabled);
  bootstrapSpan.end();

  provider.forceFlush().catch((error: unknown) => {
    console.warn(
      "[otel] OpenTelemetry bootstrap flush failed.",
      error instanceof Error ? error.message : String(error),
    );
  });
}
