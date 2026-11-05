import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import { ApiExceptionFilter } from "./api-exception.filter";

@Module({
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class SharedModule {}
