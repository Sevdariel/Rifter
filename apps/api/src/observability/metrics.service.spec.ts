import { describe, expect, it } from "vitest";

import { MetricsService } from "./metrics.service";

describe("MetricsService", () => {
  it("exposes default process metrics plus the API instruments", async () => {
    const service = new MetricsService();
    const output = await service.register.metrics();
    expect(output).toContain("rifter_http_request_duration_seconds");
    expect(output).toContain("rifter_riot_api_requests_total");
    expect(output).toContain("rifter_riot_api_rate_limited_total");
    expect(output).toContain("rifter_analysis_jobs_total");
    expect(output).toContain("rifter_analysis_job_duration_seconds");
    expect(output).toContain("rifter_process_cpu_seconds_total");
  });

  it("counts and observes with closed label sets — no per-player labels", async () => {
    const service = new MetricsService();
    service.riotRequests.inc({ endpoint: "match-v5.match", status: "200" });
    service.riotRateLimited.inc({ endpoint: "match-v5.match" });
    service.analysisJobs.inc({ status: "succeeded" });
    service.analysisJobDuration.observe(42);
    service.httpDuration.observe({ method: "GET", route: "/reports/:matchId", status_code: "200" }, 0.05);

    const output = await service.register.metrics();
    expect(output).toContain('rifter_riot_api_requests_total{endpoint="match-v5.match",status="200"} 1');
    expect(output).toContain('rifter_riot_api_rate_limited_total{endpoint="match-v5.match"} 1');
    expect(output).toContain('rifter_analysis_jobs_total{status="succeeded"} 1');
    expect(output).toContain("/reports/:matchId");
    // No metric may take a per-player label — the instruments are declared
    // without one, so this documents the contract rather than policing data.
    expect(service.httpDuration.labelNames).not.toContain("puuid");
    expect(service.riotRequests.labelNames).not.toContain("puuid");
  });
});
