import { EventEmitter } from "node:events";

import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { metricsMiddleware } from "./metrics.middleware";
import type { MetricsService } from "./metrics.service";

function make(): { observe: ReturnType<typeof vi.fn>; middleware: ReturnType<typeof metricsMiddleware> } {
  const observe = vi.fn();
  const metrics = { httpDuration: { observe } } as unknown as MetricsService;
  const middleware = metricsMiddleware(metrics);
  return { observe, middleware };
}

function fakeRes(statusCode: number): Response {
  const res = new EventEmitter() as EventEmitter & { statusCode: number };
  res.statusCode = statusCode;
  return res as unknown as Response;
}

describe("metricsMiddleware", () => {
  it("observes on finish with the final status — even for error paths", () => {
    const { observe, middleware } = make();
    const req = { method: "GET", url: "/reports/EUN1_SECRET123", route: { path: "/reports/:matchId" } };
    const res = fakeRes(200);
    middleware(req as unknown as Request, res, vi.fn());
    // An exception filter writes the real status before the response ends.
    res.statusCode = 500;
    res.emit("finish");
    expect(observe).toHaveBeenCalledWith(
      { method: "GET", route: "/reports/:matchId", status_code: "500" },
      expect.any(Number),
    );
    const labels = observe.mock.calls[0]![0] as Record<string, string>;
    expect(Object.values(labels).join(" ")).not.toContain("EUN1_SECRET123");
  });

  it("labels unmatched routes as 'unmatched'", () => {
    const { observe, middleware } = make();
    const res = fakeRes(404);
    middleware({ method: "GET", url: "/nope" } as unknown as Request, res, vi.fn());
    res.emit("finish");
    expect(observe).toHaveBeenCalledWith({ method: "GET", route: "unmatched", status_code: "404" }, expect.any(Number));
  });

  it("joins array route paths and calls next()", () => {
    const { observe, middleware } = make();
    const next = vi.fn();
    const res = fakeRes(200);
    const req = { method: "POST", route: { path: ["/a", "/b"] } };
    middleware(req as unknown as Request, res, next);
    expect(next).toHaveBeenCalledOnce();
    res.emit("finish");
    expect(observe).toHaveBeenCalledWith({ method: "POST", route: "/a|/b", status_code: "200" }, expect.any(Number));
  });
});
