import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminService } from './admin.service';
import { AuthService } from './auth.service';
import { User, UserRole } from './user';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <main class="dashboard-shell admin-shell">
      <a class="back-link" routerLink="/">Back</a>

      <header class="admin-header">
        <div>
          <p class="eyebrow">BDoom Gateway</p>
          <h1>Admin</h1>
        </div>
      </header>

      <section class="admin-layout">
        <form class="panel" (ngSubmit)="createUser()">
          <h2>Add User</h2>
          <label>
            Username
            <input
              name="newUsername"
              autocomplete="off"
              [(ngModel)]="newUsername"
              required
            />
          </label>
          <label>
            Temporary password
            <input
              name="newPassword"
              type="password"
              autocomplete="new-password"
              [(ngModel)]="newPassword"
              required
              minlength="12"
            />
          </label>
          <label>
            Role
            <select name="newRole" [(ngModel)]="newRole">
              <option value="brother">Brother</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button type="submit" [disabled]="busy()">Create user</button>
        </form>

        <form class="panel" (ngSubmit)="changeOwnPassword()">
          <h2>Your Password</h2>
          <label>
            Current password
            <input
              name="currentPassword"
              type="password"
              autocomplete="current-password"
              [(ngModel)]="currentPassword"
              required
            />
          </label>
          <label>
            New password
            <input
              name="ownNewPassword"
              type="password"
              autocomplete="new-password"
              [(ngModel)]="ownNewPassword"
              required
              minlength="12"
            />
          </label>
          <button type="submit" [disabled]="busy()">Update password</button>
        </form>
      </section>

      @if (message()) {
        <p class="notice success">{{ message() }}</p>
      }
      @if (error()) {
        <p class="notice error">{{ error() }}</p>
      }

      <section class="users-panel">
        <div class="section-title">
          <h2>Users</h2>
          <button type="button" class="secondary-button" (click)="loadUsers()">
            Refresh
          </button>
        </div>

        <div class="user-list">
          @for (user of users(); track user.id) {
            <article class="user-row">
              <div class="user-identity">
                <strong>{{ user.username }}</strong>
                <span>{{ user.role }}</span>
              </div>

              <label>
                Role
                <select
                  [name]="'role-' + user.id"
                  [ngModel]="user.role"
                  (ngModelChange)="updateRole(user, $event)"
                  [disabled]="busy()"
                >
                  <option value="brother">Brother</option>
                  <option value="admin">Admin</option>
                </select>
              </label>

              <form class="reset-form" (ngSubmit)="resetPassword(user)">
                <label>
                  New password
                  <input
                    [name]="'password-' + user.id"
                    type="password"
                    autocomplete="new-password"
                    [(ngModel)]="resetPasswords[user.id]"
                    minlength="12"
                    required
                  />
                </label>
                <button type="submit" class="secondary-button" [disabled]="busy()">
                  Reset
                </button>
              </form>
            </article>
          }
        </div>
      </section>
    </main>
  `,
})
export class AdminComponent implements OnInit {
  readonly users = signal<User[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly resetPasswords: Record<number, string> = {};

  newUsername = '';
  newPassword = '';
  newRole: UserRole = 'brother';
  currentPassword = '';
  ownNewPassword = '';

  constructor(
    private readonly admin: AdminService,
    private readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    void this.loadUsers();
  }

  async loadUsers(): Promise<void> {
    await this.run(async () => {
      this.users.set(await this.admin.listUsers());
    });
  }

  async createUser(): Promise<void> {
    await this.run(async () => {
      const user = await this.admin.createUser(
        this.newUsername.trim(),
        this.newPassword,
        this.newRole,
      );
      this.users.update((users) => [...users, user].sort(sortUsers));
      this.newUsername = '';
      this.newPassword = '';
      this.newRole = 'brother';
      this.message.set('User created.');
    });
  }

  async updateRole(user: User, role: string): Promise<void> {
    if (!isUserRole(role)) {
      return;
    }
    if (user.role === role) {
      return;
    }
    await this.run(async () => {
      const updated = await this.admin.updateRole(user.id, role);
      this.users.update((users) =>
        users.map((item) => (item.id === updated.id ? updated : item)),
      );
      this.message.set('Role updated.');
    });
  }

  async resetPassword(user: User): Promise<void> {
    const password = this.resetPasswords[user.id] ?? '';
    await this.run(async () => {
      await this.admin.resetPassword(user.id, password);
      this.resetPasswords[user.id] = '';
      this.message.set('Password reset.');
    });
  }

  async changeOwnPassword(): Promise<void> {
    await this.run(async () => {
      await this.auth.changePassword(this.currentPassword, this.ownNewPassword);
      this.currentPassword = '';
      this.ownNewPassword = '';
      this.message.set('Your password was updated.');
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await action();
    } catch {
      this.error.set('Request failed. Check the values and try again.');
    } finally {
      this.busy.set(false);
    }
  }
}

function sortUsers(a: User, b: User): number {
  return a.username.localeCompare(b.username);
}

function isUserRole(role: string): role is UserRole {
  return role === 'admin' || role === 'brother';
}
