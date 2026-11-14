import { Controller, Get, Param } from "@nestjs/common";

import { Identity } from "../auth/identity.decorator";
import type { PlayerIdentity } from "../auth/identity";
import { ReportsService } from "./reports.service";
import type { ReportDetail, ReportSummary } from "./reports.types";

@Controller("reports")
export class ReportsController {
  public constructor(private readonly reportsService: ReportsService) {}

  @Get()
  public async list(@Identity() identity: PlayerIdentity): Promise<ReportSummary[]> {
    const summaries = await this.reportsService.list(identity.puuid);
    return summaries;
  }

  @Get(":matchId")
  public async get(@Identity() identity: PlayerIdentity, @Param("matchId") matchId: string): Promise<ReportDetail> {
    const detail = await this.reportsService.get(identity.puuid, matchId);
    return detail;
  }
}
