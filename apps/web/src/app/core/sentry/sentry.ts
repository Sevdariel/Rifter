import { ErrorHandler } from '@angular/core';
import * as Sentry from '@sentry/angular';
import type { Breadcrumb, BrowserOptions, ErrorEvent } from '@sentry/angular';

import type { AppConfig } from '../config/app-config';

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-rifter-token',
  'x-riot-token',
]);

/**
 * `beforeSend` hook — mirrors the API scrubber: error reports never carry
 * credential material. Puuid and match ids stay as debugging identifiers.
 */
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete (event.request as Record<string, unknown>)['data'];
    delete (event.request as Record<string, unknown>)['query_string'];
    if (event.request.url) {
      event.request.url = event.request.url.split('?')[0];
    }
  }
  const headers = event.request?.headers;
  if (headers) {
    for (const key of Object.keys(headers)) {
      if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
        headers[key] = '[Redacted]';
      }
    }
  }
  if (event.request?.cookies) {
    event.request.cookies = { '[filtered]': 'true' };
  }
  return event;
}

/**
 * `beforeBreadcrumb` hook — browser SDK breadcrumbs keep full request URLs;
 * strip query strings there too (the `request` scrub does not cover them).
 */
export function scrubSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const url = breadcrumb.data?.['url'];
  if (typeof url === 'string' && url.includes('?')) {
    breadcrumb.data = { ...breadcrumb.data, url: url.split('?')[0] };
  }
  return breadcrumb;
}

/** Sentry options from the runtime config; undefined disables error reporting. */
export function buildSentryOptions(
  config: Pick<AppConfig, 'sentryDsn'>,
): BrowserOptions | undefined {
  if (!config.sentryDsn) {
    return undefined;
  }
  return {
    dsn: config.sentryDsn,
    environment: 'development',
    // Error reporting only — perf tracing off; mirrors apps/api instrument.ts.
    tracesSampleRate: 0,
    beforeSend: scrubSentryEvent,
    beforeBreadcrumb: scrubSentryBreadcrumb,
  };
}

/** Initializes Sentry after the runtime config has loaded. No-op without a DSN. */
export function initSentry(config: AppConfig): void {
  const options = buildSentryOptions(config);
  if (options) {
    Sentry.init(options);
  }
}

/** Angular error boundary: forwards unhandled errors to Sentry. */
export const sentryErrorHandlerProvider = {
  provide: ErrorHandler,
  useFactory: () => Sentry.createErrorHandler({ showDialog: false }),
};
