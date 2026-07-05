import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { UserRole } from './user';

export const authGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.currentUser() ?? (await auth.loadMe());

  if (!user) {
    return router.parseUrl('/login');
  }

  const requiredRole = route.data['requiredRole'] as UserRole | undefined;
  if (requiredRole === 'admin' && user.role !== 'admin') {
    return router.parseUrl('/');
  }

  return true;
};

export const loginGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.currentUser() ?? (await auth.loadMe());
  return user ? router.parseUrl('/') : true;
};
