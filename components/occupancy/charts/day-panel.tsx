"use client";

import { SidePanel } from "@/components/ui/side-panel";
import { formatNumber } from "@/lib/format";
import type { DayDetail } from "@/lib/occupancy/analytics/breakdown";
import { formatMetric } from "@/lib/occupancy/charts/option";

export interface DayPanelProps {
  detail: DayDetail;
  /** Which center-year the day belongs to; two grids on screen make this necessary. */
  centerLabel: string;
  onClose: () => void;
}

/** Does NOT touch the filters: a day is a point, not a level of the axis. */
export function DayPanel({ detail, centerLabel, onClose }: DayPanelProps) {
  return (
    <SidePanel eyebrow={centerLabel} title={`Detalle del día · ${detail.label}`} onClose={onClose}>
      <dl className="grid grid-cols-2 gap-2.5">
        {detail.indicators.map((indicator) => (
          <div key={indicator.id} className="rounded-[9px] border border-border-soft px-3 py-2">
            <dt className="truncate text-[11px] font-semibold uppercase tracking-[0.4px] text-faint">
              {indicator.label}
            </dt>
            <dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-ink">
              {formatMetric(indicator.value, indicator.unit) ?? "—"}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
        Canales
      </p>
      {detail.channels.length > 0 ? (
        <ul className="mt-1.5 divide-y divide-border-soft">
          {detail.channels.map((channel) => (
            <li key={channel.id} className="flex items-center justify-between py-1.5 text-[12.5px]">
              <span className="truncate text-ink-soft">{channel.name}</span>
              <span className="font-semibold tabular-nums text-ink">
                {formatNumber(channel.nights)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-[12.5px] text-muted">Ese día no registra noches por canal.</p>
      )}
    </SidePanel>
  );
}
