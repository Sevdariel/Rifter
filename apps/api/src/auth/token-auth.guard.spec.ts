import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { TokenAuthGuard } from "./token-auth.guard";

const SECRET = "correct-token";

function contextWith(headers: Record<string, string | string[] | undefined>): ExecutionContext {
  const request = { headers } as never;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function guard(isPublic: boolean) {
  const reflector = { getAllAndOverride: () => isPublic } as never;
  const config = { get: () => SECRET } as never;
  const resolver = { resolve: async () => ({ puuid: "dev-puuid" }) } as never;
  return new TokenAuthGuard(reflector, config, resolver);
}

describe("TokenAuthGuard", () => {
  it("passes public routes without a token", async () => {
    await expect(guard(true).canActivate(contextWith({}))).resolves.toBe(true);
  });

  it("rejects a missing header", async () => {
    await expect(guard(false).canActivate(contextWith({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a wrong token", async () => {
    await expect(guard(false).canActivate(contextWith({ "x-rifter-token": "wrong" }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects a different-length token without leaking", async () => {
    await expect(guard(false).canActivate(contextWith({ "x-rifter-token": "x" }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("accepts the token and attaches the resolved identity", async () => {
    const ctx = contextWith({ "x-rifter-token": SECRET });
    const request = ctx.switchToHttp().getRequest<{ identity?: { puuid: string } }>();
    await expect(guard(false).canActivate(ctx)).resolves.toBe(true);
    expect(request.identity).toEqual({ puuid: "dev-puuid" });
  });
});
