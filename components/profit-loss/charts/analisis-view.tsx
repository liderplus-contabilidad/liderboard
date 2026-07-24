"use client";

import { useMemo } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Toolbar, ToolbarLabel } from "@/components/ui/toolbar";
import { periodLabel } from "@/lib/profit-loss/analytics/period";
import { toPareto, type AmountEntry } from "@/lib/profit-loss/analytics/structure";
import {
  toIndex100,
  toMovingAverage,
  toPreviousYear,
  toYtd,
} from "@/lib/profit-loss/analytics/temporal";
import { toPctOfContainer, toPctOfRevenue } from "@/lib/profit-loss/analytics/structure";
import { compareSeries } from "@/lib/profit-loss/analytics/variation";
import type {
  AnalyticsSource,
  Series,
  SeriesBundle,
  SeriesKey,
} from "@/lib/profit-loss/analytics/types";
import {
  comboOption,
  entryTable,
  horizontalBarOption,
  paretoOption,
  seriesOptionFor,
  seriesTable,
  seriesTableFor,
  signColorOf,
  variationBarOption,
  type ChartTable,
  type ChartUnit,
} from "@/lib/profit-loss/charts/option";
import {
  amountsAt,
  compositionQuery,
  excludedNote,
  EXPENSE_ROOT,
  intersectWithMarked,
  lastCoveredIndex,
  leavesOf,
  topByMagnitude,
  topEntries,
} from "@/lib/profit-loss/charts/presets";
import {
  activeSource,
  ANALYSIS_TRANSFORMS,
  SHAPES_BY_TRANSFORM,
  toSeriesQuery,
  type ChartType,
  type TransformId,
} from "@/lib/profit-loss/charts/selection";
import { usePygAnalytics } from "../pyg-analytics-provider";
import { usePygData } from "../pyg-data-provider";
import { PygEmptyState } from "../pyg-empty-state";
import { ChartCard } from "./chart-card";
import { entryColor } from "./graficos-view";

const EMPTY_TABLE: ChartTable = { columns: [], rows: [] };

const GROUP_LABELS: { id: "temporal" | "estructura" | "variacion"; label: string }[] = [
  { id: "temporal", label: "Temporal" },
  { id: "estructura", label: "Estructura" },
  { id: "variacion", label: "Variación" },
];

/**
 * Análisis answers *how it changes*. Without touching the transformation picker it shows three
 * cards that need no configuration — the main expenses against revenue, how each account moved
 * against the previous period, and where the spend concentrates — each intersecting its fixed
 * question with whatever the "Cuenta contable" filter marks (task: the filter bounds every
 * card, including these). Picking any transformation from the picker adds a fourth card built
 * from the SAME filters through `toSeriesQuery`, in the shape that transformation admits.
 */
export function AnalisisView() {
  const { dataset, filters } = usePygData();
  const { context, colorOf, transform, chartType, setTransform, runQuery } = usePygAnalytics();
  const source = activeSource(context);
  // `toPctOfRevenue` takes the engine's own mutable array; the context keeps its list readonly.
  const sources = useMemo<AnalyticsSource[]>(() => [...context.sources], [context.sources]);

  const expenseLeaves = leavesOf(source, EXPENSE_ROOT);
  const expenseCodes = intersectWithMarked(expenseLeaves, filters.codes);
  const expenses = useMemo(
    () => runQuery(compositionQuery(expenseCodes, context, { periods: filters.periods })),
    [runQuery, expenseCodes, context, filters.periods],
  );
  const period = useMemo(() => lastCoveredIndex(expenses), [expenses]);
  const periodName = expenses.periods[period]
    ? periodLabel(expenses.periods[period])
    : "Sin movimiento";
  const expensesEmptyNote =
    expenseLeaves.length > 0 && expenseCodes.length === 0
      ? "El filtro de cuentas marcadas no incluye ninguna cuenta de Costos y Gastos."
      : undefined;

  // % over revenue of the largest expenses — each against the revenue of ITS OWN source, which
  // is what makes two centers of very different size comparable.
  const topExpenses = useMemo(
    () => topEntries(amountsAt(expenses, period)).entries,
    [expenses, period],
  );
  const shares = useMemo(() => {
    const codes = new Set(topExpenses.map((entry) => entry.code));
    return expenses.series
      .filter((series) => codes.has(series.key.code))
      .map((series) => toPctOfRevenue(series, sources));
  }, [expenses, topExpenses, sources]);
  // Ranked before the colors are resolved: the slot order has to match the drawn order, or the
  // first bar of the card comes out painted slot 6.
  const shareEntries = useMemo(
    () => topEntries(atPeriod(shares, period)).entries,
    [shares, period],
  );
  const shareColor = useMemo(
    () => entryColor(shareEntries.map((entry) => entry.code)),
    [shareEntries],
  );

  // Variation against the previous period: the sign is the reading, so it goes out with an
  // icon and the signed value too, never as color alone.
  const variation = useMemo(
    () => topByMagnitude(variationEntries(expenses, period)),
    [expenses, period],
  );
  const variationColor = useMemo(() => signColorOf(variation.entries), [variation]);

  const pareto = useMemo(() => toPareto(amountsAt(expenses, period)), [expenses, period]);
  const paretoColor = useMemo(
    () => entryColor(pareto.entries.map((entry) => entry.code)),
    [pareto],
  );

  // The picker's own card: once the user picks a transformation, it draws whatever the filter
  // bar marks (or the engine default) in that shape — `montos`, the picker's unpickable initial
  // value, is what keeps it hidden until then, not a "comparing" flag to maintain in step.
  const primaryQuery = useMemo(() => toSeriesQuery(filters, context), [filters, context]);
  const primary = useMemo(() => runQuery(primaryQuery), [runQuery, primaryQuery]);
  const primaryPeriod = useMemo(() => lastCoveredIndex(primary), [primary]);
  const primaryPeriodName = primary.periods[primaryPeriod]
    ? periodLabel(primary.periods[primaryPeriod])
    : "Sin movimiento";

  if (!dataset) {
    return <PygEmptyState />;
  }

  return (
    <div className="flex flex-col gap-4 px-7 py-5">
      <TransformPicker value={transform} onChange={setTransform} />

      {transform !== "montos" && (
        <TransformedCard
          bundle={primary}
          transform={transform}
          chartType={chartType}
          colorOf={colorOf}
          sources={sources}
          periodName={primaryPeriodName}
        />
      )}

      <ChartCard
        title="Gastos principales sobre ingresos"
        subtitle={`% sobre ingresos · ${periodName}`}
        option={
          shareEntries.length > 0
            ? horizontalBarOption(shareEntries, {
                colorOf: shareColor,
                unit: "porcentaje",
              })
            : null
        }
        table={
          shareEntries.length > 0
            ? entryTable(shareEntries, { colorOf: shareColor, unit: "porcentaje" }, "% ingresos")
            : EMPTY_TABLE
        }
        warnings={expenses.warnings}
        note={expensesEmptyNote}
        height={300}
      />

      <div className="grid grid-cols-2 gap-4">
        <ChartCard
          title="Variación contra el periodo anterior"
          subtitle={periodName}
          option={variation.entries.length > 0 ? variationBarOption(variation.entries) : null}
          table={
            variation.entries.length > 0
              ? entryTable(variation.entries, { colorOf: variationColor }, "Variación")
              : EMPTY_TABLE
          }
          note={[
            "Cada barra lleva su flecha y su valor con signo; el color no es la única señal.",
            expensesEmptyNote ?? "",
            variation.hidden > 0
              ? `Se muestran los ${variation.entries.length} movimientos más grandes; ${variation.hidden} quedaron fuera.`
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
          height={300}
        />

        <ChartCard
          title="Concentración de gastos"
          subtitle={`Pareto · ${periodName}`}
          option={pareto.entries.length > 0 ? paretoOption(pareto, { colorOf: paretoColor }) : null}
          table={
            pareto.entries.length > 0
              ? entryTable(pareto.entries, { colorOf: paretoColor })
              : EMPTY_TABLE
          }
          note={expensesEmptyNote ?? excludedNote(pareto.excluded, "Sin acumular")}
          height={300}
        />
      </div>
    </div>
  );
}

/** The transformation selector, grouped the way the engine's families are. */
function TransformPicker({
  value,
  onChange,
}: {
  value: TransformId;
  onChange: (transform: TransformId) => void;
}) {
  return (
    <Toolbar tone="sunken">
      {GROUP_LABELS.map((group) => (
        <div key={group.id} className="flex items-center gap-2.5">
          <ToolbarLabel>{group.label}</ToolbarLabel>
          <SegmentedControl
            variant="track"
            className="bg-surface"
            ariaLabel={`Transformación · ${group.label}`}
            options={ANALYSIS_TRANSFORMS.filter((entry) => entry.group === group.id).map(
              (entry) => ({ value: entry.id, label: entry.label }),
            )}
            value={value}
            onChange={onChange}
          />
        </div>
      ))}
    </Toolbar>
  );
}

/** The card for whatever transformation the user picked, drawn in the shape it admits. */
function TransformedCard({
  bundle,
  transform,
  chartType,
  colorOf,
  sources,
  periodName,
}: {
  bundle: SeriesBundle;
  transform: TransformId;
  chartType: ChartType;
  colorOf: (key: SeriesKey) => string;
  sources: AnalyticsSource[];
  periodName: string;
}) {
  const label = ANALYSIS_TRANSFORMS.find((entry) => entry.id === transform)?.label ?? "Análisis";
  const shape = SHAPES_BY_TRANSFORM[transform].includes(chartType)
    ? chartType
    : SHAPES_BY_TRANSFORM[transform][0];
  const unit = unitFor(transform);
  const optionContext = { colorOf, periods: bundle.periods, unit };

  // The combo shapes read TWO series of the same unit off one; the rest map one to one.
  if (shape === "combo") {
    const base = bundle.series[0];
    if (!base) {
      return <ChartCard title={label} subtitle={periodName} option={null} table={EMPTY_TABLE} />;
    }
    const overlay =
      transform === "media-movil" ? toMovingAverage(base) : toPreviousYear(base, bundle);
    return (
      <ChartCard
        title={`${base.label} · ${label}`}
        subtitle="Mismo eje, misma unidad"
        option={comboOption(base, overlay, label, optionContext)}
        table={seriesTable([base, { ...overlay, label }], optionContext)}
        warnings={bundle.warnings}
        height={320}
      />
    );
  }

  // `compareSeries` gets signed bars: the sign IS the reading, so it is drawn with the sign
  // tokens plus an arrow and the signed amount, never with color alone.
  if (transform === "variacion") {
    const index = lastCoveredIndex(bundle);
    const { entries } = topByMagnitude(variationEntries(bundle, index));
    const color = signColorOf(entries);
    return (
      <ChartCard
        title={label}
        subtitle={periodName}
        option={entries.length > 0 ? variationBarOption(entries) : null}
        table={
          entries.length > 0 ? entryTable(entries, { colorOf: color }, "Variación") : EMPTY_TABLE
        }
        warnings={bundle.warnings}
        note="Cada barra lleva su flecha y su valor con signo; el color no es la única señal."
        height={320}
      />
    );
  }

  if (shape === "pareto") {
    const index = lastCoveredIndex(bundle);
    const result = toPareto(amountsAt(bundle, index));
    const color = entryColor(result.entries.map((entry) => entry.code));
    return (
      <ChartCard
        title={label}
        subtitle={periodName}
        option={result.entries.length > 0 ? paretoOption(result, { colorOf: color }) : null}
        table={
          result.entries.length > 0 ? entryTable(result.entries, { colorOf: color }) : EMPTY_TABLE
        }
        warnings={bundle.warnings}
        height={320}
      />
    );
  }

  if (shape === "barras-horizontales") {
    const index = lastCoveredIndex(bundle);
    const transformed = bundle.series.map((series) => toPctOfRevenue(series, sources));
    const { entries } = topEntries(atPeriod(transformed, index));
    const color = entryColor(entries.map((entry) => entry.code));
    return (
      <ChartCard
        title={label}
        subtitle={periodName}
        option={
          entries.length > 0
            ? horizontalBarOption(entries, { colorOf: color, unit: "porcentaje" })
            : null
        }
        table={
          entries.length > 0
            ? entryTable(entries, { colorOf: color, unit: "porcentaje" }, "% ingresos")
            : EMPTY_TABLE
        }
        warnings={bundle.warnings}
        height={320}
      />
    );
  }

  const series = transformSeries(bundle, transform, sources);
  return (
    <ChartCard
      title={label}
      subtitle="Todas las series marcadas"
      option={series.length > 0 ? seriesOptionFor(shape, series, optionContext) : null}
      table={seriesTableFor(shape, series, optionContext)}
      warnings={[...bundle.warnings, ...series.flatMap((entry) => entry.warnings ?? [])]}
      height={320}
    />
  );
}

/** The engine's transformation for the shapes that map one series to one series. */
function transformSeries(
  bundle: SeriesBundle,
  transform: TransformId,
  sources: AnalyticsSource[],
): Series[] {
  switch (transform) {
    case "ytd":
      return bundle.series.map(toYtd);
    case "index100":
      return bundle.series.map((series) => toIndex100(series));
    case "pct-contenedor":
      return bundle.series.map(toPctOfContainer);
    case "pct-ingresos":
      return bundle.series.map((series) => toPctOfRevenue(series, sources));
    case "variacion":
      return bundle.series.map((series) => ({
        ...series,
        points: compareSeries(series, { kind: "periodo-anterior" }).map((point) => ({
          period: point.period,
          value: point.deltaAbs,
        })),
      }));
    default:
      return bundle.series;
  }
}

function unitFor(transform: TransformId): ChartUnit {
  if (transform === "pct-ingresos" || transform === "pct-contenedor") {
    return "porcentaje";
  }
  return transform === "index100" ? "indice" : "moneda";
}

/** One entry per series at one period, dropping the ones with no coverage there. */
function atPeriod(series: Series[], index: number): AmountEntry[] {
  if (index < 0) {
    return [];
  }
  return series
    .map((entry) => ({
      code: entry.key.code,
      label: entry.label,
      value: entry.points[index]?.value ?? null,
    }))
    .filter((entry): entry is AmountEntry => entry.value !== null);
}

/** The change of each account against the previous period, signed. */
function variationEntries(bundle: SeriesBundle, index: number): AmountEntry[] {
  if (index <= 0) {
    return [];
  }
  return bundle.series
    .map((series) => {
      const points = compareSeries(series, { kind: "periodo-anterior" });
      return {
        code: series.key.code,
        label: series.label,
        value: points[index]?.deltaAbs ?? null,
      };
    })
    .filter((entry): entry is AmountEntry => entry.value !== null);
}
