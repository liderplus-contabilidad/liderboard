/**
 * Resumen's cards, described as DATA (`ChartCardSpec`) and chosen by the QUESTION each answers at
 * the cut date — the `dataviz` method: the form first, the colour by its job, and no card whose
 * question the open data cannot answer (a builder returns `null` and the view draws nothing).
 *
 *   1. «¿Qué tan vencida está la cartera?» — the aging as ONE ordered axis, the FORMATO IDEAL's own
 *      column order: from the most overdue on the left to the furthest due on the right, the cut
 *      date standing in the middle. Two hues, one per side (`colorForEntity`, validated: ΔE 26.3
 *      protan · 38.0 normal), stacked so each bar sits centred on its bucket.
 *   2. «¿Cuánto sale cada semana?» — the marked payments by the week they are scheduled for
 *      (`payOn`, else the due date), urgent and pending stacked, the overdue and the undated as
 *      their own columns.
 *   3. «¿A quién le debo más?» — the ranking of open balances, EMPHASIS form: one hue for the
 *      suppliers, the neutral for «Otros», a direct label with the share.
 *   4. «¿Cómo viene el saldo en bancos?» — the captured balances by flow date, a line: only what
 *      was CAPTURED (saldo + sobregiro), because the marks are live and a past saldo
 *      final cannot be reconstructed honestly. Drawn from two flows on.
 *   5. «¿Qué cuenta queda corta?» — total bancos against saldo final per account, from two accounts
 *      on: with one, the tiles already say it and a one-bar chart is an axis for one figure.
 *   6. «¿Dónde están los cheques sin cobrar?» — by account, one hue, only with a register and two
 *      accounts or more.
 *
 * Nothing here decides a figure — every number comes from `deriveFlow`, `agingDistribution`,
 * `groupBySupplier` and `markedSplit` — and nothing is stored. The chrome (tooltip with `confine`,
 * axes, legend) is this module's, written once below with the numbers PyG's and Reportería's read.
 */
import {
  CHART_FONT,
  CHART_INK,
  CHART_LINES,
  CHART_MARK,
  CHART_NEUTRAL,
  CHART_SURFACE,
  colorForEntity,
} from "@/lib/charts/palette";
import type {
  ChartAxis,
  ChartCardSpec,
  ChartLegend,
  ChartOption,
  ChartSeries,
  ChartTable,
  ChartTooltip,
} from "@/lib/charts/types";
import { fitBarWidth } from "@/lib/charts/bar-fit";
import { formatCurrency } from "@/lib/format";
import { formatDayMonthYear } from "@/lib/date";
import { AGING_BUCKETS, agingSideLabel, type AgingBucket } from "./aging";
import { addDays, daysBetween } from "./dates";
import { agingDistribution, groupBySupplier, markedSplit, money } from "./derive";
import type { DerivedFlow } from "./flow";
import { accountLabel } from "./flow";
import type { BankAccount, CashFlowCenter, Payable, PaymentFlow } from "./types";

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
        .filter((row) => row.value !== null && row.value !== undefined && Number(row.value) !== 0)
        .map(
          (row) =>
            `<div>${row.marker ?? ""} ${row.seriesName ?? ""}: <b>${money(Number(row.value))}</b></div>`,
        )
        .join("");
      return `<div style="font-weight:600;margin-bottom:4px">${rows[0]?.name ?? ""}</div>${
        body || `<div style="color:${CHART_INK.muted}">Nada</div>`
      }`;
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

/** A figure over its mark, in the app's ink — never in the series colour. */
function directLabel(unit: (value: number) => string): Pick<ChartSeries, "label" | "labelLayout"> {
  return {
    label: {
      show: true,
      position: "top",
      color: CHART_INK.strong,
      fontSize: 11,
      formatter: (param) =>
        param.value === null || param.value === undefined || Number(param.value) === 0
          ? ""
          : unit(Number(param.value)),
    },
    labelLayout: { hideOverlap: true },
  };
}

// ---------------------------------------------------------------------------
// 1 · Vencimientos de la cartera
// ---------------------------------------------------------------------------

const AGING_SIDES = ["due", "overdue"] as const;

function bucketSpan(bucket: AgingBucket): string {
  return bucket === "120+" ? ">120 d" : `${bucket} d`;
}

/** The one axis: overdue from the oldest, then the cut, then due to the furthest. */
export const AGING_TIMELINE: readonly { side: "overdue" | "due"; bucket: AgingBucket }[] = [
  ...[...AGING_BUCKETS].reverse().map((bucket) => ({ side: "overdue" as const, bucket })),
  ...AGING_BUCKETS.map((bucket) => ({ side: "due" as const, bucket })),
];

export function agingTimelineCard(
  payables: readonly Payable[],
  asOf: string,
): ChartCardSpec | null {
  const cells = agingDistribution(payables, asOf);
  const labels = AGING_TIMELINE.map((cell) =>
    cell.side === "overdue"
      ? `Vencida ${bucketSpan(cell.bucket)}`
      : `Vence en ${bucketSpan(cell.bucket)}`,
  );
  const colour = (side: string) => colorForEntity(side, [...AGING_SIDES]);
  const overdue = AGING_TIMELINE.map((cell) =>
    cell.side === "overdue" ? cells.overdue[cell.bucket] : 0,
  );
  const due = AGING_TIMELINE.map((cell) => (cell.side === "due" ? cells.due[cell.bucket] : 0));
  const total = [...overdue, ...due].reduce((acc, value) => acc + value, 0);
  if (total === 0) {
    return null;
  }
  const overdueTotal = overdue.reduce((acc, value) => acc + value, 0);
  const table: ChartTable = {
    columns: labels,
    rows: [
      {
        id: "overdue",
        label: agingSideLabel("overdue"),
        color: colour("overdue"),
        values: overdue.map((v) => (v ? money(v) : null)),
      },
      {
        id: "due",
        label: agingSideLabel("due"),
        color: colour("due"),
        values: due.map((v) => (v ? money(v) : null)),
      },
    ],
  };
  const barWidth = fitBarWidth(labels.length);
  return {
    id: "aging",
    title: "Vencimientos de la cartera",
    subtitle: `Saldo abierto por tramo, de lo más vencido a lo más lejano · vencido ${money(overdueTotal)} de ${money(total)}`,
    option: {
      ...baseOption(categoryAxis(labels), currencyAxis(), legendFor(true)),
      series: [
        {
          id: "overdue",
          type: "bar",
          name: agingSideLabel("overdue"),
          stack: "aging",
          data: overdue,
          barWidth,
          itemStyle: { color: colour("overdue"), borderRadius: ROUND_TOP },
          ...directLabel((v) => money(v)),
        },
        {
          id: "due",
          type: "bar",
          name: agingSideLabel("due"),
          stack: "aging",
          data: due,
          barWidth,
          itemStyle: { color: colour("due"), borderRadius: ROUND_TOP },
          ...directLabel((v) => money(v)),
        },
      ],
    },
    table,
    guide: {
      purpose:
        "Cuánto de la cartera ya venció y cuánto vence pronto, contado desde la fecha de corte.",
      actions: [
        {
          control: "Corte",
          effect: "mueve el centro del eje: lo que era por vencer pasa a vencido",
        },
      ],
      reading:
        "Cada barra es el saldo de los documentos de ese tramo; la izquierda del eje ya venció, la derecha vence después del corte.",
    },
    height: CARD_HEIGHT,
  };
}

// ---------------------------------------------------------------------------
// 2 · Pagos marcados por semana
// ---------------------------------------------------------------------------

const WEEK_BUCKETS = [
  "Atrasado",
  "Esta semana",
  "Próxima semana",
  "En 2 semanas",
  "En 3 semanas",
  "Después",
  "Sin fecha",
] as const;
const PRIORITY_ORDER = ["pending", "urgent"] as const;

/** The column a marked document falls in: by its scheduled date, else its due date. */
export function weekBucketOf(payable: Pick<Payable, "payOn" | "dueOn">, asOf: string): number {
  const date = payable.payOn ?? payable.dueOn;
  if (!date) {
    return WEEK_BUCKETS.length - 1;
  }
  const days = daysBetween(asOf, date);
  if (days < 0) {
    return 0;
  }
  const week = Math.floor(days / 7);
  return week <= 3 ? week + 1 : 5;
}

export function paymentCalendarCard(
  payables: readonly Payable[],
  asOf: string,
): ChartCardSpec | null {
  const urgent = WEEK_BUCKETS.map(() => 0);
  const pending = WEEK_BUCKETS.map(() => 0);
  let count = 0;
  for (const payable of payables) {
    const split = markedSplit(payable);
    if (split.urgent === 0 && split.pending === 0) {
      continue;
    }
    count += 1;
    const bucket = weekBucketOf(payable, asOf);
    urgent[bucket] += split.urgent;
    pending[bucket] += split.pending;
  }
  if (count === 0) {
    return null;
  }
  const colour = (id: string) => colorForEntity(id, [...PRIORITY_ORDER]);
  const labels = [...WEEK_BUCKETS];
  const table: ChartTable = {
    columns: labels,
    rows: [
      {
        id: "urgent",
        label: "Urgente",
        color: colour("urgent"),
        values: urgent.map((v) => (v ? money(v) : null)),
      },
      {
        id: "pending",
        label: "Pendiente",
        color: colour("pending"),
        values: pending.map((v) => (v ? money(v) : null)),
      },
      {
        id: "total",
        label: "Total",
        emphasis: true,
        values: labels.map((_, i) =>
          urgent[i] + pending[i] ? money(urgent[i] + pending[i]) : null,
        ),
      },
    ],
  };
  const barWidth = fitBarWidth(labels.length);
  const weekOf = `semana del ${formatDayMonthYear(asOf)} al ${formatDayMonthYear(addDays(asOf, 6))}`;
  return {
    id: "calendar",
    title: "Pagos marcados por semana",
    subtitle: `Cuándo sale lo marcado, por su fecha programada (o su vencimiento) · esta ${weekOf}`,
    option: {
      ...baseOption(categoryAxis(labels), currencyAxis(), legendFor(true)),
      series: [
        {
          id: "urgent",
          type: "bar",
          name: "Urgente",
          stack: "marked",
          data: urgent,
          barWidth,
          itemStyle: { color: colour("urgent") },
        },
        {
          id: "pending",
          type: "bar",
          name: "Pendiente",
          stack: "marked",
          data: pending,
          barWidth,
          itemStyle: { color: colour("pending"), borderRadius: ROUND_TOP },
        },
      ],
    },
    table,
    guide: {
      purpose:
        "Repartir en el calendario lo que ya se decidió pagar, para ver qué semana pesa más.",
      actions: [
        {
          control: "Programar",
          effect: "en Cuentas por pagar, fija la semana en la que cae un documento",
        },
        { control: "Corte", effect: "mueve el inicio de «Esta semana»" },
      ],
      reading:
        "«Atrasado» es lo marcado cuya fecha ya pasó; «Sin fecha», lo marcado sin fecha programada ni vencimiento.",
    },
    height: CARD_HEIGHT,
  };
}

// ---------------------------------------------------------------------------
// 3 · Concentración por proveedor
// ---------------------------------------------------------------------------

const SUPPLIER_MAX = 8;

export function supplierCard(payables: readonly Payable[]): ChartCardSpec | null {
  const groups = groupBySupplier(payables.filter((payable) => payable.status === "open"));
  if (groups.length === 0) {
    return null;
  }
  const head = groups.slice(0, SUPPLIER_MAX);
  const tail = groups.slice(SUPPLIER_MAX);
  const others = tail.reduce((acc, group) => acc + group.balance, 0);
  const hue = colorForEntity("supplier", ["supplier"]);
  const entries = [
    ...head.map((group) => ({
      id: group.key,
      label: group.label,
      value: group.balance,
      color: hue,
    })),
    ...(tail.length > 0
      ? [{ id: "others", label: `Otros (${tail.length})`, value: others, color: CHART_NEUTRAL }]
      : []),
  ];
  const total = entries.reduce((acc, entry) => acc + entry.value, 0);
  const share = (value: number) => (total > 0 ? `${((value / total) * 100).toFixed(1)} %` : "");
  const table: ChartTable = {
    columns: ["Saldo", "Participación"],
    rows: entries.map((entry) => ({
      id: entry.id,
      label: entry.label,
      color: entry.color,
      values: [money(entry.value), share(entry.value)],
    })),
  };
  return {
    id: "suppliers",
    title: "Concentración por proveedor",
    subtitle: `Saldo abierto de los ${Math.min(SUPPLIER_MAX, head.length)} mayores${tail.length > 0 ? " y el resto agrupado" : ""} · ${money(total)} en total`,
    option: {
      animationDuration: 260,
      textStyle: { fontFamily: CHART_FONT },
      grid: {
        left: 8,
        right: 96,
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
          barWidth: 14,
          label: {
            show: true,
            position: "right",
            color: CHART_INK.strong,
            fontSize: 11,
            formatter: (param) => `${money(Number(param.value))} · ${share(Number(param.value))}`,
          },
          labelLayout: { hideOverlap: true },
        },
      ],
    },
    table,
    guide: {
      purpose: "Ver quién concentra la deuda: pocos proveedores grandes o muchos pequeños.",
      actions: [{ control: "Centro", effect: "limita la cartera a una unidad" }],
    },
    height: Math.max(CARD_HEIGHT, 40 + entries.length * 28),
  };
}

// ---------------------------------------------------------------------------
// 4 · Saldo en bancos por fecha de flujo
// ---------------------------------------------------------------------------

export function bankHistoryCard(
  flows: readonly PaymentFlow[],
  accounts: readonly BankAccount[],
  asOf: string,
): ChartCardSpec | null {
  const overdraft = accounts.reduce((acc, account) => acc + account.overdraft, 0);
  const ids = new Set(accounts.map((account) => account.id));
  const points = [...flows]
    .filter((flow) => flow.date <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((flow) => {
      const balance = Object.entries(flow.balances)
        .filter(([id]) => ids.has(id))
        .reduce((acc, [, v]) => acc + v, 0);
      return {
        date: flow.date,
        balance,
        total: Math.round((balance + overdraft) * 100) / 100,
      };
    });
  if (points.length < 2) {
    return null;
  }
  const hue = colorForEntity("bank", ["bank"]);
  const labels = points.map((point) => formatDayMonthYear(point.date) ?? point.date);
  const table: ChartTable = {
    columns: labels,
    rows: [
      { id: "balance", label: "Saldo capturado", values: points.map((p) => money(p.balance)) },
      {
        id: "total",
        label: "Total bancos",
        color: hue,
        emphasis: true,
        values: points.map((p) => money(p.total)),
      },
    ],
  };
  return {
    id: "history",
    title: "Total bancos por fecha de flujo",
    subtitle: "Lo capturado en cada flujo: saldo + sobregiro",
    option: {
      ...baseOption(categoryAxis(labels), currencyAxis(), legendFor(false)),
      series: [
        {
          id: "total",
          type: "line",
          name: "Total bancos",
          data: points.map((p) => p.total),
          symbol: "circle",
          symbolSize: 8,
          lineStyle: { color: hue, width: 2 },
          itemStyle: { color: hue },
          ...directLabel((v) => money(v)),
        },
      ],
    },
    table,
    guide: {
      purpose: "Seguir cómo viene el dinero en bancos de un flujo al siguiente.",
      actions: [{ control: "Corte", effect: "la línea llega hasta esa fecha" }],
      reading:
        "Solo lo capturado: los pagos marcados cambian, así que el saldo final de una fecha pasada no se reconstruye.",
    },
    height: CARD_HEIGHT,
  };
}

// ---------------------------------------------------------------------------
// 5 · Total bancos y saldo final por cuenta
// ---------------------------------------------------------------------------

const FLOW_SERIES = ["bankTotal", "remaining"] as const;

export function balanceByAccountCard(
  derived: DerivedFlow,
  centers: readonly CashFlowCenter[],
): ChartCardSpec | null {
  if (derived.accounts.length < 2) {
    return null;
  }
  const labels = derived.accounts.map((row) => accountLabel(row.account, centers));
  const bankTotal = derived.accounts.map((row) => row.bankTotal);
  const remaining = derived.accounts.map((row) => row.remaining);
  const colour = (id: string) => colorForEntity(id, [...FLOW_SERIES]);
  const table: ChartTable = {
    columns: labels,
    rows: [
      {
        id: "bankTotal",
        label: "Total bancos",
        color: colour("bankTotal"),
        values: bankTotal.map(money),
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
  const barWidth = fitBarWidth(labels.length, 2);
  return {
    id: "balance",
    title: "Total bancos y saldo final por cuenta",
    subtitle: "Lo que tiene cada cuenta y lo que le queda tras cheques y pagos marcados",
    option: {
      ...baseOption(categoryAxis(labels), currencyAxis(), legendFor(true)),
      series: [
        {
          id: "bankTotal",
          type: "bar",
          name: "Total bancos",
          data: bankTotal,
          barWidth,
          barGap: "20%",
          itemStyle: { color: colour("bankTotal"), borderRadius: ROUND_TOP },
        },
        {
          id: "remaining",
          type: "bar",
          name: "Saldo final",
          data: remaining,
          barWidth,
          barGap: "20%",
          itemStyle: { color: colour("remaining"), borderRadius: ROUND_TOP },
          ...directLabel((v) => money(v)),
        },
      ],
    },
    table,
    guide: {
      purpose:
        "Saber qué cuenta queda corta y cuál sobra, para mover fondos o cambiar desde dónde se paga.",
      actions: [
        {
          control: "Pagar desde",
          effect: "en el detalle de un documento, cambia la cuenta que lo descuenta",
        },
      ],
    },
    height: CARD_HEIGHT,
  };
}

// ---------------------------------------------------------------------------
// 6 · Cheques no cobrados por cuenta
// ---------------------------------------------------------------------------

export function outstandingChecksCard(
  derived: DerivedFlow,
  centers: readonly CashFlowCenter[],
  hasChecks: boolean,
): ChartCardSpec | null {
  if (!hasChecks || derived.accounts.length < 2) {
    return null;
  }
  const rows = derived.accounts.filter((row) => row.outstanding > 0);
  if (rows.length === 0) {
    return null;
  }
  const hue = colorForEntity("checks", ["checks"]);
  const labels = rows.map((row) => accountLabel(row.account, centers));
  const table: ChartTable = {
    columns: ["No cobrados"],
    rows: rows.map((row) => ({
      id: row.account.id,
      label: accountLabel(row.account, centers),
      color: hue,
      values: [money(row.outstanding)],
    })),
  };
  return {
    id: "checks",
    title: "Cheques no cobrados por cuenta",
    subtitle: `Girados y sin cobrar a la fecha de corte · ${money(derived.totals.outstanding)}`,
    option: {
      ...baseOption(categoryAxis(labels), currencyAxis(), legendFor(false)),
      series: [
        {
          id: "outstanding",
          type: "bar",
          name: "No cobrados",
          data: rows.map((row) => row.outstanding),
          barWidth: fitBarWidth(labels.length),
          itemStyle: { color: hue, borderRadius: ROUND_TOP },
          ...directLabel((v) => money(v)),
        },
      ],
    },
    table,
    guide: {
      purpose: "Ver en qué cuenta hay más dinero comprometido en cheques que todavía no se cobran.",
      actions: [
        {
          control: "Cheques",
          effect: "marcar un cheque cobrado lo saca de aquí desde su fecha de cobro",
        },
      ],
    },
    height: CARD_HEIGHT,
  };
}
