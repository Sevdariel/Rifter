// Sentry must initialize before Nest exists (OpenTelemetry provider hooks).
import "./instrument";
import "reflect-metadata";

import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Logger } from "nestjs-pino";

import { configureApp } from "./app.configure";
import { AppModule } from "./app.module";
import type { Env } from "./config/env.validation";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  const config = app.get(ConfigService<Env, true>);
  configureApp(app, config);
  const host = config.get("HOST", { infer: true });
  const port = config.get("PORT", { infer: true });
  await app.listen(port, host);
  app.get(Logger).log(`API listening on http://${host}:${port}`);
}

void bootstrap();
