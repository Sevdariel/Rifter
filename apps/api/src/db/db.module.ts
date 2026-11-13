import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { DRIZZLE } from "./database";
import type { DatabaseHandle } from "./db.types";
import { drizzleFactory } from "./drizzle.factory";

@Global()
@Module({
  providers: [
    { provide: DRIZZLE, inject: [ConfigService], useFactory: drizzleFactory },
  ],
  exports: [DRIZZLE],
})
export class DbModule implements OnApplicationShutdown {
  public constructor(@Inject(DRIZZLE) private readonly handle: DatabaseHandle | null) {}

  public async onApplicationShutdown(): Promise<void> {
    await this.handle?.client.end();
  }
}
