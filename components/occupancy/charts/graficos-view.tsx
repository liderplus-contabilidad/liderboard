"use client";

import { BedDouble } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { ChartCard } from "@/components/ui/chart-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatTile } from "@/components/ui/stat-tile";
import { colorForEntity } from "@/lib/charts/palette";
import { occupancySeriesId, type Scope } from "@/lib/occupancy/analytics/types";

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
import { finerScope, periodPhrase } from "@/lib/occupancy/filters";
import { useOccupancyData } from "../occupancy-data-provider";
import { DayPanel } from "./day-panel";
import { HeatmapCard } from "./heatmap-card";

/** «Ver por»: the axis of the series card, and of nothing else on the tab. Finest first. */
const SCOPES: { value: Scope; label: string }[] = [
  { value: "dia", label: "Día" },
  { value: "mensual", label: "Mes" },
  { value: "trimestral", label: "Trim." },
  { value: "semestral", label: "Sem." },
  { value: "anual", label: "Año" },
];

/** How the card's title finishes the sentence «Ocupación …». */
const SCOPE_TITLES: Record<Scope, string> = {
  dia: "por día",
  mensual: "por mes",
  trimestral: "por trimestre",
  semestral: "por semestre",
  anual: "por año",
};

/** What a click opens, said as the invitation it is. Absent on the daily axis: it is the floor. */
const DRILL_HINTS: Partial<Record<Scope, string>> = {
  mensual: "Clic en una barra para abrir ese mes día a día",
  trimestral: "Clic en una barra para abrir ese trimestre mes a mes",
  semestral: "Clic en una barra para abrir ese semestre trimestre a trimestre",
  anual: "Clic en una barra para abrir el año semestre a semestre",
};

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
  const {
    datasets,
    ready,
    filters,
    activeCenterId,
    activeYear,
    isConsolidated,
    drillIntoPeriod,
    setChartScope,
  } = useOccupancyData();
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

  const channelOrder = useMemo(() => channels.channels.map((entry) => entry.id), [channels]);
  const weekColor = colorForEntity(colorUniverse(datasets)[0] ?? "", colorUniverse(datasets));

  const onSelectDay = useCallback(
    (centerId: string, year: number, monthIndex: number, day: number) =>
      setOpenDay({ centerId, year, monthIndex, day }),
    [],
  );

  // Clicking a bar is the way down the ladder: a quarter opens into its months, a month into
  // its days. The daily axis is the floor — there is nothing under a day to open.
  const onSelectColumn = useCallback(
    (index: number) => {
      const point = bundle.axis[index];
      const finer = finerScope(filters.scope);
      if (point && finer) {
        drillIntoPeriod(point.monthIndexes, finer);
      }
    },
    [bundle.axis, filters.scope, drillIntoPeriod],
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
            Sin datos de ocupación. Cárgalos desde la pestaña Datos, con «Cargar Excel de
            ocupación», y vuelve aquí para comparar sucursales, años y periodos.
          </EmptyState>
        </div>
      </div>
    );
  }

  const scopeLabel = SCOPE_TITLES[filters.scope];
  // The same wording the filter bar uses, so a KPI never says «Enero» under a «5 de enero».
  const period = periodPhrase(filters.months, filters.days);

  return (
    <div className="flex flex-col gap-4 px-7 py-5">
      {/* One row of tiles per sucursal-year: marking two years is asking to compare them, and a
          single blended figure would answer a question nobody asked. */}
      <div className="flex flex-col gap-3">
        {kpis.map((group) => (
          <div key={occupancySeriesId(group.key)} className="flex flex-col gap-1.5">
            {kpis.length > 1 && (
              <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: colorOf(group.key) }}
                />
                {group.label}
              </span>
            )}
            <div className="flex flex-wrap gap-3">
              {group.kpis.map((kpi) => (
                <StatTile
                  key={kpi.id}
                  label={kpi.label}
                  value={formatMetric(kpi.value, kpi.unit)}
                  hint={period}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <ChartCard
        title={`${bundle.metric.label} · ${scopeLabel}`}
        subtitle={DRILL_HINTS[filters.scope] ?? `${bundle.metric.hint} · ${period}`}
        option={bundle.series.length > 0 ? seriesOption(bundle, { colorOf }) : null}
        table={seriesTable(bundle, { colorOf })}
        warnings={bundle.warnings}
        onSelect={onSelectColumn}
        height={300}
        headerSlot={
          <span className="flex items-center gap-2">
            <span className="text-[11.5px] font-semibold text-faint">Ver por</span>
            <SegmentedControl
              value={filters.scope}
              options={SCOPES}
              onChange={setChartScope}
              ariaLabel="Ver por"
            />
          </span>
        }
      />

      <HeatmapCard result={heatmaps} onSelectDay={onSelectDay} />

      <div className="grid grid-cols-2 gap-4">
        <ChartCard
          title="Canales de venta"
          subtitle={`Noches por canal · ${period}`}
          option={
            channels.channels.length > 0 ? channelOption(channels, channelOrder, { colorOf }) : null
          }
          table={channelTable(channels, channelOrder, { colorOf })}
          height={260}
        />
        <ChartCard
          title={`${bundle.metric.label} por día de la semana`}
          subtitle={`Dónde se cae y dónde se llena · ${period}`}
          option={weekdayOption(week, bundle.metric.unit, { colorOf }, weekColor)}
          table={weekdayTable(week, bundle.metric.unit, { colorOf }, weekColor)}
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
