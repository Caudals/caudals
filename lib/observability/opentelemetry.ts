import "server-only";

import { trace } from "@opentelemetry/api";
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

export function registerOpenTelemetry() {
  if (
    process.env.OTEL_STDOUT_ENABLED !== "true" ||
    globalThis.__caudalsOpenTelemetryProvider
  ) {
    return;
  }

  const provider = new BasicTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "caudals-web",
    }),
    spanProcessors: [new BatchSpanProcessor(new ConsoleSpanExporter())],
  });

  trace.setGlobalTracerProvider(provider);
  globalThis.__caudalsOpenTelemetryProvider = provider;
}
