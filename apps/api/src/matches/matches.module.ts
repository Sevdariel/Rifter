import { Module } from "@nestjs/common";

import { RiotModule } from "../riot/riot.module";
import { MatchesController } from "./matches.controller";
import { MatchesRepository } from "./matches.repository";
import { MatchesService } from "./matches.service";
import { SyncStatusService } from "./sync-status.service";

@Module({
  imports: [RiotModule],
  controllers: [MatchesController],
  providers: [MatchesService, MatchesRepository, SyncStatusService],
})
export class MatchesModule {}
