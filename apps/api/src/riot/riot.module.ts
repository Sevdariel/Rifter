import { Module } from "@nestjs/common";

import { RiotClientService } from "./riot-client.service";

@Module({
  providers: [RiotClientService],
  exports: [RiotClientService],
})
export class RiotModule {}
