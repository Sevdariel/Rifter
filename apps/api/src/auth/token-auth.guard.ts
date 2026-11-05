import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { createHash, timingSafeEqual } from "node:crypto";

import type { Env } from "../config/env.validation";
import type { AuthenticatedRequest } from "./identity";
import { IdentityResolver } from "./identity";
import { IS_PUBLIC_KEY } from "./public.decorator";

// Hashing first keeps the compare constant-time with respect to token length.
function tokensEqual(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

/**
 * Requires the X-Rifter-Token custom header on every non-public route.
 * The token is the real auth check; the custom header adds CSRF protection
 * because cross-origin browser sends need a preflight the CORS allowlist
 * rejects (DNS rebinding is out of scope while the token is required).
 */
@Injectable()
export class TokenAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService<Env, true>,
    private readonly resolver: IdentityResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const expected = this.config.get("API_AUTH_TOKEN", { infer: true });
    const header = request.headers["x-rifter-token"];
    const token = Array.isArray(header) ? header[0] : header;
    if (typeof token !== "string" || !tokensEqual(token, expected)) {
      throw new UnauthorizedException();
    }
    request.identity = await this.resolver.resolve(request);
    return true;
  }
}
