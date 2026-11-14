import type { NextFunction, Request, Response } from "express";

import type { MetricsService } from "./metrics.service";

/**
 * Request-duration middleware — registered in `configureApp`, so it wraps
 * the whole pipeline including guard rejections and unmatched routes. The
 * observation runs on `finish`, after exception filters have written the
 * final status. The `route` label is the Express path template
 * (`/reports/:matchId`), never the raw URL — that keeps puuid and matchId
 * out of the label set.
 */
export function metricsMiddleware(metricsService: MetricsService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();
    res.once("finish", () => {
      const route = (req.route as { path?: unknown } | undefined)?.path;
      const routeLabel = typeof route === "string" ? route : Array.isArray(route) ? route.join("|") : "unmatched";
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      metricsService.httpDuration.observe(
        { method: req.method, route: routeLabel, status_code: String(res.statusCode) },
        seconds,
      );
    });
    next();
  };
}
