import type { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";

import type { Env } from "./config/env.validation";
import { metricsMiddleware } from "./observability/metrics.middleware";
import { MetricsService } from "./observability/metrics.service";

/** Middleware/header wiring shared by bootstrap and e2e tests. */
export function configureApp(app: NestExpressApplication, config: ConfigService<Env, true>): void {
  app.disable("x-powered-by");
  app.use(helmet());
  // First in the chain: guard rejections and unmatched routes are timed too.
  app.use(metricsMiddleware(app.get(MetricsService)));
  app.enableCors({ origin: config.get("CORS_ORIGINS", { infer: true }), credentials: false });
}
