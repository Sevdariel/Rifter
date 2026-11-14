import * as Sentry from "@sentry/nestjs";

import { scrubSentryEvent } from "./observability/sentry.scrub";

// Must run before NestFactory so the OpenTelemetry hooks instrument every
// provider. DSN comes straight from the environment because ConfigModule
// does not exist yet; absence simply disables Sentry.
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    // Error reporting only — perf tracing off; metrics come from prom-client.
    tracesSampleRate: 0,
    beforeSend: scrubSentryEvent,
  });
}
