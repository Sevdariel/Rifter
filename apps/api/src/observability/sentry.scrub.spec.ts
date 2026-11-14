import type { ErrorEvent } from "@sentry/nestjs";
import { describe, expect, it } from "vitest";

import { scrubSentryEvent } from "./sentry.scrub";

function event(headers: Record<string, string>): ErrorEvent {
  return {
    request: {
      headers,
      cookies: { session: "abc" },
      data: { matchId: "EUN1_X", secret: "could-live-here" },
      url: "http://127.0.0.1:3000/rso/callback?code=oauth-secret&state=xyz",
      query_string: "code=oauth-secret&state=xyz",
    },
  } as unknown as ErrorEvent;
}

describe("scrubSentryEvent", () => {
  it("redacts credential headers and cookies, keeps debugging identifiers", () => {
    const input = event({
      "x-rifter-token": "secret-token",
      authorization: "Bearer xyz",
      cookie: "session=abc",
      "x-riot-token": "RGAPI-xxx",
      "content-type": "application/json",
    });
    const out = scrubSentryEvent(input, {} as never);
    const headers = out.request?.headers as Record<string, string>;
    expect(headers["x-rifter-token"]).toBe("[Redacted]");
    expect(headers.authorization).toBe("[Redacted]");
    expect(headers.cookie).toBe("[Redacted]");
    expect(headers["x-riot-token"]).toBe("[Redacted]");
    expect(headers["content-type"]).toBe("application/json");
    expect(out.request?.cookies).toEqual({ "[filtered]": "true" });
    // Bodies and query strings never reach the error report — a future
    // endpoint (RSO callback) could carry OAuth codes there.
    const req = out.request as Record<string, unknown>;
    expect(req.data).toBeUndefined();
    expect(req.query_string).toBeUndefined();
    expect(out.request?.url).toBe("http://127.0.0.1:3000/rso/callback");
  });

  it("redacts regardless of header name case", () => {
    const out = scrubSentryEvent(event({ "X-Rifter-Token": "t", Cookie: "c" }), {} as never);
    const headers = out.request?.headers as Record<string, string>;
    expect(headers["X-Rifter-Token"]).toBe("[Redacted]");
    expect(headers.Cookie).toBe("[Redacted]");
  });

  it("tolerates events without request data", () => {
    const bare = {} as ErrorEvent;
    expect(scrubSentryEvent(bare, {} as never)).toBe(bare);
  });
});
