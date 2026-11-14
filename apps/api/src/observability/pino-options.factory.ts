import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { ConfigService } from "@nestjs/config";
import type { Params } from "nestjs-pino";

import type { Env } from "../config/env.validation";

const QUIET_PATHS = new Set(["/health", "/metrics"]);
const MAX_INBOUND_ID_LEN = 64;

// Second arg required by the pino-http GenReqId signature.
function genReqId(req: IncomingMessage, res: ServerResponse): string {
  void res;
  const inbound = req.headers["x-request-id"];
  if (typeof inbound === "string" && inbound.length > 0 && inbound.length <= MAX_INBOUND_ID_LEN) {
    return inbound;
  }
  return randomUUID();
}

/**
 * nestjs-pino options: one JSON line per request, every log line stamped
 * with the request id (inbound `x-request-id` honored for correlation),
 * credential headers redacted before they can reach Loki.
 */
export function pinoOptions(config: ConfigService<Env, true>): Params {
  const options: Params = {
    pinoHttp: {
      level: config.get("LOG_LEVEL", { infer: true }),
      genReqId,
      autoLogging: {
        ignore: (req) => QUIET_PATHS.has((req.url ?? "").split("?")[0] ?? ""),
      },
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.headers['x-rifter-token']",
          'req.headers["x-riot-token"]',
        ],
        censor: "[Redacted]",
      },
    },
  };
  return options;
}
