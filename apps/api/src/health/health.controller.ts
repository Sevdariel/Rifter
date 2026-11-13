import { Controller, Get, Inject, Logger, Optional } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { Public } from "../auth/public.decorator";
import type { DatabaseHandle } from "../db/database";
import { DRIZZLE } from "../db/database";

interface HealthBody {
  status: "ok";
  db: "up" | "down" | "disabled";
}

@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @Optional() @Inject(DRIZZLE) private readonly handle: DatabaseHandle | null,
  ) {}

  @Public()
  @Get()
  async check(): Promise<HealthBody> {
    if (!this.handle) return { status: "ok", db: "disabled" };
    try {
      await this.handle.db.execute(sql`select 1`);
      return { status: "ok", db: "up" };
    } catch (error) {
      this.logger.debug(
        `db health check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { status: "ok", db: "down" };
    }
  }
}
