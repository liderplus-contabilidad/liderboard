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
import { payerLabel } from "./payer";
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
  /** The raw name, normalized only in whitespace: the key it was grouped by. Empty when none. */
  id: string;
  /** What is WRITTEN — the file's own name, or the group for the ones it leaves blank. */
  label: string;
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
 * By payer, largest to smallest, each one under the name the report gives it.
 *
 * The lines the report leaves with NO payer group themselves: `payerKey` reduces every one of them to
 * the same empty key, so they arrive as a single row that `payerLabel` names. There is no branch for
 * it here on purpose — a special case would be a second place able to decide what counts as «no
 * payer», and it would drift from the first.
 */
export function byPayer(lines: readonly SalesLine[]): PayerTotal[] {
  const totals = new Map<string, PayerTotal>();
  for (const line of lines) {
    const id = payerKey(line.payer);
    const existing = totals.get(id);
    if (existing) {
      existing.amount += line.amount;
      existing.lineCount += 1;
      continue;
    }
    totals.set(id, { id, label: payerLabel(id), amount: line.amount, lineCount: 1 });
  }
  return [...totals.values()].sort(byAmountDesc);
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
 *
 * `codes` NARROWS to those services, and an empty list is «all of them» and not «none» — the meaning a
 * mark with nothing marked has everywhere in the app. Narrowing does not touch the coverage rule: a
 * loaded month where the marked service did not sell is a real `0`, and only an absent month is `null`.
 */
export function monthlySeries(
  months: readonly SalesMonth[],
  year: number,
  codes: readonly string[] = [],
): MonthPoint[] {
  const loaded = new Map<number, number>();
  for (const month of months) {
    if (month.year === year) {
      loaded.set(month.monthIndex, sum(narrow(month.lines, codes).map((line) => line.amount)));
    }
  }
  return Array.from({ length: 12 }, (_unused, monthIndex) => ({
    monthIndex,
    amount: loaded.has(monthIndex) ? (loaded.get(monthIndex) as number) : null,
  }));
}

/** A service's twelve months — what one segment of the stacked evolution draws. */
export interface ServiceMonthSeries {
  code: string;
  name: string;
  points: MonthPoint[];
}

/**
 * The same axis, opened up BY SERVICE: what each month is made of.
 *
 * The order is the year's, largest to smallest, and it comes out of `byService` rather than from a
 * second sort of its own — the breakdown card orders by the same rule, and two orders that can drift
 * would paint one service two colours on the same screen.
 *
 * The coverage rule survives the opening up, and that is the only thing here that can be wrong: an
 * absent month is `null` in EVERY service —nobody said anything about that month—, while a loaded
 * month a service did not touch is a `0`, because the file did arrive and it did not bring it. A
 * service the year does not declare produces no series at all, instead of twelve empty columns.
 */
export function monthlyServiceSeries(
  months: readonly SalesMonth[],
  year: number,
  codes: readonly string[] = [],
): ServiceMonthSeries[] {
  const ofYear = months.filter((month) => month.year === year);
  const covered = new Set(ofYear.map((month) => month.monthIndex));
  const amounts = new Map<string, Map<number, number>>();
  for (const month of ofYear) {
    for (const line of narrow(month.lines, codes)) {
      const perMonth = amounts.get(line.serviceCode) ?? new Map<number, number>();
      perMonth.set(month.monthIndex, (perMonth.get(month.monthIndex) ?? 0) + line.amount);
      amounts.set(line.serviceCode, perMonth);
    }
  }
  return byService(ofYear.flatMap((month) => narrow(month.lines, codes))).map((service) => ({
    code: service.code,
    name: service.name,
    points: Array.from({ length: 12 }, (_unused, monthIndex) => ({
      monthIndex,
      amount: covered.has(monthIndex) ? (amounts.get(service.code)?.get(monthIndex) ?? 0) : null,
    })),
  }));
}

/** The lines of the marked services. No marks is ALL of them, never none. */
function narrow(lines: readonly SalesLine[], codes: readonly string[]): SalesLine[] {
  if (codes.length === 0) {
    return [...lines];
  }
  const wanted = new Set(codes);
  return lines.filter((line) => wanted.has(line.serviceCode));
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
