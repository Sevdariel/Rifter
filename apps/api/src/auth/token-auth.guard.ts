import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { timingSafeEqual } from "node:crypto";

import type { Env } from "../config/env.validation";
import type { AuthenticatedRequest } from "./identity";
import { IdentityResolver } from "./identity";
import { IS_PUBLIC_KEY } from "./public.decorator";

function tokensEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Requires the X-Rifter-Token custom header on every non-public route.
 * Browsers cannot send it cross-origin without a preflight, which the CORS
 * allowlist rejects - this also blocks CSRF/DNS-rebinding posts to loopback.
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
