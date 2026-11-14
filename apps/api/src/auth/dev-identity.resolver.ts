import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env.validation";
import { ApiException } from "../shared/errors";
import { IdentityResolver, type PlayerIdentity } from "./identity";

/** Development identity: every authenticated request maps to DEV_PUUID. */
@Injectable()
export class DevIdentityResolver extends IdentityResolver {
  constructor(private readonly configService: ConfigService<Env, true>) {
    super();
  }

  async resolve(): Promise<PlayerIdentity> {
    const puuid = this.configService.get("DEV_PUUID", { infer: true });
    if (!puuid) {
      throw new ApiException(
        "IDENTITY_UNAVAILABLE",
        "No identity configured for this environment",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return { puuid };
  }
}
