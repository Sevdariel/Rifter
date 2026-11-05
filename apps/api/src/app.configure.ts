import type { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";

import type { Env } from "./config/env.validation";

/** Middleware/header wiring shared by bootstrap and e2e tests. */
export function configureApp(app: NestExpressApplication, config: ConfigService<Env, true>): void {
  app.disable("x-powered-by");
  app.use(helmet());
  app.enableCors({ origin: config.get("CORS_ORIGINS", { infer: true }), credentials: false });
}
