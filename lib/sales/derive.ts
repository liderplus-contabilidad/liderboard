/**
 * From the invoice lines to the three aggregations the screen reads: by SERVICE, by PAYER and by
 * MONTH.
 *
 * **No view walks loose lines.** A month brings ~2,800 and a year ~33,000, so everything that is
 * drawn goes through here first; a card that filtered the raw list would be a second definition of
 * «how much this service sold», capable of drifting from this one with no figure giving it away.
 *
 * Pure and tested, like the rest of `lib/`: these are the rules that can be wrong —what is summed,
 * what is ordered and what is a gap as against a zero—, and none of them needs a browser.
 */
import { classifyPayer, payerLabel, type PayerKind } from "./payer";
import type { SalesLine, SalesMonth } from "./types";

/** A period's close: the four figures that head the screen. */
export interface SalesTotals {
  amount: number;
  /** How many invoice LINES, not how many invoices: the report does not bring the invoice number. */
  lineCount: number;
  payerCount: number;
  /** Sales ÷ lines. `null` with no line at all, never `0`: dividing by zero does not give zero. */
  averageTicket: number | null;
}

export interface ServiceTotal {
  /** The report's verbatim code (`\01`) — the series' stable identity. */
  code: string;
  name: string;
  amount: number;
  quantity: number;
}

export interface PayerTotal {
  /** The raw name, normalized only in whitespace: the key it was grouped by. */
  id: string;
  /** What is WRITTEN. A person never reaches here with their name. */
  label: string;
  kind: PayerKind;
  amount: number;
  lineCount: number;
}

/** A month of the year's axis. `amount: null` is a month that was NEVER loaded. */
export interface MonthPoint {
  monthIndex: number;
  amount: number | null;
}

/** A period's sales, already aggregated by its three axes. */
export interface SalesReading {
  totals: SalesTotals;
  services: ServiceTotal[];
  payers: PayerTotal[];
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Inner whitespace collapsed and the ends trimmed: it is the only thing touched of a name that
 *  afterwards has to be checkable against the file. */
function payerKey(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function salesTotals(lines: readonly SalesLine[]): SalesTotals {
  const amount = sum(lines.map((line) => line.amount));
  const payers = new Set(lines.map((line) => payerKey(line.payer)));
  return {
    amount,
    lineCount: lines.length,
    payerCount: payers.size,
    averageTicket: lines.length === 0 ? null : amount / lines.length,
  };
}

/**
 * By service, largest to smallest. The name is set by the FIRST line that declares that code: the
 * report repeats it on every row, and if two rows disagreed what leads is the code, which is what the
 * accounting system indexes.
 */
export function byService(lines: readonly SalesLine[]): ServiceTotal[] {
  const totals = new Map<string, ServiceTotal>();
  for (const line of lines) {
    const existing = totals.get(line.serviceCode);
    if (existing) {
      existing.amount += line.amount;
      existing.quantity += line.quantity;
      continue;
    }
    totals.set(line.serviceCode, {
      code: line.serviceCode,
      name: line.serviceName,
      amount: line.amount,
      quantity: line.quantity,
    });
  }
  return [...totals.values()].sort(byAmountDesc);
}

/**
 * By payer, largest to smallest — and with the individuals' ORDINAL assigned over THAT order, which is
 * what makes «Particular · 1» always the largest of them and not the first the file wrote. The ordinal
 * counts only among individuals: with the companies inside, the numbering would skip gaps and would
 * look as though rows were missing.
 */
export function byPayer(lines: readonly SalesLine[]): PayerTotal[] {
  const totals = new Map<
    string,
    { id: string; kind: PayerKind; amount: number; lineCount: number }
  >();
  for (const line of lines) {
    const id = payerKey(line.payer);
    const existing = totals.get(id);
    if (existing) {
      existing.amount += line.amount;
      existing.lineCount += 1;
      continue;
    }
    totals.set(id, { id, kind: classifyPayer(id), amount: line.amount, lineCount: 1 });
  }
  const ranked = [...totals.values()].sort(byAmountDesc);
  let particulars = 0;
  return ranked.map((entry) => {
    const ordinal = entry.kind === "particular" ? ++particulars : 0;
    return { ...entry, label: payerLabel(entry.id, entry.kind, ordinal) };
  });
}

function byAmountDesc(a: { amount: number }, b: { amount: number }): number {
  return b.amount - a.amount;
}

export function readSales(lines: readonly SalesLine[]): SalesReading {
  return { totals: salesTotals(lines), services: byService(lines), payers: byPayer(lines) };
}

/**
 * The TWELVE months of the year, always — an axis of the exercise and not of what arrived.
 *
 * A month that was never loaded is worth `null` and NOT `0`, which is the distinction the whole module
 * rests on: a zero claims nothing was sold, and only a file that arrived can say that. A loaded month
 * whose lines add up to zero is a zero, and it is drawn as such.
 */
export function monthlySeries(months: readonly SalesMonth[], year: number): MonthPoint[] {
  const loaded = new Map<number, number>();
  for (const month of months) {
    if (month.year === year) {
      loaded.set(month.monthIndex, sum(month.lines.map((line) => line.amount)));
    }
  }
  return Array.from({ length: 12 }, (_unused, monthIndex) => ({
    monthIndex,
    amount: loaded.has(monthIndex) ? (loaded.get(monthIndex) as number) : null,
  }));
}

/** The years the client has loaded, ascending. */
export function loadedYears(months: readonly SalesMonth[]): number[] {
  return [...new Set(months.map((month) => month.year))].sort((a, b) => a - b);
}

/** A year's loaded months, ascending — the declared coverage. */
export function loadedMonths(months: readonly SalesMonth[], year: number): number[] {
  return months
    .filter((month) => month.year === year)
    .map((month) => month.monthIndex)
    .sort((a, b) => a - b);
}

/**
 * «What part of the total this is», and the module's ONLY definition: the breakdown by service, the
 * concentration by payer and the notes that square them share it, so a bar and its row cannot say
 * different percentages.
 *
 * A total at `0` gives `null` and NEVER `0 %`: selling nothing does not mean a service is 0 % of what
 * was sold, it means the question has no answer.
 */
export function shareOf(amount: number, total: number): number | null {
  return total === 0 ? null : (amount / total) * 100;
}
