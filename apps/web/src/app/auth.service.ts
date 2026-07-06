import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, firstValueFrom, of, tap } from 'rxjs';
import { User } from './user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly currentUser = signal<User | null | undefined>(undefined);

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
  ) {}

  async loadMe(): Promise<User | null> {
    const user = await firstValueFrom(
      this.http.get<User>('/api/auth/me', { withCredentials: true }).pipe(
        catchError(() => of(null)),
      ),
    );
    this.currentUser.set(user);
    return user;
  }

  async login(username: string, password: string): Promise<User> {
    const user = await firstValueFrom(
      this.http
        .post<User>(
          '/api/auth/login',
          { username, password },
          { withCredentials: true },
        )
        .pipe(tap((result) => this.currentUser.set(result))),
    );
    return user;
  }

  async logout(): Promise<void> {
    await firstValueFrom(
      this.http.post('/api/auth/logout', {}, { withCredentials: true }).pipe(
        catchError(() => of(null)),
      ),
    );
    this.currentUser.set(null);
    await this.router.navigateByUrl('/login');
  }

  changePassword(currentPassword: string, newPassword: string): Promise<unknown> {
    return firstValueFrom(
      this.http.post(
        '/api/auth/change-password',
        { currentPassword, newPassword },
        { withCredentials: true },
      ),
    );
  }
}
