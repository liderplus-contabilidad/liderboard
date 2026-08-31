/**
 * The engine of «Análisis costo personal»: twenty-one rows, three group subtotals, two section
 * subtotals, one grand total, and the three levels of «% vs ventas» the workbook computes in its
 * columns Q, R and S. **Nothing here is stored** — every figure is recomputed from PyG on each render.
 *
 * **Four rules live here, and they are the ones the source workbook cannot express.**
 *
 * **(a) `null` ≠ `0`, and two different absences collapse into the same value.** A month outside the
 * workspace's declared coverage reads `null`; so does an account this client's plan does not have.
 * That the two collapse is the point: everything downstream —sums, totals, percentages, «ocultar filas
 * en cero»— already knows `null` does not participate, so neither absence needs a second mechanism or
 * a flag travelling beside the data. A loaded month where a concept moved nothing is a real `0` and
 * stays tellable apart from both.
 *
 * **(b) The sign is NOT applied, and that is deliberate.** MicroPlus keeps expenses negative and the
 * upload strategy already negates branch 5 at import, so what `valuesByCode` answers for
 * `5.2.04.01.01` is a positive cost. Applying `rootSign` here would be an operation that does nothing
 * while looking like it does something — `lib/revenue/`'s same note about the raíz 4.
 *
 * **(c) A group's month is `null` only when EVERY row under it is.** Otherwise it sums what is there.
 * Without this a group whose plan is missing one of nine accounts would report nothing for the other
 * eight, and the reader would read a hole where there is a figure.
 *
 * **(d) The percentage divides by the ventas OF THE SAME SPAN.** The workbook divides every row of
 * 2026 by a `VENTAS` cell that covers six months while the TOTAL row of 2021 covers twelve, and then
 * puts the two percentages in one column. Here the denominator is always the raíz 4 summed over
 * exactly the months the numerator was summed over, which is what makes «27 %» and «50 %» comparable
 * at all.
 */
import {
  conceptsOfGroup,
  groupsOfSection,
  PERSONNEL_ACCOUNT_CODES,
  PERSONNEL_GROUPS,
  PERSONNEL_SECTIONS,
  type PersonnelConcept,
  type PersonnelGroup,
  type PersonnelSection,
} from "./accounts";
import { MONTHS_IN_YEAR, type PersonnelCostYearInput } from "./types";

/** What every level of the reading answers, so a row, a group, a section and the total read alike. */
export interface PersonnelAmounts {
  /** Twelve slots, already narrowed to the span: outside it a month reads `null`. */
  monthly: (number | null)[];
  /** The sum over the span. */
  total: number;
  /** `total` as a percentage of the span's ventas; `null` when the span invoiced nothing. */
  share: number | null;
  /** Whether anything under it is a figure other than zero — what «Ocultar filas en cero» reads. */
  moves: boolean;
}

export interface PersonnelRowReading extends PersonnelAmounts {
  concept: PersonnelConcept;
  /** The account behind the row, or `null` for the captured one. */
  code: string | null;
  /** Whether that account is absent from this client's plan — what the card's note counts. */
  missing: boolean;
}

export interface PersonnelGroupReading extends PersonnelAmounts {
  group: PersonnelGroup;
  rows: PersonnelRowReading[];
}

export interface PersonnelSectionReading extends PersonnelAmounts {
  section: PersonnelSection;
}

/** One year's whole reading, already narrowed to the span. */
export interface PersonnelYearReading extends PersonnelAmounts {
  year: number;
  /** The months of the span this year actually covers, ascending — its own coverage inside it. */
  months: number[];
  groups: PersonnelGroupReading[];
  sections: PersonnelSectionReading[];
  /** The raíz 4 over the span — the denominator every `share` above divided by. */
  revenue: number;
  /** The raíz 4 month by month, for the cards that plot it. */
  revenueMonthly: (number | null)[];
  /** Codes the map asks for that this plan does not have, in the map's order. */
  missingCodes: string[];
  /** Whether the year has anything to say at all — what decides if it is drawn. */
  covered: boolean;
}

/** Every marked year's reading plus the figures that span all of them — what the tiles read. */
export interface PersonnelCostReading {
  years: PersonnelYearReading[];
  /** Summed across every marked year: what «Costo de personal» and «% vs ventas» say. */
  total: number;
  revenue: number;
  share: number | null;
  /** By section, summed across every marked year — «Planta» and «Externos». */
  sections: { section: PersonnelSection; total: number; share: number | null }[];
}

function emptySeries(): (number | null)[] {
  return Array.from({ length: MONTHS_IN_YEAR }, () => null);
}

/**
 * The one definition of a share in this module: percentage POINTS, never a fraction, because that is
 * the unit `formatPercent` writes. `null` when there is no denominator — a zero would claim the cost
 * was nothing, when what happened is that nothing was invoiced.
 */
export function shareOf(amount: number, revenue: number): number | null {
  return revenue === 0 ? null : (amount / revenue) * 100;
}

/** The sum over the loaded slots. A `null` contributes nothing — it is not a zero. */
export function sumOf(series: readonly (number | null)[]): number {
  return series.reduce<number>((total, value) => total + (value ?? 0), 0);
}

/**
 * Rule (c): `null` only where EVERY input is `null`; otherwise the sum of what is there.
 */
function addSeries(parts: readonly (number | null)[][]): (number | null)[] {
  return Array.from({ length: MONTHS_IN_YEAR }, (_, month) => {
    let sum = 0;
    let present = false;
    for (const part of parts) {
      const value = part[month];
      if (value !== null && value !== undefined) {
        sum += value;
        present = true;
      }
    }
    return present ? sum : null;
  });
}

/** A raw twelve-slot series narrowed to a set of months: outside it, `null`. */
function scopeTo(
  values: readonly number[] | undefined,
  months: ReadonlySet<number>,
): (number | null)[] {
  if (!values) {
    return emptySeries();
  }
  return Array.from({ length: MONTHS_IN_YEAR }, (_, month) =>
    months.has(month) ? (values[month] ?? 0) : null,
  );
}

/**
 * A concept's twelve figures. The three shapes of `ConceptSource` are answered here and nowhere else,
 * which is what keeps «la familia sale de una fila y entra en la otra» a single statement.
 */
function seriesForConcept(
  concept: PersonnelConcept,
  input: PersonnelCostYearInput,
  months: ReadonlySet<number>,
): { monthly: (number | null)[]; missing: boolean } {
  if (concept.source.kind === "captured") {
    // Outside coverage it reads `null` even if something was captured there: the figure only means
    // something beside the account it is carved out of, and that account has no month there.
    return {
      monthly: Array.from({ length: MONTHS_IN_YEAR }, (_, month) =>
        months.has(month) ? (input.family[month] ?? null) : null,
      ),
      missing: false,
    };
  }

  const values = input.accounts.get(concept.source.code);
  if (!values) {
    // Rule (a): an account the plan does not have reads exactly like a month never loaded.
    return { monthly: emptySeries(), missing: true };
  }

  const scoped = scopeTo(values, months);
  if (concept.source.kind === "account") {
    return { monthly: scoped, missing: false };
  }

  // `account-less-captured`: what is left of administrative payroll once the family's part is out.
  // An uncaptured month subtracts nothing, so the row shows the account WHOLE — which is the honest
  // reading of «nobody has said how much of this is the family's».
  return {
    monthly: scoped.map((value, month) =>
      value === null ? null : value - (input.family[month] ?? 0),
    ),
    missing: false,
  };
}

function amountsOf(monthly: (number | null)[], revenue: number): PersonnelAmounts {
  const total = sumOf(monthly);
  return {
    monthly,
    total,
    share: shareOf(total, revenue),
    moves: monthly.some((value) => value !== null && value !== 0),
  };
}

/**
 * ONE year, narrowed to the span. `months` is the selection; what this year actually reads is the
 * intersection with its own declared coverage, which is what lets a marked month only one of two
 * years loaded still be marked without inventing a figure for the other.
 */
export function readPersonnelYear(
  input: PersonnelCostYearInput,
  months: readonly number[],
): PersonnelYearReading {
  const covered = new Set(input.coverage);
  const inSpan = new Set([...months].filter((month) => covered.has(month)));

  const revenueMonthly = scopeTo(input.revenue, inSpan);
  const revenue = sumOf(revenueMonthly);

  const groups: PersonnelGroupReading[] = PERSONNEL_GROUPS.map((group) => {
    const rows: PersonnelRowReading[] = conceptsOfGroup(group.id).map((concept) => {
      const { monthly, missing } = seriesForConcept(concept, input, inSpan);
      return {
        concept,
        code: concept.source.kind === "captured" ? null : concept.source.code,
        missing,
        ...amountsOf(monthly, revenue),
      };
    });
    return {
      group,
      rows,
      ...amountsOf(addSeries(rows.map((row) => row.monthly)), revenue),
    };
  });

  const sections: PersonnelSectionReading[] = PERSONNEL_SECTIONS.map((section) => {
    const ids = new Set(groupsOfSection(section.id).map((group) => group.id));
    const parts = groups.filter((entry) => ids.has(entry.group.id)).map((entry) => entry.monthly);
    return { section, ...amountsOf(addSeries(parts), revenue) };
  });

  const grand = amountsOf(addSeries(groups.map((group) => group.monthly)), revenue);

  return {
    year: input.year,
    months: [...inSpan].sort((a, b) => a - b),
    groups,
    sections,
    revenue,
    revenueMonthly,
    missingCodes: PERSONNEL_ACCOUNT_CODES.filter((code) => !input.accounts.has(code)),
    covered: inSpan.size > 0,
    ...grand,
  };
}

/**
 * Every marked year, ascending, plus the figures that span all of them.
 *
 * The cross-year totals are SUMS of each year's own span — never a percentage of percentages: two
 * years with different ventas cannot have their shares averaged, and the workbook's own TOTAL row is
 * exactly that mistake.
 */
export function readPersonnelCost(
  inputs: readonly PersonnelCostYearInput[],
  months: readonly number[],
): PersonnelCostReading {
  const years = [...inputs]
    .sort((a, b) => a.year - b.year)
    .map((input) => readPersonnelYear(input, months));

  const total = years.reduce((sum, year) => sum + year.total, 0);
  const revenue = years.reduce((sum, year) => sum + year.revenue, 0);

  return {
    years,
    total,
    revenue,
    share: shareOf(total, revenue),
    sections: PERSONNEL_SECTIONS.map((section) => {
      const sectionTotal = years.reduce(
        (sum, year) =>
          sum + (year.sections.find((entry) => entry.section.id === section.id)?.total ?? 0),
        0,
      );
      return { section, total: sectionTotal, share: shareOf(sectionTotal, revenue) };
    }),
  };
}
