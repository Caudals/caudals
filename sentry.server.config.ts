import * as Sentry from "@sentry/nextjs";

import { getSentryServerOptions } from "@/lib/observability/sentry-server-config";

Sentry.init(getSentryServerOptions());
