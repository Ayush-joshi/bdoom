import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { User, UserRole } from './user';

@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(private readonly http: HttpClient) {}

  listUsers(): Promise<User[]> {
    return firstValueFrom(
      this.http.get<User[]>('/api/admin/users', { withCredentials: true }),
    );
  }

  createUser(username: string, password: string, role: UserRole): Promise<User> {
    return firstValueFrom(
      this.http.post<User>(
        '/api/admin/users',
        { username, password, role },
        { withCredentials: true },
      ),
    );
  }

  updateRole(userId: number, role: UserRole): Promise<User> {
    return firstValueFrom(
      this.http.patch<User>(
        `/api/admin/users/${userId}/role`,
        { role },
        { withCredentials: true },
      ),
    );
  }

  resetPassword(userId: number, password: string): Promise<unknown> {
    return firstValueFrom(
      this.http.patch(
        `/api/admin/users/${userId}/password`,
        { password },
        { withCredentials: true },
      ),
    );
  }
}
