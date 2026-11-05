import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { configureApp } from "./app.configure";
import { AppModule } from "./app.module";
import type { Env } from "./config/env.validation";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService<Env, true>);
  configureApp(app, config);
  const host = config.get("HOST", { infer: true });
  const port = config.get("PORT", { infer: true });
  await app.listen(port, host);
  new Logger("Bootstrap").log(`API listening on http://${host}:${port}`);
}

void bootstrap();
