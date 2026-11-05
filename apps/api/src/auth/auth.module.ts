import { Module } from "@nestjs/common";

import { DevIdentityResolver } from "./dev-identity.resolver";
import { IdentityResolver } from "./identity";

@Module({
  providers: [{ provide: IdentityResolver, useClass: DevIdentityResolver }],
  exports: [IdentityResolver],
})
export class AuthModule {}
