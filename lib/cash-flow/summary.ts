/**
 * Resumen's three cards, described as DATA (`ChartCardSpec`): saldo por cuenta, cuentas por pagar
 * por antigüedad and distribución por proveedor. Nothing here decides a figure — every number comes
 * from `deriveFlow`, `agingDistribution` and `groupBySupplier` at the cut date — and nothing here is
 * stored. The chrome (tooltip with `confine`, axes, legend) is this module's, written once below,
 * with the same numbers PyG's and Reportería's read.
 *
 * Colours come from `lib/charts/palette.ts` only: the two flow series wear identity slots
 * (`colorForEntity`), the two aging sides too, and the supplier breakdown wears the COMPOSITION scale
 * by size, with «Otros» in the neutral — a breakdown's part is coloured by its place, not by who it is.
 */
import {
  CHART_FONT,
  CHART_INK,
  CHART_LINES,
  CHART_MARK,
  CHART_NEUTRAL,
  CHART_SURFACE,
  colorForCompositionSlot,
  colorForEntity,
  CHART_COMPOSITION_MAX,
} from "@/lib/charts/palette";
import type {
  ChartAxis,
  ChartCardSpec,
  ChartLegend,
  ChartOption,
  ChartTable,
  ChartTooltip,
} from "@/lib/charts/types";
import { fitBarWidth, GROUPED_BAR_GAP } from "@/lib/charts/bar-fit";
import { formatCurrency } from "@/lib/format";
import { AGING_BUCKETS, agingSideLabel, type AgingBucket } from "./aging";
import { agingDistribution, groupBySupplier, money } from "./derive";
import type { DerivedFlow } from "./flow";
import { accountLabel } from "./flow";
import type { CashFlowCenter, Payable } from "./types";

const CARD_HEIGHT = 260;

/** The tooltip's chrome — `confine` above all (`ChartCard` is `overflow-hidden`). */
const TOOLTIP_CHROME = {
  backgroundColor: CHART_SURFACE,
  borderColor: CHART_LINES.axis,
  borderWidth: 1,
  padding: [8, 10] as [number, number],
  textStyle: { color: CHART_INK.strong, fontSize: 12 },
  confine: true,
} as const;

const ROUND_TOP = [CHART_MARK.radius, CHART_MARK.radius, 0, 0] as [number, number, number, number];
const ROUND_RIGHT = [0, CHART_MARK.radius, CHART_MARK.radius, 0] as [
  number,
  number,
  number,
  number,
];

function categoryAxis(labels: readonly string[]): ChartAxis {
  return {
    type: "category",
    data: [...labels],
    axisLine: { show: true, lineStyle: { color: CHART_LINES.axis, width: 1, type: "solid" } },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: { color: CHART_INK.muted, fontSize: 11, interval: 0, hideOverlap: true },
  };
}

function currencyAxis(): ChartAxis {
  return {
    type: "value",
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: true, lineStyle: { color: CHART_LINES.grid, width: 1, type: "solid" } },
    axisLabel: {
      color: CHART_INK.faint,
      fontSize: 11,
      formatter: (value) => formatCurrency(Number(value), { cents: false }),
    },
  };
}

function legendFor(show: boolean): ChartLegend {
  return {
    show,
    type: "scroll",
    bottom: 0,
    icon: "roundRect",
    itemWidth: 10,
    itemHeight: 10,
    itemGap: 14,
    textStyle: { color: CHART_INK.muted, fontSize: 11.5 },
  };
}

function axisTooltip(): ChartTooltip {
  return {
    ...TOOLTIP_CHROME,
    trigger: "axis",
    axisPointer: { type: "shadow", lineStyle: { color: CHART_LINES.axis, width: 1 } },
    formatter: (params) => {
      const rows = Array.isArray(params) ? params : [params];
      const body = rows
        .filter((row) => row.value !== null && row.value !== undefined)
        .map(
          (row) =>
            `<div>${row.marker ?? ""} ${row.seriesName ?? ""}: <b>${money(Number(row.value))}</b></div>`,
        )
        .join("");
      return `<div style="font-weight:600;margin-bottom:4px">${rows[0]?.name ?? ""}</div>${body}`;
    },
  };
}

function baseOption(
  axis: ChartAxis,
  value: ChartAxis,
  legend: ChartLegend,
): Omit<ChartOption, "series"> {
  return {
    animationDuration: 260,
    textStyle: { fontFamily: CHART_FONT },
    grid: {
      left: 8,
      right: 16,
      top: 16,
      bottom: legend.show ? 28 : 8,
      outerBoundsMode: "same",
      outerBoundsContain: "axisLabel",
    },
    xAxis: axis,
    yAxis: value,
    legend,
    tooltip: axisTooltip(),
  };
}

const FLOW_SERIES = ["available", "remaining"] as const;
const AGING_SERIES = ["overdue", "due"] as const;

/** 1 · Saldo por cuenta: the first bar is the account's total bancos (saldo + ingresos + sobregiro),
 *  the second what is left after checks and the marked payments. */
export function balanceByAccountCard(
  derived: DerivedFlow,
  centers: readonly CashFlowCenter[],
): ChartCardSpec {
  const labels = derived.accounts.map((row) => accountLabel(row.account, centers));
  const available = derived.accounts.map((row) => row.bankTotal);
  const remaining = derived.accounts.map((row) => row.remaining);
  const colour = (id: string) => colorForEntity(id, [...FLOW_SERIES]);
  const table: ChartTable = {
    columns: labels,
    rows: [
      {
        id: "available",
        label: "Disponible",
        color: colour("available"),
        values: available.map(money),
      },
      {
        id: "remaining",
        label: "Saldo final",
        color: colour("remaining"),
        emphasis: true,
        values: remaining.map(money),
      },
    ],
  };
  if (labels.length === 0) {
    return {
      id: "balance",
      title: "Saldo por cuenta",
      subtitle: "Total bancos y saldo final a la fecha de corte",
      option: null,
      table,
      height: CARD_HEIGHT,
    };
  }
  const barWidth = fitBarWidth(labels.length, 2);
  return {
    id: "balance",
    title: "Saldo por cuenta",
    subtitle:
      "Barra clara: disponible (saldo + sobregiro) · barra de color: saldo final tras cheques, ingresos y pagos marcados",
    option: {
      ...baseOption(categoryAxis(labels), currencyAxis(), legendFor(true)),
      series: [
        {
          id: "available",
          type: "bar",
          name: "Disponible",
          data: available,
          barWidth,
          barGap: GROUPED_BAR_GAP,
          itemStyle: { color: colour("available"), borderRadius: ROUND_TOP },
        },
        {
          id: "remaining",
          type: "bar",
          name: "Saldo final",
          data: remaining,
          barWidth,
          barGap: GROUPED_BAR_GAP,
          itemStyle: { color: colour("remaining"), borderRadius: ROUND_TOP },
        },
      ],
    },
    table,
    height: CARD_HEIGHT,
  };
}

function bucketLabel(bucket: AgingBucket): string {
  return bucket === "120+" ? ">120 días" : `${bucket} días`;
}

/** 2 · CxP por antigüedad: the two sides over the five buckets, at the cut date. */
export function agingCard(payables: readonly Payable[], asOf: string): ChartCardSpec {
  const cells = agingDistribution(payables, asOf);
  const labels = AGING_BUCKETS.map(bucketLabel);
  const colour = (id: string) => colorForEntity(id, [...AGING_SERIES]);
  const overdue = AGING_BUCKETS.map((bucket) => cells.overdue[bucket]);
  const due = AGING_BUCKETS.map((bucket) => cells.due[bucket]);
  const total = [...overdue, ...due].reduce((acc, value) => acc + value, 0);
  const table: ChartTable = {
    columns: labels,
    rows: [
      {
        id: "overdue",
        label: agingSideLabel("overdue"),
        color: colour("overdue"),
        values: overdue.map(money),
      },
      { id: "due", label: agingSideLabel("due"), color: colour("due"), values: due.map(money) },
    ],
  };
  const barWidth = fitBarWidth(labels.length, 2);
  return {
    id: "aging",
    title: "Cuentas por pagar por antigüedad",
    subtitle: "Días frente a la fecha de corte · saldo abierto",
    option:
      total === 0
        ? null
        : {
            ...baseOption(categoryAxis(labels), currencyAxis(), legendFor(true)),
            series: [
              {
                id: "overdue",
                type: "bar",
                name: agingSideLabel("overdue"),
                data: overdue,
                barWidth,
                barGap: GROUPED_BAR_GAP,
                itemStyle: { color: colour("overdue"), borderRadius: ROUND_TOP },
              },
              {
                id: "due",
                type: "bar",
                name: agingSideLabel("due"),
                data: due,
                barWidth,
                barGap: GROUPED_BAR_GAP,
                itemStyle: { color: colour("due"), borderRadius: ROUND_TOP },
              },
            ],
          },
    table,
    height: CARD_HEIGHT,
  };
}

/** 3 · Distribución por proveedor: the six largest open balances and the rest folded into «Otros»,
 *  as horizontal bars largest first. */
export function supplierCard(payables: readonly Payable[]): ChartCardSpec {
  const groups = groupBySupplier(payables.filter((payable) => payable.status === "open"));
  const head = groups.slice(0, CHART_COMPOSITION_MAX);
  const tail = groups.slice(CHART_COMPOSITION_MAX);
  const others = tail.reduce((acc, group) => acc + group.balance, 0);
  const entries = [
    ...head.map((group, index) => ({
      id: group.key,
      label: group.label,
      value: group.balance,
      color: colorForCompositionSlot(index),
    })),
    ...(tail.length > 0
      ? [{ id: "others", label: `Otros (${tail.length})`, value: others, color: CHART_NEUTRAL }]
      : []),
  ];
  const total = entries.reduce((acc, entry) => acc + entry.value, 0);
  const table: ChartTable = {
    columns: ["Saldo", "Participación"],
    rows: entries.map((entry) => ({
      id: entry.id,
      label: entry.label,
      color: entry.color,
      values: [
        money(entry.value),
        total > 0 ? `${((entry.value / total) * 100).toFixed(1)} %` : null,
      ],
    })),
  };
  return {
    id: "suppliers",
    title: "Distribución por proveedor",
    subtitle: "Saldo pendiente · seis mayores y el resto agrupado",
    option:
      entries.length === 0
        ? null
        : {
            animationDuration: 260,
            textStyle: { fontFamily: CHART_FONT },
            grid: {
              left: 8,
              right: 24,
              top: 8,
              bottom: 8,
              outerBoundsMode: "same",
              outerBoundsContain: "axisLabel",
            },
            xAxis: currencyAxis(),
            yAxis: { ...categoryAxis(entries.map((entry) => entry.label)), inverse: true },
            legend: legendFor(false),
            tooltip: axisTooltip(),
            series: [
              {
                id: "balance",
                type: "bar",
                name: "Saldo",
                data: entries.map((entry) => ({
                  value: entry.value,
                  itemStyle: { color: entry.color, borderRadius: ROUND_RIGHT },
                })),
                barWidth: fitBarWidth(entries.length),
              },
            ],
          },
    table,
    height: CARD_HEIGHT,
  };
}
