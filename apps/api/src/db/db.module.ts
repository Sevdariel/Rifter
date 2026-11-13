import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env.validation";
import { createDatabase, DRIZZLE, type DatabaseHandle } from "./database";

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      // Null when DATABASE_URL is unset: the API still boots (dev harness,
      // e2e) and consumers decide how to degrade. Domain slices that require
      // persistence are exercised with the URL configured.
      useFactory: (config: ConfigService<Env, true>): DatabaseHandle | null => {
        const url = config.get("DATABASE_URL", { infer: true });
        return url ? createDatabase(url) : null;
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DRIZZLE) private readonly handle: DatabaseHandle | null) {}

  async onApplicationShutdown(): Promise<void> {
    await this.handle?.client.end();
  }
}
