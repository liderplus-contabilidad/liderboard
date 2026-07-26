"use client";

import { memo, useMemo } from "react";
import type { AnalyticsSource, PeriodRef } from "@/lib/profit-loss/analytics/types";
import { waterfallOption, waterfallTable, type ChartTable } from "@/lib/profit-loss/charts/option";
import { buildWaterfall, waterfallRangeLabel } from "@/lib/profit-loss/charts/waterfall";
import type { Frequency } from "@/lib/profit-loss/types";
import { ChartCard } from "@/components/ui/chart-card";

const EMPTY_TABLE: ChartTable = { columns: [], rows: [] };

export interface WaterfallCardProps {
  /** The active center's source; `undefined` while no workspace is loaded. */
  source: AnalyticsSource | undefined;
  frequency: Frequency;
  /** Restricted axis from `Comparar`; absent = every period of the year. */
  periods?: readonly PeriodRef[];
  height?: number;
}

/**
 * The cascade over the ordinary chart card, so it inherits the warnings, the table twin and the
 * empty state instead of growing its own.
 *
 * Two things are its own. The subtitle names the range it actually summed — taken from the
 * coverage, never from the file's year, because a statement that reaches July is «Ene–Jul» and
 * presenting it as the year would overstate every step. And there is no shape selector: a
 * cascade is a cascade, and drawing these steps as a pie or a line would say nothing.
 */
export const WaterfallCard = memo(function WaterfallCard({
  source,
  frequency,
  periods,
  height = 340,
}: WaterfallCardProps) {
  const result = useMemo(
    () => (source ? buildWaterfall(source, { frequency, periods }) : null),
    [source, frequency, periods],
  );

  const steps = result?.steps ?? [];
  const range = waterfallRangeLabel(result?.periods ?? []);

  return (
    <ChartCard
      title="Del ingreso a la utilidad"
      subtitle={range ? `Suma de ${range}` : "Sin movimiento"}
      // No steps means no covered period at all: the card says so instead of drawing a row of
      // bars at zero, which would read as a business that billed nothing.
      option={steps.length > 0 ? waterfallOption(steps) : null}
      table={steps.length > 0 ? waterfallTable(steps) : EMPTY_TABLE}
      warnings={result?.warnings}
      note={
        result && result.grouped > 0
          ? `«Otros gastos» agrupa ${result.grouped} grupos más pequeños.`
          : undefined
      }
      height={height}
    />
  );
});
