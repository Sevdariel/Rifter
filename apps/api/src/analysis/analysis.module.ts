import { Module } from "@nestjs/common";

import { AnalysisJobsRepository } from "./analysis-jobs.repository";
import { AnalysisJobsService } from "./analysis-jobs.service";

@Module({
  providers: [AnalysisJobsRepository, AnalysisJobsService],
  exports: [AnalysisJobsService],
})
export class AnalysisModule {}
