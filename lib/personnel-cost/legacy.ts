/**
 * **The SIMPLE shape a past exercise has**, and the whole reason this file exists: what the firm kept
 * before MicroPlus is four lines and twelve months, and there is no estado de resultados behind it.
 *
 * The module's own shape —twenty-one concepts under three groups under two sections— is derived from a
 * chart of accounts. A year that predates it has no chart of accounts to derive anything from: it is a
 * sheet somebody typed, and its four lines are exactly what was written there. Projecting them onto
 * the three groups would be INVENTING a detail the paper never carried, which is the one thing the
 * whole module is careful not to do — so a legacy row declares its SECTION and stops there.
 *
 * That is also why these are not `PersonnelConcept`s with a missing field: a concept is a rollup of an
 * account and carries the code it came from; these carry nothing, because nothing produced them but a
 * person typing. Two shapes, each honest about what it knows.
 *
 * **The VENTAS of such a year are NOT stored here**, and that is the point of this note. «% vs ventas»
 * needs a denominator and a typed exercise has no estado de resultados to take it from — but the app
 * already has one place where the ventas of a year with no estado de resultados are written, and it is
 * «Reportería de ingresos». Storing them again here would be a second answer to «cuánto se vendió en
 * marzo de 2019», and nothing downstream could say which of the two is right. The provider resolves
 * the chain —raíz 4 where there is one, Ingresos where there is not— and hands the result in through
 * `PersonnelCostYearInput.revenue`, exactly the field a loaded year fills.
 *
 * **What a legacy year gives up, stated plainly:** it has no groups, so «Grupo» has nothing to narrow
 * and the Evolución compares its SECTIONS instead. And a month nobody has written ventas for anywhere
 * divides by nothing, so its percentage reads `null` — never `0`, which would claim the firm invoiced
 * nothing when what happened is that nobody wrote it down.
 */
import type { PersonnelSectionId } from "./accounts";
import { MONTHS_IN_YEAR } from "./types";

export type PersonnelLegacyRowId =
  | "afiliado-personal"
  | "afiliado-familia"
  | "factura-familia"
  | "externos";

export interface PersonnelLegacyRow {
  id: PersonnelLegacyRowId;
  /** As the old sheet writes it. */
  label: string;
  /** Which of the two sections it adds into — the ONE thing the old shape does say. */
  section: PersonnelSectionId;
}

/**
 * The four COST lines, in the order the sheet writes them. Three roll into «Planta» and one is
 * «Externos», which is the whole of the structure a legacy year has.
 *
 * Their order is a contract with the clipboard: a four-row block copied out of the old workbook and
 * pasted on the first line has to land on these four and nothing else.
 */
export const PERSONNEL_LEGACY_COST_ROWS: readonly PersonnelLegacyRow[] = [
  { id: "afiliado-personal", label: "Afiliado personal", section: "planta" },
  { id: "afiliado-familia", label: "Afiliado familia", section: "planta" },
  { id: "factura-familia", label: "Factura familia", section: "planta" },
  { id: "externos", label: "Externos", section: "externos" },
];

/** One month of a legacy year: the four lines, `null` where nothing was written. */
export type PersonnelLegacyAmounts = Readonly<Record<PersonnelLegacyRowId, number | null>>;

/** A legacy year as the pure layer reads it: one twelve-slot series per line. */
export type PersonnelLegacySeries = Readonly<Record<PersonnelLegacyRowId, (number | null)[]>>;

/** A month with nothing written in any of its four lines. */
export const EMPTY_LEGACY_AMOUNTS: PersonnelLegacyAmounts = {
  "afiliado-personal": null,
  "afiliado-familia": null,
  "factura-familia": null,
  externos: null,
};

/** Empty series — the shape a year with nothing typed takes. */
export function emptyLegacySeries(): PersonnelLegacySeries {
  return {
    "afiliado-personal": emptyMonths(),
    "afiliado-familia": emptyMonths(),
    "factura-familia": emptyMonths(),
    externos: emptyMonths(),
  };
}

function emptyMonths(): (number | null)[] {
  return Array.from({ length: MONTHS_IN_YEAR }, () => null);
}

/**
 * Whether a month says ANYTHING — which is what makes it part of the year's coverage.
 *
 * A legacy year has no `loadedMonthsByYear` to declare its coverage, so coverage is what was TYPED:
 * a month with a figure in any of the four lines is loaded, and one left blank never happened. It is
 * the one place in the app where coverage is inferred from the values, and it is sound here for the
 * reason it is not sound in PyG — there a loaded month can legitimately be all zeros because a file
 * declared it, and here nothing declares anything but the typing itself.
 */
export function legacyMonthHasData(amounts: PersonnelLegacyAmounts): boolean {
  return PERSONNEL_LEGACY_COST_ROWS.some((row) => amounts[row.id] !== null);
}

/** The months of a legacy year that carry something, ascending. */
export function legacyCoverage(series: PersonnelLegacySeries): number[] {
  const months: number[] = [];
  for (let month = 0; month < MONTHS_IN_YEAR; month += 1) {
    if (PERSONNEL_LEGACY_COST_ROWS.some((row) => series[row.id][month] !== null)) {
      months.push(month);
    }
  }
  return months;
}

/** A section's twelve months: the sum of its lines, `null` only where EVERY one of them is. */
export function legacySectionSeries(
  series: PersonnelLegacySeries,
  section: PersonnelSectionId,
): (number | null)[] {
  const rows = PERSONNEL_LEGACY_COST_ROWS.filter((row) => row.section === section);
  return Array.from({ length: MONTHS_IN_YEAR }, (_, month) => {
    let sum = 0;
    let present = false;
    for (const row of rows) {
      const value = series[row.id][month];
      if (value !== null) {
        sum += value;
        present = true;
      }
    }
    return present ? sum : null;
  });
}
