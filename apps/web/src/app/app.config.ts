import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { authTokenInterceptor } from './core/api/auth-token.interceptor';
import { AppConfig } from './core/config/app-config';
import { initSentry, sentryErrorHandlerProvider } from './core/sentry/sentry';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authTokenInterceptor])),
    provideAppInitializer(async () => {
      const config = inject(AppConfig);
      await config.load();
      initSentry(config);
    }),
    sentryErrorHandlerProvider,
  ],
};
