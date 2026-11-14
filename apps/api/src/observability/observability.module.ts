import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";

import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";
import { pinoOptions } from "./pino-options.factory";

/**
 * Logging + metrics for the whole API. Imported once by AppModule; other
 * slices take `MetricsService` through `imports: [ObservabilityModule]`.
 * The request-duration middleware is registered in `configureApp` (it must
 * wrap the whole pipeline, not just routed handlers). Sentry is initialized
 * in `instrument.ts` (before Nest exists) and errors are reported from
 * `ApiExceptionFilter`.
 */
@Module({
  imports: [LoggerModule.forRootAsync({ inject: [ConfigService], useFactory: pinoOptions })],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class ObservabilityModule {}
