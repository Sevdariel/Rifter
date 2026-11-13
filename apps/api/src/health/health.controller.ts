import { Controller, Get, Inject, Logger, Optional } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { Public } from "../auth/public.decorator";
import { DRIZZLE } from "../db/database";
import type { DatabaseHandle } from "../db/db.types";
import type { DbState, HealthBody } from "./health.types";

@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  public constructor(@Optional() @Inject(DRIZZLE) private readonly handle: DatabaseHandle | null) {}

  @Public()
  @Get()
  public async check(): Promise<HealthBody> {
    const db = await this.dbState();
    const body: HealthBody = { status: "ok", db };
    return body;
  }

  private async dbState(): Promise<DbState> {
    if (!this.handle) return "disabled";
    try {
      await this.handle.db.execute(sql`select 1`);
      return "up";
    } catch (error) {
      this.logger.debug(`db health check failed: ${error instanceof Error ? error.message : String(error)}`);
      return "down";
    }
  }
}
