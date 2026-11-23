import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';

import { RifterApi } from '../../core/api/rifter-api';
import { formatGameTime } from '../../core/time/game-time';

/** Dev-only report detail: metadata strip, summary, moments table, raw JSON. */
@Component({
  selector: 'app-report',
  imports: [RouterLink],
  templateUrl: './report.html',
  styleUrl: './report.scss',
})
export class Report {
  private readonly api = inject(RifterApi);

  /** Bound from the route param via withComponentInputBinding. */
  public readonly matchId = input.required<string>();

  protected readonly reportResource = resource({
    params: () => ({ matchId: this.matchId() }),
    loader: ({ params }) => this.api.getReport(params.matchId),
  });

  protected readonly moments = computed(() => {
    const detail = this.reportResource.value();
    if (!detail) {
      return [];
    }
    const topIndex = detail.report.topPriority;
    return detail.report.moments.map((moment, index) => ({
      ...moment,
      index,
      isTop: index === topIndex,
      range: `${formatGameTime(moment.t_start)} – ${formatGameTime(moment.t_end)}`,
    }));
  });

  protected readonly rawJson = computed(() => {
    const detail = this.reportResource.value();
    return detail ? JSON.stringify(detail.report, null, 2) : '';
  });

  protected readonly errorMessage = computed(() => {
    const error = this.reportResource.error();
    if (!error) {
      return null;
    }
    return error instanceof Error ? error.message : String(error);
  });
}
