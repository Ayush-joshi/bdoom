import { Component } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-placeholder',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="dashboard-shell detail-shell">
      <a class="back-link" routerLink="/">Back</a>
      <section>
        <p class="eyebrow">BDoom Gateway</p>
        <h1>{{ title }}</h1>
        <p class="detail-copy">This backend-protected area is reserved for Phase 2 integration.</p>
      </section>
    </main>
  `,
})
export class PlaceholderComponent {
  readonly title = this.route.snapshot.data['title'] ?? 'BDoom';

  constructor(private readonly route: ActivatedRoute) {}
}
