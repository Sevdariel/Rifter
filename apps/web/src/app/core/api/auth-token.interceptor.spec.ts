import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AppConfig } from '../config/app-config';
import { authTokenInterceptor } from './auth-token.interceptor';

describe('authTokenInterceptor', () => {
  function setup(apiToken: string): { http: HttpClient; controller: HttpTestingController } {
    TestBed.configureTestingModule({
      providers: [
        { provide: AppConfig, useValue: { apiToken, apiBaseUrl: 'http://api.test' } },
        provideHttpClient(withInterceptors([authTokenInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    return { http: TestBed.inject(HttpClient), controller: TestBed.inject(HttpTestingController) };
  }

  it('adds X-Rifter-Token to API requests', () => {
    const { http, controller } = setup('token-123');
    http.get('http://api.test/matches').subscribe();
    const req = controller.expectOne('http://api.test/matches');
    expect(req.request.headers.get('X-Rifter-Token')).toBe('token-123');
    req.flush([]);
  });

  it('omits the header when no token is configured', () => {
    const { http, controller } = setup('');
    http.get('http://api.test/matches').subscribe();
    const req = controller.expectOne('http://api.test/matches');
    expect(req.request.headers.has('X-Rifter-Token')).toBe(false);
    req.flush([]);
  });

  it('does not attach the token to foreign URLs', () => {
    const { http, controller } = setup('token-123');
    http.get('http://other.test/data').subscribe();
    const req = controller.expectOne('http://other.test/data');
    expect(req.request.headers.has('X-Rifter-Token')).toBe(false);
    req.flush({});
  });

  it('does not attach the token to a lookalike origin sharing a prefix', () => {
    const { http, controller } = setup('token-123');
    http.get('http://api.test.evil.test/data').subscribe();
    const req = controller.expectOne('http://api.test.evil.test/data');
    expect(req.request.headers.has('X-Rifter-Token')).toBe(false);
    req.flush({});
  });
});
