/**
 * Shared calendar labels (Spanish). Any module that lays out monthly columns should
 * pull from here rather than re-declaring the list, so month order and spelling stay
 * consistent across the app.
 */

/** Short month labels, January-first: ["Ene", …, "Dic"]. */
export const MONTHS_SHORT_ES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
] as const;

/**
 * Full month names, index-aligned with `MONTHS_SHORT_ES`. Used where labels must be
 * unabbreviated — the PyG export header (which parse reads back, matching these names).
 */
export const MONTHS_FULL_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * `"2025-10-07"` → `"07/10/2025"`. The way this app writes a CIVIL date —an employee's hire date, the
 * ends of a payroll período—, which is day/month/year in Ecuador.
 *
 * `null` when there is no date or when it cannot be read, never a broken string: the rol's parser
 * already leaves `null` on an unreadable hire date, but old or hand-typed data can arrive wrong and a
 * screen must not paint «NaN/NaN/NaN».
 *
 * It splits the string instead of building a `Date`: `new Date("2026-03-01")` is interpreted as UTC
 * midnight and, read in a western time zone, goes back to 28 February. A rol that starts the day
 * before the one it says is an error almost nobody looks at twice.
 */
export function formatDayMonthYear(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) {
    return null;
  }
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/**
 * «30 de julio de 2026, 14:22» — the local reading of a date-time, the one the accountant checks.
 * Both printable reports (PyG and Sueldos por Áreas) use it to stamp «Generado el…», so it lives here
 * instead of being written twice and risking saying the date in two ways.
 */
export function formatTimestampEs(date: Date): string {
  const day = date.getDate();
  const month = MONTHS_FULL_ES[date.getMonth()]?.toLowerCase() ?? String(date.getMonth() + 1);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day} de ${month} de ${date.getFullYear()}, ${hours}:${minutes}`;
}

/**
 * The two ends of a month, already formatted: `monthBounds(2026, 2)` → `01/03/2026` and `31/03/2026`.
 * `monthIndex` is 0–11, as in the rest of the app.
 *
 * The last day comes out of `new Date(year, monthIndex + 1, 0)`, which is day 0 of the following
 * month —that is, the last of the one asked for— and that is why it gets a leap February right
 * without a table of lengths or a special case. Built with the LOCAL three-argument constructor,
 * which does not suffer the time-zone shift `formatDayMonthYear` guards against.
 */
export function monthBounds(year: number, monthIndex: number): { start: string; end: string } {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const month = pad2(monthIndex + 1);
  return { start: `01/${month}/${year}`, end: `${pad2(lastDay)}/${month}/${year}` };
}

/** A calendar month, `monthIndex` 0–11 as in the rest of the app. */
export interface YearMonth {
  year: number;
  monthIndex: number;
}

/**
 * A SET of months said as its contiguous runs: «Octubre 2022», «Enero – Febrero 2023»,
 * «Junio 2023 – Octubre 2026». Forty-four months enumerated one by one are a wall nobody reads, and
 * a single «first – last» would claim the months in between that are not there — the runs are the
 * one shape that is both short and true, and they make a gap visible instead of burying it.
 *
 * Order and repeats in the input do not matter; December → January continues a run.
 */
export function monthRangeLabels(months: readonly YearMonth[]): string[] {
  const ordinals = [...new Set(months.map((month) => month.year * 12 + month.monthIndex))].sort(
    (a, b) => a - b,
  );
  const name = (ordinal: number) => MONTHS_FULL_ES[ordinal % 12];
  const year = (ordinal: number) => Math.floor(ordinal / 12);
  const labels: string[] = [];
  let start = 0;
  for (let at = 1; at <= ordinals.length; at += 1) {
    if (at < ordinals.length && ordinals[at] === ordinals[at - 1] + 1) {
      continue;
    }
    const first = ordinals[start];
    const last = ordinals[at - 1];
    if (first === last) {
      labels.push(`${name(first)} ${year(first)}`);
    } else if (year(first) === year(last)) {
      labels.push(`${name(first)} – ${name(last)} ${year(last)}`);
    } else {
      labels.push(`${name(first)} ${year(first)} – ${name(last)} ${year(last)}`);
    }
    start = at;
  }
  return labels;
}
