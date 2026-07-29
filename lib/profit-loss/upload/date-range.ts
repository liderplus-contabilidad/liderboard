/**
 * Reads the `Desde el DD/MM/AAAA hasta el DD/MM/AAAA` line the monthly single-statement export
 * carries in its preamble, and decides whether it names exactly one calendar month — the only
 * shape `monthly-single`'s strategy accepts (see the change's design.md, decision 1). The
 * existing `DATE_RANGE` pattern in `parse.ts` only ever read the two months and the final year;
 * this reads every field, because telling `01/01–15/01` apart from a real January needs the days.
 *
 * `toCalendarMonth` is the rule ITSELF, and is shared: MicroPlus reads its range from separate
 * cells (`microplus-grid.ts`) and then holds it to this same test, with the same rejection
 * reasons and the same wording — no per-vendor exception (see `pyg-microplus-upload`'s "La
 * misma regla de rango que el resto de estrategias"). `findDateRange` stays specific to the
 * single-statement format's one-line preamble.
 */
import type { Cell } from "./grid";

const DATE_RANGE_LINE = /Desde el (\d{2})\/(\d{2})\/(\d{4}) hasta el (\d{2})\/(\d{2})\/(\d{4})/i;

export interface DateRange {
  fromDay: number;
  /** 0–11. */
  fromMonth: number;
  fromYear: number;
  toDay: number;
  /** 0–11. */
  toMonth: number;
  toYear: number;
}

/** Scans a preamble's rows (col A only) for the range line; `null` when none is present. */
export function findDateRange(rows: readonly Cell[][]): DateRange | null {
  for (const row of rows) {
    const text = typeof row[0] === "string" ? row[0].trim() : "";
    const match = DATE_RANGE_LINE.exec(text);
    if (match) {
      return {
        fromDay: Number(match[1]),
        fromMonth: Number(match[2]) - 1,
        fromYear: Number(match[3]),
        toDay: Number(match[4]),
        toMonth: Number(match[5]) - 1,
        toYear: Number(match[6]),
      };
    }
  }
  return null;
}

export type CalendarMonthFailureReason = "multi-month" | "not-first-day" | "incomplete-month";

export type CalendarMonthOutcome =
  | { ok: true; year: number; month: number }
  | { ok: false; reason: CalendarMonthFailureReason; message: string };

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function monthsBetween(range: DateRange): number {
  return range.toYear * 12 + range.toMonth - (range.fromYear * 12 + range.fromMonth) + 1;
}

function formatDate(day: number, month: number, year: number): string {
  return `${String(day).padStart(2, "0")}/${String(month + 1).padStart(2, "0")}/${year}`;
}

function rangeLabel(range: DateRange): string {
  return `${formatDate(range.fromDay, range.fromMonth, range.fromYear)}–${formatDate(range.toDay, range.toMonth, range.toYear)}`;
}

const MONTH_NAMES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/**
 * Accepts a range if and only if the three conditions hold at once: the start day is 1, the
 * start and end share month and year, and the end day is that month's REAL last day (leap
 * years included) — checking only the months would let `01/01–15/01` pass as "enero". Checked
 * in this order: a start day other than 1 is reported as such even when the range also happens
 * to span several months (`15/01–14/02`).
 */
export function toCalendarMonth(range: DateRange): CalendarMonthOutcome {
  if (range.fromDay !== 1) {
    return {
      ok: false,
      reason: "not-first-day",
      message:
        `El rango leído (${rangeLabel(range)}) no empieza el día 1 de un mes; ` +
        "la carga mensual exige exportar un mes calendario completo, del día 1 a su último día.",
    };
  }
  if (range.fromYear !== range.toYear || range.fromMonth !== range.toMonth) {
    const months = monthsBetween(range);
    // The range's LAST month is the one the accountant meant: an accumulated export is filtered
    // from January to the month being closed, so that is the export to ask for by name.
    const suggested = `Desde ${formatDate(1, range.toMonth, range.toYear)} hasta ${formatDate(
      lastDayOfMonth(range.toYear, range.toMonth),
      range.toMonth,
      range.toYear,
    )}`;
    return {
      ok: false,
      reason: "multi-month",
      message:
        `El rango leído (${rangeLabel(range)}) abarca ${months} meses; ` +
        "la carga mensual exige exportar un mes calendario a la vez, no un acumulado. " +
        `Vuelve a exportarlo con el rango ${suggested}.`,
    };
  }
  const lastDay = lastDayOfMonth(range.fromYear, range.fromMonth);
  if (range.toDay !== lastDay) {
    return {
      ok: false,
      reason: "incomplete-month",
      message:
        `El rango leído (${rangeLabel(range)}) no cubre ${MONTH_NAMES_ES[range.fromMonth]} completo; ` +
        `el mes va del día 1 al día ${lastDay}.`,
    };
  }
  return { ok: true, year: range.fromYear, month: range.fromMonth };
}
