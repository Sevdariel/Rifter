import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { AnalysisModule } from "./analysis/analysis.module";
import { AuthModule } from "./auth/auth.module";
import { TokenAuthGuard } from "./auth/token-auth.guard";
import { validateEnv } from "./config/env.validation";
import { DbModule } from "./db/db.module";
import { HealthModule } from "./health/health.module";
import { MatchesModule } from "./matches/matches.module";
import { ObservabilityModule } from "./observability/observability.module";
import { ReportsModule } from "./reports/reports.module";
import { SharedModule } from "./shared/shared.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Global floor; stricter per-route limits land with the fetch/analyze
    // endpoints that spend Riot calls and GPU minutes.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] }),
    SharedModule,
    AnalysisModule,
    AuthModule,
    DbModule,
    HealthModule,
    MatchesModule,
    ObservabilityModule,
    ReportsModule,
  ],
  // Throttle first, then authenticate.
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: TokenAuthGuard },
  ],
})
export class AppModule {}
