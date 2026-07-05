import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, Routes } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { AppComponent } from './app/app.component';
import { authGuard, loginGuard } from './app/auth.guard';
import { DashboardComponent } from './app/dashboard.component';
import { LoginComponent } from './app/login.component';
import { PlaceholderComponent } from './app/placeholder.component';

const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [loginGuard] },
  { path: '', component: DashboardComponent, canActivate: [authGuard] },
  {
    path: 'files',
    component: PlaceholderComponent,
    canActivate: [authGuard],
    data: { title: 'Files', requiredRole: 'brother' },
  },
  {
    path: 'remote',
    component: PlaceholderComponent,
    canActivate: [authGuard],
    data: { title: 'Remote', requiredRole: 'admin' },
  },
  {
    path: 'ai',
    component: PlaceholderComponent,
    canActivate: [authGuard],
    data: { title: 'AI', requiredRole: 'admin' },
  },
  {
    path: 'status',
    component: PlaceholderComponent,
    canActivate: [authGuard],
    data: { title: 'Status', requiredRole: 'admin' },
  },
  {
    path: 'admin',
    component: PlaceholderComponent,
    canActivate: [authGuard],
    data: { title: 'Admin', requiredRole: 'admin' },
  },
  { path: '**', redirectTo: '' },
];

bootstrapApplication(AppComponent, {
  providers: [provideRouter(routes), provideHttpClient(withFetch())],
}).catch((error) => console.error(error));
