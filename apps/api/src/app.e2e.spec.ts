import { Body, Controller, Get, Post } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { configureApp } from "./app.configure";
import { Identity } from "./auth/identity.decorator";
import type { PlayerIdentity } from "./auth/identity";
import { Public } from "./auth/public.decorator";
import type { Env } from "./config/env.validation";
import type { ApiErrorBody } from "./shared/errors";

const TOKEN = "e2e-test-token-1234";

@Controller("probe")
class ProbeController {
  @Get()
  guarded(@Identity() identity: PlayerIdentity): PlayerIdentity {
    return identity;
  }

  @Public()
  @Get("open")
  open(): { open: true } {
    return { open: true };
  }

  @Post("echo")
  echo(@Body() body: unknown): unknown {
    return body;
  }
}

describe("api e2e (security pipeline)", () => {
  let app: NestExpressApplication;
  let base: string;
  let priorToken: string | undefined;
  let priorPuuid: string | undefined;
  let priorDatabaseUrl: string | undefined;

  beforeAll(async () => {
    // Env must be set before the AppModule import: ConfigModule.forRoot
    // validates at module-evaluation time, not at boot. DATABASE_URL is
    // pinned to a refused port so /health reports a deterministic "down"
    // regardless of the developer's local .env.
    priorToken = process.env.API_AUTH_TOKEN;
    priorPuuid = process.env.DEV_PUUID;
    priorDatabaseUrl = process.env.DATABASE_URL;
    process.env.API_AUTH_TOKEN = TOKEN;
    process.env.DEV_PUUID = "e2e-puuid";
    process.env.DATABASE_URL = "postgres://127.0.0.1:1/rifter";
    const { AppModule } = await import("./app.module");
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, app.get(ConfigService<Env, true>));
    await app.listen(0, "127.0.0.1");
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    for (const [key, value] of [
      ["API_AUTH_TOKEN", priorToken],
      ["DEV_PUUID", priorPuuid],
      ["DATABASE_URL", priorDatabaseUrl],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("serves public /health without a token", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", db: "down" });
  });

  it("serves public /metrics without a token in the exposition format", async () => {
    const res = await fetch(`${base}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toContain("rifter_http_request_duration_seconds");
    expect(body).toContain("rifter_riot_api_requests_total");
    // Aggregate only — no per-player identifiers in the label set.
    expect(body).not.toContain("puuid");
  });

  it("rejects a protected route without a token via the error contract", async () => {
    const res = await fetch(`${base}/probe`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiErrorBody;
    expect(body).toEqual({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
  });

  it("authenticates with the token and resolves identity", async () => {
    const res = await fetch(`${base}/probe`, { headers: { "x-rifter-token": TOKEN } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ puuid: "e2e-puuid" });
  });

  it("honors method-level @Public on a protected controller", async () => {
    const res = await fetch(`${base}/probe/open`);
    expect(res.status).toBe(200);
  });

  it("maps malformed JSON bodies to the error contract, never a stack", async () => {
    const res = await fetch(`${base}/probe/echo`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-rifter-token": TOKEN },
      body: "{",
    });
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).not.toContain("html");
    const body = JSON.parse(text) as ApiErrorBody;
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("rejects a preflight from a non-allowlisted origin", async () => {
    const res = await fetch(`${base}/probe`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://evil.example",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "x-rifter-token",
      },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("allows a preflight from the allowlisted origin", async () => {
    const res = await fetch(`${base}/probe`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:4200",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "x-rifter-token",
      },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:4200");
  });

  it("sets helmet headers and hides x-powered-by", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.headers.get("x-powered-by")).toBeNull();
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("returns a contract-shaped 404 for unmatched routes", async () => {
    const res = await fetch(`${base}/no-such-route`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
