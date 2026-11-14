import type { ConfigService } from "@nestjs/config";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";

import type { Env } from "../config/env.validation";
import { pinoOptions } from "./pino-options.factory";

function config(level: string): ConfigService<Env, true> {
  return { get: () => level } as unknown as ConfigService<Env, true>;
}

function req(headers: Record<string, string>, url = "/reports"): IncomingMessage {
  return { headers, url } as unknown as IncomingMessage;
}

describe("pinoOptions", () => {
  it("sets the level from LOG_LEVEL", () => {
    const params = pinoOptions(config("debug"));
    expect(params.pinoHttp?.level).toBe("debug");
  });

  it("honors inbound x-request-id, falls back to a generated uuid", () => {
    const params = pinoOptions(config("info"));
    const genReqId = params.pinoHttp?.genReqId;
    const withId = genReqId?.(req({ "x-request-id": "req-123" }), {} as ServerResponse);
    expect(withId).toBe("req-123");
    const generated = genReqId?.(req({}), {} as ServerResponse);
    expect(generated).toMatch(/^[0-9a-f-]{36}$/);
    // Overlong inbound ids are ignored — they can be attacker-controlled.
    const long = genReqId?.(req({ "x-request-id": "x".repeat(200) }), {} as ServerResponse);
    expect(long).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("suppresses health and metrics access logs, keeps real routes", () => {
    const params = pinoOptions(config("info"));
    const ignore = params.pinoHttp?.autoLogging;
    const ignores = typeof ignore === "object" ? ignore.ignore : undefined;
    expect(ignores?.(req({}, "/health"))).toBe(true);
    expect(ignores?.(req({}, "/metrics"))).toBe(true);
    expect(ignores?.(req({}, "/health?x=1"))).toBe(true);
    expect(ignores?.(req({}, "/reports"))).toBe(false);
  });

  it("redacts credential headers", () => {
    const params = pinoOptions(config("info"));
    const redact = params.pinoHttp?.redact;
    const paths = (redact as { paths: string[] }).paths.join(" ");
    expect(paths).toContain("x-rifter-token");
    expect(paths).toContain("authorization");
    expect(paths).toContain("cookie");
    expect(paths).toContain("x-riot-token");
  });
});
