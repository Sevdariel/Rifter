import { Injectable } from "@nestjs/common";
import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client";

/**
 * prom-client registry + the API's instruments. Labels are closed
 * vocabularies only — route templates, endpoint names, statuses — never
 * puuid, matchId, or any per-player value.
 */
@Injectable()
export class MetricsService {
  public readonly register = new Registry();

  public readonly httpDuration = new Histogram({
    name: "rifter_http_request_duration_seconds",
    help: "HTTP request duration by method, route template, and status code",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.005, 0.025, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.register],
  });

  public readonly riotRequests = new Counter({
    name: "rifter_riot_api_requests_total",
    help: "Riot Games API calls by endpoint and response status",
    labelNames: ["endpoint", "status"],
    registers: [this.register],
  });

  public readonly riotRateLimited = new Counter({
    name: "rifter_riot_api_rate_limited_total",
    help: "Riot Games API 429 responses by endpoint",
    labelNames: ["endpoint"],
    registers: [this.register],
  });

  public readonly analysisJobs = new Counter({
    name: "rifter_analysis_jobs_total",
    help: "Analysis jobs finished by the worker, by final status",
    labelNames: ["status"],
    registers: [this.register],
  });

  public readonly analysisJobDuration = new Histogram({
    name: "rifter_analysis_job_duration_seconds",
    help: "Analysis pipeline wall time per succeeded job",
    buckets: [5, 15, 30, 60, 120, 300, 600],
    registers: [this.register],
  });

  public constructor() {
    collectDefaultMetrics({ register: this.register, prefix: "rifter_" });
  }
}
