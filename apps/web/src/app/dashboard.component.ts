import { Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from './auth.service';

interface DashboardCard {
  title: string;
  path: string;
  text: string;
  adminOnly: boolean;
}

const cards: DashboardCard[] = [
  {
    title: 'Files',
    path: '/files',
    text: 'Brother file access will be connected later through the private home tunnel.',
    adminOnly: false,
  },
  {
    title: 'Remote',
    path: '/remote',
    text: 'Admin-only remote desktop will be connected later through MeshCentral.',
    adminOnly: true,
  },
  {
    title: 'AI',
    path: '/ai',
    text: 'Personal AI agent will be added later.',
    adminOnly: true,
  },
  {
    title: 'IPTV',
    path: '/iptv',
    text: 'Browse and watch public live channels from the IPTV-org directory.',
    adminOnly: false,
  },
  {
    title: 'Status',
    path: '/status',
    text: 'Gateway and home server status.',
    adminOnly: true,
  },
  {
    title: 'Admin',
    path: '/admin',
    text: 'User and system management.',
    adminOnly: true,
  },
];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="dashboard-shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">BDoom Gateway</p>
          <h1>Secure personal gateway on OCI</h1>
        </div>
        <div class="user-box">
          <span>{{ auth.currentUser()?.username }}</span>
          <strong>{{ auth.currentUser()?.role }}</strong>
          <button type="button" (click)="auth.logout()">Logout</button>
        </div>
      </header>

      <section class="cards-grid">
        @for (card of visibleCards(); track card.title) {
          <a class="feature-card" [routerLink]="card.path">
            <span>{{ card.title }}</span>
            <p>{{ card.text }}</p>
          </a>
        }
      </section>

      <p class="security-label">
        Authentication is enforced by the BDoom backend, not by frontend-only checks.
      </p>
    </main>
  `,
})
export class DashboardComponent {
  readonly visibleCards = computed(() => {
    const user = this.auth.currentUser();
    return cards.filter((card) => !card.adminOnly || user?.role === 'admin');
  });

  constructor(readonly auth: AuthService) {}
}
