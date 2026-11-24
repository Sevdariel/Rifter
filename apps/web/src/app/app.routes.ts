import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'dev', loadChildren: () => import('./dev/dev.routes').then((m) => m.devRoutes) },
  { path: '', pathMatch: 'full', redirectTo: 'dev' },
];
