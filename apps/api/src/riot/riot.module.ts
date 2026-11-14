import { Module } from "@nestjs/common";

import { ObservabilityModule } from "../observability/observability.module";
import { RiotClientService } from "./riot-client.service";

@Module({
  imports: [ObservabilityModule],
  providers: [RiotClientService],
  exports: [RiotClientService],
})
export class RiotModule {}
