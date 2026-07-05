import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <main class="login-shell">
      <section class="login-panel">
        <div>
          <p class="eyebrow">BDoom Gateway</p>
          <h1>Secure personal gateway on OCI</h1>
        </div>

        <form (ngSubmit)="submit()" #form="ngForm">
          <label>
            Username
            <input
              name="username"
              autocomplete="username"
              [(ngModel)]="username"
              required
            />
          </label>

          <label>
            Password
            <input
              name="password"
              type="password"
              autocomplete="current-password"
              [(ngModel)]="password"
              required
            />
          </label>

          @if (error()) {
            <p class="error">{{ error() }}</p>
          }

          <button type="submit" [disabled]="loading() || form.invalid">
            {{ loading() ? 'Signing in...' : 'Sign in' }}
          </button>
        </form>
      </section>
    </main>
  `,
})
export class LoginComponent {
  username = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal('');

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  async submit(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.username, this.password);
      await this.router.navigateByUrl('/');
    } catch {
      this.error.set('Invalid username or password');
    } finally {
      this.loading.set(false);
    }
  }
}
