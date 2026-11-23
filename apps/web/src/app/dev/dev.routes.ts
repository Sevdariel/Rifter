import { Routes } from '@angular/router';

/** Dev-harness routes — not product UI, exempt from the design gate. */
export const devRoutes: Routes = [
  {
    path: 'matches',
    loadComponent: () => import('./match-list/match-list').then((m) => m.MatchList),
  },
  {
    path: 'reports/:matchId',
    loadComponent: () => import('./report/report').then((m) => m.Report),
  },
  { path: '', pathMatch: 'full', redirectTo: 'matches' },
];
