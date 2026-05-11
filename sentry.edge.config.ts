import * as Sentry from "@sentry/nextjs";

import { getSentryOptions } from "@/lib/observability/sentry-config";

Sentry.init(getSentryOptions());
