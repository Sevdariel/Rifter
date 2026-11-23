import type { Breadcrumb, ErrorEvent } from '@sentry/angular';
import { describe, expect, it } from 'vitest';

import { buildSentryOptions, scrubSentryBreadcrumb, scrubSentryEvent } from './sentry';

describe('buildSentryOptions', () => {
  it('returns undefined without a DSN', () => {
    expect(buildSentryOptions({ sentryDsn: '' })).toBeUndefined();
  });

  it('builds error-only options when a DSN is configured', () => {
    const options = buildSentryOptions({ sentryDsn: 'https://key@o0.ingest.sentry.io/0' });
    expect(options?.dsn).toBe('https://key@o0.ingest.sentry.io/0');
    expect(options?.tracesSampleRate).toBe(0);
    expect(options?.beforeSend).toBe(scrubSentryEvent);
    expect(options?.beforeBreadcrumb).toBe(scrubSentryBreadcrumb);
  });
});

describe('scrubSentryBreadcrumb', () => {
  it('strips query strings from request breadcrumb URLs', () => {
    const breadcrumb: Breadcrumb = {
      category: 'fetch',
      data: { url: 'http://api.test/jobs?token=abc', method: 'GET' },
    };
    const scrubbed = scrubSentryBreadcrumb(breadcrumb);
    expect(scrubbed.data?.['url']).toBe('http://api.test/jobs');
    expect(scrubbed.data?.['method']).toBe('GET');
  });

  it('leaves breadcrumbs without a URL untouched', () => {
    const breadcrumb: Breadcrumb = { category: 'ui.click', message: 'Analyze' };
    expect(scrubSentryBreadcrumb(breadcrumb)).toBe(breadcrumb);
  });
});

describe('scrubSentryEvent', () => {
  it('redacts credential headers and strips query material', () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        url: 'http://localhost:3000/analysis/jobs?secret=1',
        headers: {
          'X-Rifter-Token': 'real-token',
          'Content-Type': 'application/json',
        },
        cookies: { session: 'abc' },
        data: { matchId: 'EUW1_1' },
      },
    } as ErrorEvent;

    const scrubbed = scrubSentryEvent(event);
    expect(scrubbed.request?.url).toBe('http://localhost:3000/analysis/jobs');
    expect(scrubbed.request?.headers?.['X-Rifter-Token']).toBe('[Redacted]');
    expect(scrubbed.request?.headers?.['Content-Type']).toBe('application/json');
    expect(scrubbed.request?.cookies).toEqual({ '[filtered]': 'true' });
    expect((scrubbed.request as Record<string, unknown>)['data']).toBeUndefined();
  });
});
