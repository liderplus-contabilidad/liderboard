/**
 * The module's civil-date arithmetic, on ISO `yyyy-mm-dd` strings and never on `Date` objects
 * crossing a time zone: `new Date("2026-03-01")` is UTC midnight and, read in Ecuador, is 28
 * February — the shift `lib/date.ts`' `formatDayMonthYear` already guards against. Everything here
 * goes through UTC on purpose, so a day is a day.
 *
 * `toISODate` is the one reader of what an Excel cell says a date is: a serial (the check register),
 * `dd/mm/yyyy` (Contífico) or `dd-mm-yyyy` (Dingoo). It is `null` and never a guess when it cannot
 * read it.
 */
import type { Cell } from "@/lib/excel/workbook";

const MS_PER_DAY = 86_400_000;
/** Excel's day 0 is 1899-12-30 (its 1900 leap-year bug included). */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function fromUTC(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function toUTC(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Today, in the reader's LOCAL calendar — the cut date's default. */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUTC(to) - toUTC(from)) / MS_PER_DAY);
}

export function addDays(iso: string, days: number): string {
  return fromUTC(new Date(toUTC(iso) + days * MS_PER_DAY));
}

export function isISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toUTC(value));
}

/**
 * A cell → ISO date, or `null`. A two-digit year (`6/9/26`, which Excel wrote in some hand-edited
 * sheets) is read as 20yy; the order is ALWAYS day first, because every source of this module is
 * Ecuadorian.
 */
export function toISODate(cell: Cell): string | null {
  if (typeof cell === "number") {
    if (!Number.isFinite(cell) || cell <= 0) {
      return null;
    }
    return fromUTC(new Date(EXCEL_EPOCH_UTC + Math.floor(cell) * MS_PER_DAY));
  }
  const text = String(cell ?? "").trim();
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(text);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }
    const iso = `${year}-${pad2(month)}-${pad2(day)}`;
    return isISODate(iso) ? iso : null;
  }
  return isISODate(text) ? text : null;
}
