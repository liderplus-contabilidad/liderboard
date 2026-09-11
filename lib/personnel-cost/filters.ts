/**
 * The marks of the «Análisis costo personal» bar: **Año · Mes · Grupo**, and nothing else.
 *
 * There is no «Cuenta contable» and no «Centro de costo», and neither is an omission. The accounts are
 * not a choice —`accounts.ts` fixes exactly which twenty-one this reading is— and the reading is of the
 * COMPANY, like the workbook it replaces: MicroPlus has no cost centers to narrow by.
 *
 * **`years` follows «Ventas por servicio»' declared exception to the house rule**: with no mark it
 * resolves to the MOST RECENT year, never to all of them. The reason is the shape of this screen and
 * not a preference — Datos speaks in COLUMNS that carry their year, so six marked exercises are six
 * blocks of fourteen columns, and opening on that is opening on a table nobody can read. Marking more
 * is how the comparison is asked for.
 *
 * **The MONTH is independent of the year**: a mark of «Abr» narrows the axis of ALL the marked years
 * instead of picking one's April, which is what makes the comparison mean something.
 *
 * **The GROUP is a mark of the BAR and not a control in a card's header**, because it narrows the
 * whole screen at once: the grid, the four tiles and the four cards. A control read by every card
 * lives here, where it leaves a chip — the rule the app already holds up everywhere else.
 *
 * **The SECTION is the other axis of the same narrowing, not a second one.** Planta IS Afiliados +
 * No afiliados and Externos IS Honorarios médicos, so a section mark is a shorthand for its groups:
 * `groups` stays the ONE list the engine reads, and `sections` records that the marks were set by
 * section — which is what lets the bar lock the other column while one is in use, and the chips say
 * «Planta» instead of its two halves. `groupAxis` is the one answer to which column is in use.
 */
import { monthMarkLabel, periodLabel, scopedPeriodLabel, yearMarkLabel } from "@/lib/period";
import {
  PERSONNEL_GROUPS,
  PERSONNEL_SECTIONS,
  type PersonnelGroupId,
  type PersonnelSectionId,
} from "./accounts";

/**
 * The rótulos this module composes with. `yearMarkLabel` and `monthMarkLabel` are what the bar's
 * triggers read: with EVERY year or EVERY month of the universe marked they say «Todos los años» /
 * «Todos los meses» instead of enumerating, because a control that spells six exercises or twelve
 * abbreviations out is wider than the reading it describes and says no more than the word does.
 *
 * They are «Ventas por servicio»' definitions, and this module reads them rather than growing its
 * own: the year rule is the SAME declared exception —no mark resolves to the most recent, and
 * `sanitizeFilters` hands the bar the resolved list— so a second copy could only drift.
 */
export { monthMarkLabel, periodLabel, scopedPeriodLabel, yearMarkLabel };

export interface PersonnelCostFilters {
  /** Marked years, ascending. Empty resolves to the most recent on read, never to «all». */
  years: number[];
  /** Indices 0–11, in order. Empty = every LOADED month of the marked years. */
  months: number[];
  /**
   * Marked groups, in the map's order. Empty is ALL of them — the house rule. When `sections` is
   * marked this is DERIVED from it: the union of the sections' groups.
   */
  groups: PersonnelGroupId[];
  /** Marked sections, in the map's order. Empty when the marks were set by group (or not at all). */
  sections: PersonnelSectionId[];
}

/** What the client has, and what the marked years allow choosing. */
export interface PersonnelCostUniverse {
  /** Every year with declared coverage, ascending. */
  years: number[];
  /**
   * The months covered IN THE MARKED YEARS — the union and not the intersection: a month only one of
   * the years has is still a month that can be looked at, and the comparison will say the other one
   * is missing it.
   */
  months: number[];
}

/** The three groups are a constant of the map, so the universe never has to carry them. */
export const PERSONNEL_GROUP_IDS: readonly PersonnelGroupId[] = PERSONNEL_GROUPS.map(
  (group) => group.id,
);

export const PERSONNEL_SECTION_IDS: readonly PersonnelSectionId[] = PERSONNEL_SECTIONS.map(
  (section) => section.id,
);

export function emptyFilters(): PersonnelCostFilters {
  return { years: [], months: [], groups: [], sections: [] };
}

/** The groups a set of sections stands for, in the map's order. */
function groupsOfSections(sections: readonly PersonnelSectionId[]): PersonnelGroupId[] {
  const marked = new Set(sections);
  return PERSONNEL_GROUPS.filter((group) => marked.has(group.section)).map((group) => group.id);
}

/**
 * Pruned against what the client has NOW, on READ and never in an effect: switching client cannot
 * leave a render marking a year this client does not have.
 */
export function sanitizeFilters(
  filters: PersonnelCostFilters,
  universe: PersonnelCostUniverse,
): PersonnelCostFilters {
  const marked = universe.years.filter((year) => filters.years.includes(year));
  const years = marked.length > 0 ? marked : universe.years.slice(-1);
  const available = new Set(universe.months);
  // The section wins over the groups it was recorded with: the two cannot disagree on read.
  const sections = PERSONNEL_SECTION_IDS.filter((id) => filters.sections.includes(id));
  return {
    years,
    months: universe.months.filter(
      (month) => available.has(month) && filters.months.includes(month),
    ),
    groups:
      sections.length > 0
        ? groupsOfSections(sections)
        : PERSONNEL_GROUP_IDS.filter((id) => filters.groups.includes(id)),
    sections,
  };
}

export function withYearToggled(
  filters: PersonnelCostFilters,
  year: number,
  universe: readonly number[],
): PersonnelCostFilters {
  const marked = new Set(filters.years);
  if (marked.has(year)) {
    marked.delete(year);
  } else {
    marked.add(year);
  }
  // The months SURVIVE a change of year: a mark of «Abr» means «April», not «April 2026», so removing
  // a year does not invalidate it. What prunes it is `sanitizeFilters`, if that month stops existing.
  return { ...filters, years: universe.filter((entry) => marked.has(entry)) };
}

/** Marks ALL the years. It is not «emptying the list»: here an empty list means «the most recent»,
 *  so the shortcut has to populate it for real. */
export function withAllYears(
  filters: PersonnelCostFilters,
  universe: readonly number[],
): PersonnelCostFilters {
  return { ...filters, years: [...universe] };
}

export function withMonthToggled(
  filters: PersonnelCostFilters,
  month: number,
  universe: readonly number[],
): PersonnelCostFilters {
  const marked = new Set(filters.months);
  if (marked.has(month)) {
    marked.delete(month);
  } else {
    marked.add(month);
  }
  return { ...filters, months: universe.filter((entry) => marked.has(entry)) };
}

export function withMonthsCleared(filters: PersonnelCostFilters): PersonnelCostFilters {
  return { ...filters, months: [] };
}

export function withGroupToggled(
  filters: PersonnelCostFilters,
  id: PersonnelGroupId,
): PersonnelCostFilters {
  const marked = new Set(filters.groups);
  if (marked.has(id)) {
    marked.delete(id);
  } else {
    marked.add(id);
  }
  return { ...filters, groups: PERSONNEL_GROUP_IDS.filter((entry) => marked.has(entry)) };
}

export function withSectionToggled(
  filters: PersonnelCostFilters,
  id: PersonnelSectionId,
): PersonnelCostFilters {
  const marked = new Set(filters.sections);
  if (marked.has(id)) {
    marked.delete(id);
  } else {
    marked.add(id);
  }
  const sections = PERSONNEL_SECTION_IDS.filter((entry) => marked.has(entry));
  return { ...filters, sections, groups: groupsOfSections(sections) };
}

/** Clears BOTH axes: they are one narrowing, and the chip bar's «Limpiar» means all of it. */
export function withGroupsCleared(filters: PersonnelCostFilters): PersonnelCostFilters {
  return { ...filters, groups: [], sections: [] };
}

/**
 * Which column of «Grupo» is in use — the ONE rule the bar locks the other column by. `null` with no
 * mark, when both are open.
 */
export function groupAxis(filters: PersonnelCostFilters): "group" | "section" | null {
  if (filters.sections.length > 0) {
    return "section";
  }
  return filters.groups.length > 0 ? "group" : null;
}

/** Whether a group is inside the narrowing. No mark is ALL of them. */
export function includesGroup(filters: PersonnelCostFilters, id: PersonnelGroupId): boolean {
  return filters.groups.length === 0 || filters.groups.includes(id);
}

/**
 * The months the reading sums: the marked ones, or ALL the covered ones of the marked years. It is the
 * only translation of the marks into the span, so the grid, the tiles and the four cards cannot end up
 * summing different periods.
 */
export function selectedMonths(
  filters: PersonnelCostFilters,
  universe: PersonnelCostUniverse,
): number[] {
  return filters.months.length > 0 ? filters.months : universe.months;
}

/**
 * What the marked groups are CALLED — the one wording of the narrowing, which the tiles and the four
 * cards' subtitles read so none of them names a different slice from the one beside it.
 *
 * `null` when nothing is marked, because «no mark» is «all three» and a subtitle that spelled out the
 * three names would be saying nothing while taking a line.
 */
export function describeGroupScope(filters: PersonnelCostFilters): string | null {
  if (filters.groups.length === 0 || filters.groups.length === PERSONNEL_GROUP_IDS.length) {
    return null;
  }
  // Set by section, named by section: «Planta» says more than «2 de 3 grupos».
  if (filters.sections.length > 0) {
    const labels = PERSONNEL_SECTIONS.filter((section) =>
      filters.sections.includes(section.id),
    ).map((section) => section.label);
    return labels.join(" y ");
  }
  const labels = PERSONNEL_GROUPS.filter((group) => filters.groups.includes(group.id)).map(
    (group) => group.label,
  );
  return labels.length === 1 ? labels[0] : `${labels.length} de ${PERSONNEL_GROUPS.length} grupos`;
}

/**
 * How many marks are set — what decides whether the chip strip is drawn. It counts the MONTHS and the
 * GROUPS, never the years: `years` is never empty, so a year chip could not always be removed, and its
 * dropdown already shows the whole selection in its label.
 */
export function activeMarkCount(filters: PersonnelCostFilters): number {
  // A section is ONE chip, not one per group it stands for.
  const narrowing = filters.sections.length > 0 ? filters.sections.length : filters.groups.length;
  return filters.months.length + narrowing;
}
