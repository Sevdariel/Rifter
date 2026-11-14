import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";

import { Public } from "../auth/public.decorator";
import { MetricsService } from "./metrics.service";

/**
 * Prometheus scrape target. Public by design: the API binds loopback-only
 * and in compose Prometheus scrapes over the internal network — a token
 * would only add a rotating secret to the scrape config for no boundary.
 * The payload contains aggregate counters/histograms, no per-player data.
 */
@Controller()
export class MetricsController {
  public constructor(private readonly metricsService: MetricsService) {}

  @Public()
  @Get("metrics")
  public async metrics(@Res({ passthrough: true }) res: Response): Promise<string> {
    res.setHeader("Content-Type", this.metricsService.register.contentType);
    const body = await this.metricsService.register.metrics();
    return body;
  }
}
