import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { DRIZZLE, type DatabaseHandle } from "./database";
import { drizzleFactory } from "./drizzle.factory";

@Global()
@Module({
  providers: [
    { provide: DRIZZLE, inject: [ConfigService], useFactory: drizzleFactory },
  ],
  exports: [DRIZZLE],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DRIZZLE) private readonly handle: DatabaseHandle | null) {}

  async onApplicationShutdown(): Promise<void> {
    await this.handle?.client.end();
  }
}
