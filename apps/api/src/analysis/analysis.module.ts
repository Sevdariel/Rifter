import { Module } from "@nestjs/common";

import { MatchesModule } from "../matches/matches.module";
import { OllamaModule } from "../ollama/ollama.module";
import { ReportsModule } from "../reports/reports.module";
import { AnalysisJobsRepository } from "./analysis-jobs.repository";
import { AnalysisJobsService } from "./analysis-jobs.service";
import { AnalysisWorkerService } from "./analysis-worker.service";
import { AnalysisController } from "./analysis.controller";
import { AnalysisService } from "./analysis.service";

@Module({
  imports: [MatchesModule, OllamaModule, ReportsModule],
  controllers: [AnalysisController],
  providers: [AnalysisJobsRepository, AnalysisJobsService, AnalysisService, AnalysisWorkerService],
  exports: [AnalysisJobsService],
})
export class AnalysisModule {}
