"use client";

import { BedDouble } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { ChartCard } from "@/components/ui/chart-card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/ui/stat-tile";
import { colorForEntity } from "@/lib/charts/palette";

import {
  channelTotals,
  dayDetail,
  occupancyKpis,
  weekdayRhythm,
  type DayDetail,
} from "@/lib/occupancy/analytics/breakdown";
import { buildOccupancySeries } from "@/lib/occupancy/analytics/series";
import { buildHeatmaps } from "@/lib/occupancy/charts/heatmap";
import {
  channelOption,
  channelTable,
  formatMetric,
  seriesOption,
  seriesTable,
  weekdayOption,
  weekdayTable,
} from "@/lib/occupancy/charts/option";
import {
  colorResolver,
  colorUniverse,
  selectionUniverse,
  toOccupancyQuery,
} from "@/lib/occupancy/charts/selection";
import { periodLabel } from "@/lib/occupancy/filters";
import { useOccupancyData } from "../occupancy-data-provider";
import { DayPanel } from "./day-panel";
import { HeatmapCard } from "./heatmap-card";

/** Which day the side panel is showing, if any. */
interface OpenDay {
  centerId: string;
  year: number;
  monthIndex: number;
  day: number;
}

/**
 * Ocupaciones › Gráficos. The métrica is the lens and everything else marked is the comparison,
 * so one filter bar feeds every card at once: the same «marzo de Cultura Manor» in the series,
 * in the grid of days, in the channels and in the week.
 *
 * With nothing marked it draws the sucursal-year Datos already has open, because a blank panel
 * next to loaded data hands the reader the job of guessing what can be asked.
 */
export function GraficosView() {
  const { datasets, ready, filters, activeCenterId, activeYear, isConsolidated, drillIntoMonth } =
    useOccupancyData();
  const [openDay, setOpenDay] = useState<OpenDay | null>(null);

  const universe = useMemo(
    () =>
      selectionUniverse(
        datasets,
        // The Consolidado is a Datos view, not a stored sucursal: it cannot seed the fallback.
        !isConsolidated && activeCenterId && activeYear !== undefined
          ? { centerId: activeCenterId, year: activeYear }
          : undefined,
      ),
    [datasets, isConsolidated, activeCenterId, activeYear],
  );
  const query = useMemo(() => toOccupancyQuery(filters, universe), [filters, universe]);

  const colorOf = useMemo(() => colorResolver(colorUniverse(datasets)), [datasets]);
  const bundle = useMemo(() => buildOccupancySeries(datasets, query), [datasets, query]);
  const kpis = useMemo(() => occupancyKpis(datasets, query), [datasets, query]);
  const channels = useMemo(() => channelTotals(datasets, query), [datasets, query]);
  const week = useMemo(() => weekdayRhythm(datasets, query), [datasets, query]);
  const heatmaps = useMemo(() => buildHeatmaps(datasets, query), [datasets, query]);

  const channelOrder = useMemo(() => channels.entries.map((entry) => entry.id), [channels]);
  const weekColor = colorForEntity(colorUniverse(datasets)[0] ?? "", colorUniverse(datasets));

  const onSelectDay = useCallback(
    (centerId: string, year: number, monthIndex: number, day: number) =>
      setOpenDay({ centerId, year, monthIndex, day }),
    [],
  );

  // Clicking a bar is the way down: it narrows to that month and drops the axis to days.
  const onSelectColumn = useCallback(
    (index: number) => {
      const point = bundle.axis[index];
      if (point && filters.scope === "mes") {
        drillIntoMonth(point.monthIndex);
      }
    },
    [bundle.axis, filters.scope, drillIntoMonth],
  );

  const detail: (DayDetail & { centerLabel: string }) | null = useMemo(() => {
    if (!openDay) {
      return null;
    }
    const dataset = datasets.find(
      (candidate) => candidate.centerId === openDay.centerId && candidate.year === openDay.year,
    );
    const found = dataset && dayDetail(dataset, openDay.monthIndex, openDay.day);
    return found ? { ...found, centerLabel: `${dataset.centerName} · ${dataset.year}` } : null;
  }, [openDay, datasets]);

  if (!ready) {
    return null;
  }

  if (datasets.length === 0) {
    return (
      <div className="px-7 py-5">
        <div className="rounded-[13px] border border-border bg-surface">
          <EmptyState icon={<BedDouble size={22} />} className="py-14">
            Sin datos de ocupación. Carga uno o varios Excel con «Cargar Excel de ocupación» para
            comparar sucursales, años y periodos.
          </EmptyState>
        </div>
      </div>
    );
  }

  const scopeLabel = filters.scope === "mes" ? "por mes" : "por día";
  // The same wording the filter bar uses, so a KPI never says «Enero» under a «5 de enero».
  const period = periodLabel(filters.months, filters.days).toLowerCase();

  return (
    <div className="flex flex-col gap-4 px-7 py-5">
      <div className="flex flex-wrap gap-3">
        {kpis.map((kpi) => (
          <StatTile
            key={kpi.id}
            label={kpi.label}
            value={formatMetric(kpi.value, kpi.unit)}
            hint={period}
          />
        ))}
      </div>

      <ChartCard
        title={`${bundle.metric.label} · ${scopeLabel}`}
        subtitle={
          filters.scope === "mes"
            ? "Clic en una barra para abrir ese mes día a día"
            : `${bundle.metric.hint} · ${period}`
        }
        option={bundle.series.length > 0 ? seriesOption(bundle, { colorOf }) : null}
        table={seriesTable(bundle, { colorOf })}
        warnings={bundle.warnings}
        onSelect={onSelectColumn}
        height={300}
      />

      <HeatmapCard result={heatmaps} onSelectDay={onSelectDay} />

      <div className="grid grid-cols-2 gap-4">
        <ChartCard
          title="Canales de venta"
          subtitle={`Noches por canal · ${period}`}
          option={
            channels.entries.length > 0 ? channelOption(channels.entries, channelOrder) : null
          }
          table={channelTable(channels.entries, channelOrder)}
          height={260}
        />
        <ChartCard
          title={`${bundle.metric.label} por día de la semana`}
          subtitle={`Dónde se cae y dónde se llena · ${period}`}
          option={weekdayOption(week.labels, week.values, bundle.metric.unit, weekColor)}
          table={weekdayTable(week.labels, week.values, bundle.metric.unit, weekColor)}
          height={260}
        />
      </div>

      {detail && (
        <DayPanel
          detail={detail}
          centerLabel={detail.centerLabel}
          onClose={() => setOpenDay(null)}
        />
      )}
    </div>
  );
}
