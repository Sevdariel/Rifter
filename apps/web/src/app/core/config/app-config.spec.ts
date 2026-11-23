import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppConfig } from './app-config';

describe('AppConfig', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(responses: Record<string, { ok: boolean; json?: unknown }>): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        const file = path.split('/').pop() ?? path;
        const response = responses[file] ?? { ok: false };
        return {
          ok: response.ok,
          json: async () => response.json,
        } as Response;
      }),
    );
  }

  it('applies defaults when no config files exist', async () => {
    stubFetch({});
    const config = TestBed.inject(AppConfig);
    await config.load();
    expect(config.apiBaseUrl).toBe('http://localhost:3000');
    expect(config.apiToken).toBe('');
    expect(config.sentryDsn).toBe('');
    expect(config.isConfigured).toBe(false);
  });

  it('merges config.local.json over config.json', async () => {
    stubFetch({
      'config.json': {
        ok: true,
        json: { apiBaseUrl: 'http://example.test:3000/', apiToken: '', sentryDsn: '' },
      },
      'config.local.json': { ok: true, json: { apiToken: 'secret-token' } },
    });
    const config = TestBed.inject(AppConfig);
    await config.load();
    expect(config.apiBaseUrl).toBe('http://example.test:3000');
    expect(config.apiToken).toBe('secret-token');
    expect(config.isConfigured).toBe(true);
  });
});
