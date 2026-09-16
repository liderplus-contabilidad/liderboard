/**
 * The month grid behind the app's calendar control (`components/ui/calendar.tsx`): which days,
 * in which cells. Pure, on ISO `yyyy-mm-dd` strings and through UTC on purpose, for the same reason
 * `lib/cash-flow/dates.ts` gives — `new Date("2026-03-01")` read in Ecuador is 28 February.
 *
 * The grid is Monday-first (the week as Ecuador prints it) and ALWAYS six rows, padded with the
 * neighbouring months, so the panel keeps one height while the reader pages through the year
 * instead of jumping between five and six rows.
 */
import { MONTHS_FULL_ES } from "@/lib/date";

export interface YearMonth {
  year: number;
  /** 0-based, January = 0 — `Date`'s own convention. */
  monthIndex: number;
}

export interface CalendarDay {
  iso: string;
  /** Day of the month, what the cell prints. */
  day: number;
  /** `false` for the padding days of the previous and next month. */
  inMonth: boolean;
}

const MS_PER_DAY = 86_400_000;
const WEEKS_PER_GRID = 6;
const DAYS_PER_WEEK = 7;

/** Weekday initials, Monday-first, as the grid's header row prints them. */
export const WEEKDAYS_SHORT_ES = ["L", "M", "X", "J", "V", "S", "D"] as const;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function fromUTC(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** Today, in the reader's LOCAL calendar — what a date control defaults to and rings. */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function monthOf(iso: string): YearMonth {
  const [year, month] = iso.split("-").map(Number);
  return { year, monthIndex: month - 1 };
}

export function shiftMonth({ year, monthIndex }: YearMonth, by: number): YearMonth {
  const total = year * 12 + monthIndex + by;
  return { year: Math.floor(total / 12), monthIndex: ((total % 12) + 12) % 12 };
}

export function monthTitle({ year, monthIndex }: YearMonth): string {
  return `${MONTHS_FULL_ES[monthIndex]} ${year}`;
}

/** Six weeks of seven days, Monday-first, around the given month. */
export function monthGrid({ year, monthIndex }: YearMonth): CalendarDay[][] {
  const first = Date.UTC(year, monthIndex, 1);
  // `getUTCDay` is Sunday = 0; the grid wants Monday in the first column.
  const offset = (new Date(first).getUTCDay() + 6) % 7;
  const start = first - offset * MS_PER_DAY;

  return Array.from({ length: WEEKS_PER_GRID }, (_, week) =>
    Array.from({ length: DAYS_PER_WEEK }, (_, weekday) => {
      const date = new Date(start + (week * DAYS_PER_WEEK + weekday) * MS_PER_DAY);
      return {
        iso: fromUTC(date),
        day: date.getUTCDate(),
        inMonth: date.getUTCMonth() === monthIndex,
      };
    }),
  );
}
