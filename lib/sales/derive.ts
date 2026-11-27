/**
 * From the invoice lines to what the screen reads: the breakdowns by INSURER, SERVICE TYPE,
 * ARTICLE and SALESPERSON, the month axis, and the types opened into their articles.
 *
 * No view walks loose lines: every reading aggregates here first, so there is one definition of
 * each figure. Everything is measured on the NETO.
 */
import type { SalesCoverage, SalesLine, SalesMonth } from "./types";

/** A period's close: the figures that head the screen. */
export interface SalesTotals {
  amount: number;
  /** Invoice LINES, not invoices: the invoice number is not stored. */
  lineCount: number;
  insurerCount: number;
  /** Sales ÷ lines. `null` with no line at all, never `0`: dividing by zero does not give zero. */
  averageLine: number | null;
}

/** One row of a breakdown. `id` is the identity it was grouped by, `label` what is drawn. */
export interface SalesGroup {
  id: string;
  label: string;
  amount: number;
  lineCount: number;
}

/** A month of the year's axis. `amount: null` is a month that was NEVER loaded. */
export interface MonthPoint {
  monthIndex: number;
  amount: number | null;
}

/** A service type with its own complete article ranking, largest first. */
export interface TypeBreakdown extends SalesGroup {
  articles: SalesGroup[];
}

/** A period's sales, already aggregated by its four axes. */
export interface SalesReading {
  totals: SalesTotals;
  insurers: SalesGroup[];
  types: SalesGroup[];
  /** The same types, in the same order, each with its articles inside. */
  typeArticles: TypeBreakdown[];
  articles: SalesGroup[];
  vendors: SalesGroup[];
  /** How much of this period's NETO carries no salesperson at all. See `unattributed`. */
  unattributed: UnattributedVendor;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * An article's label: its NAME. The code stays the identity —the source system truncates names, so
 * several codes share one— and joins the label only where two names collide (`disambiguate`).
 */
export function articleLabel(code: string, name: string): string {
  return name === "" ? code : name;
}

function withCode(label: string, code: string): string {
  return code === "" ? label : `${label} · ${code}`;
}

/** Appends the code to the groups whose label another group of the SAME set also carries. */
function disambiguate(groups: SalesGroup[]): SalesGroup[] {
  const seen = new Map<string, number>();
  for (const group of groups) {
    seen.set(group.label, (seen.get(group.label) ?? 0) + 1);
  }
  if ([...seen.values()].every((count) => count === 1)) {
    return groups;
  }
  return groups.map((group) =>
    (seen.get(group.label) ?? 0) > 1 ? { ...group, label: withCode(group.label, group.id) } : group,
  );
}

/** Groups the lines by one key, largest first. The first line declaring a key sets its label. */
function groupBy(
  lines: readonly SalesLine[],
  key: (line: SalesLine) => string,
  label: (line: SalesLine) => string,
): SalesGroup[] {
  const totals = new Map<string, SalesGroup>();
  for (const line of lines) {
    const id = key(line);
    const existing = totals.get(id);
    if (existing) {
      existing.amount += line.amount;
      existing.lineCount += 1;
      continue;
    }
    totals.set(id, { id, label: label(line), amount: line.amount, lineCount: 1 });
  }
  return [...totals.values()].sort(byAmountDesc);
}

function byAmountDesc(a: SalesGroup, b: SalesGroup): number {
  return b.amount - a.amount || a.label.localeCompare(b.label, "es");
}

export function salesTotals(lines: readonly SalesLine[]): SalesTotals {
  const amount = sum(lines.map((line) => line.amount));
  const insurers = new Set(lines.map((line) => line.seguro));
  return {
    amount,
    lineCount: lines.length,
    insurerCount: insurers.size,
    averageLine: lines.length === 0 ? null : amount / lines.length,
  };
}

/** By insurer. `SEGURO` is never empty, so there is no «unidentified» group. */
export function byInsurer(lines: readonly SalesLine[]): SalesGroup[] {
  return groupBy(
    lines,
    (line) => line.seguro,
    (line) => line.seguro,
  );
}

/** By service type — a name; the report declares no code. */
export function byType(lines: readonly SalesLine[]): SalesGroup[] {
  return groupBy(
    lines,
    (line) => line.tipo,
    (line) => line.tipo,
  );
}

/** By article: identity is the CODE. See `articleLabel`. */
export function byArticle(lines: readonly SalesLine[]): SalesGroup[] {
  return disambiguate(
    groupBy(
      lines,
      (line) => line.articleCode,
      (line) => articleLabel(line.articleCode, line.articleName),
    ),
  );
}

/**
 * Each type with its articles inside, in `byType`'s order. An article under two types appears
 * under each with its own part, and names are disambiguated per type.
 */
export function articlesByType(lines: readonly SalesLine[]): TypeBreakdown[] {
  const buckets = new Map<string, SalesLine[]>();
  for (const line of lines) {
    const bucket = buckets.get(line.tipo);
    if (bucket) {
      bucket.push(line);
    } else {
      buckets.set(line.tipo, [line]);
    }
  }
  return byType(lines).map((type) => ({
    ...type,
    articles: byArticle(buckets.get(type.id) ?? []),
  }));
}

/** By salesperson, EXCLUDING the lines that declare none — those are reported by
 *  `unattributed` instead of being drawn as the ranking's largest bar. */
export function byVendor(lines: readonly SalesLine[]): SalesGroup[] {
  return groupBy(
    lines.filter((line) => line.vendor !== ""),
    (line) => line.vendor,
    (line) => line.vendor,
  );
}

/**
 * How much of a period carries NO salesperson — on the real file, over half of the net. One
 * definition, read by the card's note and the report. `share` is `null` when nothing was sold.
 */
export interface UnattributedVendor {
  amount: number;
  lineCount: number;
  share: number | null;
}

export function unattributed(lines: readonly SalesLine[]): UnattributedVendor {
  const without = lines.filter((line) => line.vendor === "");
  const amount = sum(without.map((line) => line.amount));
  return {
    amount,
    lineCount: without.length,
    share: shareOf(amount, sum(lines.map((line) => line.amount))),
  };
}

export function readSales(lines: readonly SalesLine[]): SalesReading {
  return {
    totals: salesTotals(lines),
    insurers: byInsurer(lines),
    types: byType(lines),
    typeArticles: articlesByType(lines),
    articles: byArticle(lines),
    vendors: byVendor(lines),
    unattributed: unattributed(lines),
  };
}

/**
 * The twelve months of the year. A month never loaded is `null`, a loaded month with no sales is
 * `0`; which is which comes from the COVERAGE, so a month filtered down to nothing stays a zero.
 */
export function monthlySeries(
  months: readonly SalesMonth[],
  coverage: readonly SalesCoverage[],
  year: number,
): MonthPoint[] {
  const loaded = new Set(coverage.filter((row) => row.year === year).map((row) => row.monthIndex));
  const amounts = new Map<number, number>();
  for (const month of months) {
    if (month.year !== year) {
      continue;
    }
    amounts.set(
      month.monthIndex,
      (amounts.get(month.monthIndex) ?? 0) + sum(month.lines.map((line) => line.amount)),
    );
  }
  return Array.from({ length: 12 }, (_unused, monthIndex) => ({
    monthIndex,
    amount: loaded.has(monthIndex) ? (amounts.get(monthIndex) ?? 0) : null,
  }));
}

/** A service type's twelve months — what one segment of the stacked evolution draws. */
export interface TypeMonthSeries {
  id: string;
  label: string;
  points: MonthPoint[];
}

/** The same axis opened by service type, in `byType`'s order and under the same coverage rule. */
export function monthlyTypeSeries(
  months: readonly SalesMonth[],
  coverage: readonly SalesCoverage[],
  year: number,
): TypeMonthSeries[] {
  const covered = new Set(coverage.filter((row) => row.year === year).map((row) => row.monthIndex));
  const ofYear = months.filter((month) => month.year === year);
  const amounts = new Map<string, Map<number, number>>();
  for (const month of ofYear) {
    for (const line of month.lines) {
      const perMonth = amounts.get(line.tipo) ?? new Map<number, number>();
      perMonth.set(month.monthIndex, (perMonth.get(month.monthIndex) ?? 0) + line.amount);
      amounts.set(line.tipo, perMonth);
    }
  }
  return byType(ofYear.flatMap((month) => month.lines)).map((type) => ({
    id: type.id,
    label: type.label,
    points: Array.from({ length: 12 }, (_unused, monthIndex) => ({
      monthIndex,
      amount: covered.has(monthIndex) ? (amounts.get(type.id)?.get(monthIndex) ?? 0) : null,
    })),
  }));
}

/** The years the client has loaded, ascending — read from the COVERAGE, without touching a line. */
export function loadedYears(coverage: readonly SalesCoverage[]): number[] {
  return [...new Set(coverage.map((row) => row.year))].sort((a, b) => a - b);
}

/** The loaded months of the given years — their UNION. */
export function loadedMonths(
  coverage: readonly SalesCoverage[],
  years: readonly number[],
): number[] {
  const wanted = new Set(years);
  return [
    ...new Set(coverage.filter((row) => wanted.has(row.year)).map((row) => row.monthIndex)),
  ].sort((a, b) => a - b);
}

/** «What part of the total this is» — the module's one definition. A total of `0` gives `null`,
 *  never `0 %`. */
export function shareOf(amount: number, total: number): number | null {
  return total === 0 ? null : (amount / total) * 100;
}
