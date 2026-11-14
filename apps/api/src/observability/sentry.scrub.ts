import type { ErrorEvent, EventHint } from "@sentry/nestjs";

const SENSITIVE_HEADERS = new Set(["authorization", "cookie", "set-cookie", "x-rifter-token", "x-riot-token"]);

/**
 * `beforeSend` hook: error reports never carry credential material. The
 * player's puuid and match ids stay — they are the debugging identifiers —
 * while tokens and cookies are redacted wherever they can appear.
 */
export function scrubSentryEvent(event: ErrorEvent, hint: EventHint): ErrorEvent {
  void hint;
  if (event.request) {
    // Bodies and query strings never reach the error report — today they
    // carry only matchIds, but a future endpoint (e.g. the RSO callback's
    // `code`/`state` params) could put secrets in either channel.
    delete (event.request as Record<string, unknown>).data;
    delete (event.request as Record<string, unknown>).query_string;
    if (event.request.url) {
      event.request.url = event.request.url.split("?")[0];
    }
  }
  const headers = event.request?.headers;
  if (headers) {
    for (const key of Object.keys(headers)) {
      if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
        headers[key] = "[Redacted]";
      }
    }
  }
  if (event.request?.cookies) {
    event.request.cookies = { "[filtered]": "true" };
  }
  return event;
}
