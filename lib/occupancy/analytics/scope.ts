/**
 * WHICH days of WHICH months of WHICH years a period covers — the ONE answer to that question, read
 * by the series engine, by the reporte's totals, by the channel and weekday cards and by the
 * heatmap. Everything downstream works on the `PeriodCell[]` this returns and never re-reads the
 * period itself.
 *
 * Two modes ask two different things:
 *
 * - **Rango**: one continuous span. A total and an evolution mean something over it, and the months
 *   at its ends are PARTIAL — «del 20 de marzo al 10 de abril» is twelve days of marzo and ten of
 *   abril, never two whole months.
 * - **Comparar**: days and whole months of any year, each its OWN column — a month is one cell
 *   of all its days, not thirty columns. For «el 5 de enero de 2025 contra el 12 de marzo de 2026», and
 *   for «marzo contra julio».
 *
 * Every day is clipped to the month's REAL length, which is what makes 29 de febrero exist in a leap
 * year and not in the others.
 */
import { daysInMonth } from "../derive";
import type { DateRange, DateRef, OccupancyPeriod, PeriodCell, PeriodPick } from "./types";

/** Ends given in reverse are the same span: the reader picked them the other way round. */
export function orderedRange(range: DateRange): DateRange {
  return compareDates(range.from, range.to) <= 0 ? range : { from: range.to, to: range.from };
}

export function compareDates(a: DateRef, b: DateRef): number {
  return a.year - b.year || a.monthIndex - b.monthIndex || a.day - b.day;
}

/** The date as a comparable number, which is also how the day grids stay in order. */
function serial(date: DateRef): number {
  return date.year * 10000 + date.monthIndex * 100 + date.day;
}

/** Same day, whatever object it arrived in. */
export function sameDate(a: DateRef, b: DateRef): boolean {
  return serial(a) === serial(b);
}

function cellsOfRange(range: DateRange): PeriodCell[] {
  const { from, to } = orderedRange(range);
  const cells: PeriodCell[] = [];
  let year = from.year;
  let month = from.monthIndex;

  while (year < to.year || (year === to.year && month <= to.monthIndex)) {
    const length = daysInMonth(year, month);
    const start = year === from.year && month === from.monthIndex ? Math.max(0, from.day) : 0;
    const end =
      year === to.year && month === to.monthIndex ? Math.min(length - 1, to.day) : length - 1;
    if (end >= start) {
      cells.push({
        year,
        monthIndex: month,
        days: Array.from({ length: end - start + 1 }, (_, offset) => start + offset),
      });
    }
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return cells;
}

/** A pick's own date, so days and months sort together on one timeline. */
export function pickDate(pick: PeriodPick): DateRef {
  return { year: pick.year, monthIndex: pick.monthIndex, day: pick.kind === "dia" ? pick.day : 0 };
}

/** Its stable id: what makes «the same pick twice» one column instead of two identical ones. */
export function pickId(pick: PeriodPick): string {
  return pick.kind === "dia"
    ? `dia:${pick.year}-${pick.monthIndex}-${pick.day}`
    : `mes:${pick.year}-${pick.monthIndex}`;
}

/**
 * One cell per pick, in calendar order and deduplicated. A month becomes a cell of ALL its days — one
 * column, not thirty. A day the month does not hold is dropped rather than clamped: it was never a real
 * date, and moving it to the 28th would answer a question nobody asked.
 */
function cellsOfPicks(picks: readonly PeriodPick[]): PeriodCell[] {
  const seen = new Set<string>();
  return [...picks]
    .filter((pick) => {
      const length = daysInMonth(pick.year, pick.monthIndex);
      if (pick.kind === "dia" && (pick.day < 0 || pick.day >= length)) {
        return false;
      }
      const id = pickId(pick);
      if (seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    })
    .sort((a, b) => compareDates(pickDate(a), pickDate(b)))
    .map((pick) => ({
      year: pick.year,
      monthIndex: pick.monthIndex,
      days:
        pick.kind === "dia"
          ? [pick.day]
          : Array.from({ length: daysInMonth(pick.year, pick.monthIndex) }, (_, day) => day),
    }));
}

/** The period as cells. Empty means the period selects nothing at all. */
export function periodCells(period: OccupancyPeriod): PeriodCell[] {
  return period.mode === "rango" ? cellsOfRange(period.range) : cellsOfPicks(period.picks);
}

/** The years the period touches, ascending — which datasets have to be read at all. */
export function yearsInPeriod(period: OccupancyPeriod): number[] {
  return [...new Set(periodCells(period).map((cell) => cell.year))].sort((a, b) => a - b);
}

/** How many days the period covers in total: what tells a single day from a season. */
export function daysInPeriod(period: OccupancyPeriod): number {
  return periodCells(period).reduce((total, cell) => total + cell.days.length, 0);
}

/** Whether the cell covers its month end to end — a partial month must never read as the month. */
export function isWholeMonth(cell: PeriodCell): boolean {
  return cell.days.length === daysInMonth(cell.year, cell.monthIndex);
}
