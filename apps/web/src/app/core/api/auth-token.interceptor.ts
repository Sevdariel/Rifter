import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { AppConfig } from '../config/app-config';

function sameOrigin(url: string, baseUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

/** Attaches the dev bearer token to requests targeting the configured API origin. */
export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const config = inject(AppConfig);
  const token = config.apiToken;
  if (!token || !sameOrigin(req.url, config.apiBaseUrl)) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { 'X-Rifter-Token': token } }));
};
