import { Service } from '@angular/core';

/** Runtime configuration shape served from /config.json (+ optional /config.local.json overlay). */
export interface AppConfigData {
  /** Base URL of the Rifter API (e.g. http://localhost:3000). */
  apiBaseUrl: string;
  /** Shared dev bearer sent as X-Rifter-Token. Empty means unauthenticated requests will 401. */
  apiToken: string;
  /** Optional Sentry DSN — error reporting is off when empty. */
  sentryDsn: string;
}

const DEFAULTS: AppConfigData = {
  apiBaseUrl: 'http://localhost:3000',
  apiToken: '',
  sentryDsn: '',
};

/**
 * Loads runtime config before the app renders. `config.json` is committed with
 * empty secrets; `config.local.json` (gitignored) overlays it with local values.
 */
@Service()
export class AppConfig {
  private config: AppConfigData = DEFAULTS;

  public async load(): Promise<void> {
    const base = await this.fetchConfig('config.json');
    const local = await this.fetchConfig('config.local.json');
    this.config = { ...DEFAULTS, ...base, ...local };
  }

  public get apiBaseUrl(): string {
    return this.config.apiBaseUrl.replace(/\/+$/, '');
  }

  public get apiToken(): string {
    return this.config.apiToken;
  }

  public get sentryDsn(): string {
    return this.config.sentryDsn;
  }

  /** True when no API token is configured — the harness shows a warning instead of 401s. */
  public get isConfigured(): boolean {
    return this.config.apiToken.length > 0;
  }

  private async fetchConfig(path: string): Promise<Partial<AppConfigData>> {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        return {};
      }
      return (await response.json()) as Partial<AppConfigData>;
    } catch {
      return {};
    }
  }
}
