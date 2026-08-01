"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ChartCard } from "@/components/ui/chart-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatTile } from "@/components/ui/stat-tile";
import { colorForEntity, colorForPeriod } from "@/lib/charts/palette";
import { metricSpec, occupancySeriesId, type Scope } from "@/lib/occupancy/analytics/types";

import {
  channelTotals,
  dayDetail,
  reportTotals,
  weekdayRhythm,
  type DayDetail,
} from "@/lib/occupancy/analytics/breakdown";
import { buildOccupancyEvolution } from "@/lib/occupancy/analytics/series";
import { buildHeatmaps } from "@/lib/occupancy/charts/heatmap";
import {
  channelOption,
  channelTable,
  formatMonthlyFigure,
  MONTHLY_COLUMNS,
  seriesOption,
  seriesTable,
  weekdayOption,
  weekdayTable,
} from "@/lib/occupancy/charts/option";
import { buildReportTable } from "@/lib/occupancy/charts/report-table";
import {
  colorResolver,
  colorUniverse,
  selectionUniverse,
  toOccupancyQuery,
} from "@/lib/occupancy/charts/selection";
import { periodPhrase } from "@/lib/occupancy/filters";
import { MetricSelect } from "../metric-select";
import { useOccupancyData } from "../occupancy-data-provider";
import { NoHotelsEmptyState, NoOccupancyDataEmptyState } from "../occupancy-empty-state";
import { DayPanel } from "./day-panel";
import { ReportTables } from "./report-table";
import { HeatmapCard } from "./heatmap-card";

/**
 * «Día» is offered ONLY to the charts: a year read day by day is 365 columns a chart thins out on its
 * own, and 365 ROWS nobody reads. The table's finest row is a month; for a day there is «Días
 * específicos».
 */
const SCOPES: { value: Scope; label: string }[] = [
  { value: "mensual", label: "Mes" },
  { value: "trimestral", label: "Trim." },
  { value: "semestral", label: "Sem." },
  { value: "anual", label: "Año" },
];
const CHART_SCOPES: { value: Scope; label: string }[] = [{ value: "dia", label: "Día" }, ...SCOPES];

/** Which half of the reporte is on screen. The figures are the same; the reading is not. */
type ReportView = "tabla" | "graficas";

const REPORT_VIEWS: { value: ReportView; label: string }[] = [
  { value: "tabla", label: "Tabla" },
  { value: "graficas", label: "Gráficas" },
];

const SCOPE_TITLES: Record<Scope, string> = {
  dia: "día a día",
  mensual: "mes a mes",
  trimestral: "por trimestre",
  semestral: "por semestre",
  anual: "por año",
};

/** The four figures of the reporte are its own métricas, in its own order. */
const REPORT_METRICS = MONTHLY_COLUMNS.map((column) => column.id);

interface OpenDay {
  centerId: string;
  year: number;
  monthIndex: number;
  day: number;
}

/**
 * Names what the block below it answers, so the two halves of the tab are not read as one long list
 * of cards: above, the four figures of the reporte together; below, one of them up close.
 */
function SectionHeading({
  title,
  subtitle,
  action,
  first = false,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
  first?: boolean;
}) {
  return (
    <div
      className={
        first
          ? "flex flex-wrap items-end justify-between gap-4"
          : "mt-3 flex flex-wrap items-end justify-between gap-4 border-t border-border pt-5"
      }
    >
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{subtitle}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function GraficosView() {
  const {
    datasets,
    activeHotelId,
    ready,
    filters,
    activeCenterId,
    isConsolidated,
    setChartScope,
    setMetric,
  } = useOccupancyData();
  const [openDay, setOpenDay] = useState<OpenDay | null>(null);
  // Gráficas por defecto: la pestaña se llama Gráficos y lo primero que se busca es la forma de la
  // temporada; la cifra exacta está a un clic, en la tabla.
  const [view, setView] = useState<ReportView>("graficas");

  const universe = useMemo(
    () =>
      selectionUniverse(
        datasets,
        !isConsolidated && activeCenterId ? { centerId: activeCenterId } : undefined,
      ),
    [datasets, isConsolidated, activeCenterId],
  );
  const query = useMemo(() => toOccupancyQuery(filters, universe), [filters, universe]);

  const colorOf = useMemo(() => colorResolver(colorUniverse(datasets)), [datasets]);
  const universeIds = useMemo(() => colorUniverse(datasets), [datasets]);
  // The tiles report the CLOSE of the period; the panels draw it column by column.
  const totals = useMemo(() => reportTotals(datasets, query), [datasets, query]);
  const evolution = useMemo(
    () => buildOccupancyEvolution(datasets, query, REPORT_METRICS),
    [datasets, query],
  );
  const tables = useMemo(
    () => buildReportTable(evolution, totals, MONTHLY_COLUMNS),
    [evolution, totals],
  );
  const channels = useMemo(() => channelTotals(datasets, query), [datasets, query]);
  const week = useMemo(() => weekdayRhythm(datasets, query), [datasets, query]);
  const heatmaps = useMemo(() => buildHeatmaps(datasets, query), [datasets, query]);

  const channelOrder = useMemo(() => channels.channels.map((entry) => entry.id), [channels]);
  /**
   * With ONE sucursal on screen colour is free — the axis already labels every bar — so each mark takes
   * its OWN slot, twelve hues for twelve months, the way canales paints a bar per channel. With TWO OR
   * MORE it goes back to the sucursal: colour has to keep telling the compared entities apart.
   */
  const colorAt = useCallback((index: number) => colorForPeriod(index), []);
  const weekColor = colorForEntity(universeIds[0] ?? "", universeIds);
  const metric = metricSpec(filters.metric);

  /**
   * The table cannot show a daily axis, so going back to it lifts the axis instead of leaving the
   * reader on a granularity the control no longer offers.
   */
  const onSelectView = useCallback(
    (next: ReportView) => {
      setView(next);
      if (next === "tabla" && filters.scope === "dia") {
        setChartScope("mensual");
      }
    },
    [filters.scope, setChartScope],
  );

  const onSelectDay = useCallback(
    (centerId: string, year: number, monthIndex: number, day: number) =>
      setOpenDay({ centerId, year, monthIndex, day }),
    [],
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

  if (activeHotelId === null) {
    return (
      <div className="px-7 py-5">
        <NoHotelsEmptyState />
      </div>
    );
  }

  if (datasets.length === 0) {
    return (
      <div className="px-7 py-5">
        <NoOccupancyDataEmptyState>
          Sin datos de ocupación. Cárgalos desde la pestaña Datos, con «Cargar Excel», y vuelve aquí
          para comparar sucursales, años y periodos.
        </NoOccupancyDataEmptyState>
      </div>
    );
  }

  const period = periodPhrase(filters);

  /**
   * Canales sits in the FIRST section, not under «Análisis por métrica»: it is the only card that does
   * not read the métrica — it counts nights per channel — so it is a breakdown of the period's total,
   * right where that total is. It is declared once and placed by view so it lines up with whichever
   * reading is on screen.
   */
  const channelsCard = (
    <ChartCard
      title="Canales de venta"
      subtitle={`De dónde salieron esas noches · ${period}`}
      option={
        channels.channels.length > 0 ? channelOption(channels, channelOrder, { colorOf }) : null
      }
      table={channelTable(channels, channelOrder, { colorOf })}
      height={260}
    />
  );
  const comparing = totals.length > 1;
  const isRange = filters.periodMode === "rango";
  const axisTitle = isRange ? SCOPE_TITLES[filters.scope] : "un periodo por fila";

  return (
    <div className="flex flex-col gap-4 px-7 py-5">
      <SectionHeading
        first
        title="Reporte del periodo"
        subtitle={
          isRange
            ? `Las cuatro cifras del reporte —venta, ocupación, tarifa promedio y RevPAR—: el total de ${period}, su evolución ${SCOPE_TITLES[filters.scope]} y de qué canales salieron esas noches.`
            : `Las cuatro cifras del reporte —venta, ocupación, tarifa promedio y RevPAR—: el total de los periodos elegidos (${period}), uno por columna para compararlos, y sus canales de venta.`
        }
        action={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="flex items-center gap-2">
              <span className="text-[11.5px] font-semibold text-faint">Ver como</span>
              <SegmentedControl
                value={view}
                options={REPORT_VIEWS}
                onChange={onSelectView}
                ariaLabel="Ver como"
              />
            </span>
            <span className="flex items-center gap-2">
              <span className="text-[11.5px] font-semibold text-faint">Ver por</span>
              <SegmentedControl
                value={filters.scope}
                options={view === "graficas" ? CHART_SCOPES : SCOPES}
                onChange={setChartScope}
                ariaLabel="Ver por"
              />
            </span>
          </span>
        }
      />

      {/* El cierre del rango marcado, cifra por cifra. Una fila por sucursal-año: marcar dos es
          pedir compararlas, y una cifra mezclada respondería una pregunta que nadie hizo. */}
      <div className="flex flex-col gap-3">
        {totals.map((total) => (
          <div key={occupancySeriesId(total.key)} className="flex flex-col gap-1.5">
            {comparing && (
              <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: colorOf(total.key) }}
                />
                {total.label}
              </span>
            )}
            <div className="flex flex-wrap gap-3">
              {MONTHLY_COLUMNS.map((column) => (
                <StatTile
                  key={column.id}
                  label={column.label}
                  value={formatMonthlyFigure(total.figures[column.id], column.unit)}
                  hint={period}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Una lectura o la otra, nunca las dos: la tabla y las gráficas dicen lo MISMO —salen del mismo
          `evolution`— y ponerlas juntas sería repetirlo. La tabla da la cifra exacta que se compara
          contra el Excel; las gráficas, la forma de la temporada. */}
      {view === "tabla" ? (
        // A todo el ancho: la tabla tiene cinco columnas y el ancho de más es para las cifras.
        <div className="flex flex-col gap-4">
          <ReportTables
            tables={tables}
            colorOf={colorOf}
            period={period}
            axisLabel={axisTitle}
            // El mismo slot que la barra de ese periodo, para que la fila y la gráfica se reconozcan.
            occupancyColorAt={colorAt}
          />
          {channelsCard}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {MONTHLY_COLUMNS.map((column, index) => {
            const bundle = evolution.panels[index];
            return (
              <ChartCard
                key={column.id}
                title={column.label}
                subtitle={`${axisTitle} · ${period}`}
                option={
                  bundle.series.length > 0
                    ? seriesOption(bundle, {
                        colorOf,
                        compact: true,
                        // Comparing, this is ignored: the sucursal keeps the colour.
                        colorAt,
                      })
                    : null
                }
                table={seriesTable(bundle, { colorOf })}
                // La tabla de estas cuatro es la vista «Tabla» de la sección, no un botón por tarjeta:
                // cuatro botones abriendo cuatro tablitas es la misma cosa cuatro veces.
                tableToggle={false}
                warnings={index === 0 ? evolution.warnings : undefined}
                height={240}
              />
            );
          })}
          {/* Ocupa la fila entera: los nombres de canal son palabras y se leen a lo ancho. */}
          <div className="col-span-2">{channelsCard}</div>
        </div>
      )}

      <SectionHeading
        title="Análisis por métrica"
        subtitle="Una sola cifra, mirada de cerca: su mapa de calor día a día y su ritmo por día de la semana. Los filtros de arriba también la acotan."
        action={
          <span className="flex items-center gap-2">
            <span className="text-[11.5px] font-semibold text-faint">Métrica</span>
            <MetricSelect value={filters.metric} onChange={setMetric} />
          </span>
        }
      />

      <HeatmapCard result={heatmaps} onSelectDay={onSelectDay} />

      <ChartCard
        title={`${metric.label} por día de la semana`}
        subtitle={`Dónde se cae y dónde se llena · ${period}`}
        option={weekdayOption(week, metric.unit, { colorOf, colorAt }, weekColor)}
        table={weekdayTable(week, metric.unit, { colorOf }, weekColor)}
        height={260}
      />

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
