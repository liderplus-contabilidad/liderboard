/**
 * The comparativo described as DATA — columns, rows and cells — and not as markup.
 *
 * That it is data is what lets the screen and (one day) a printable report read EXACTLY the same
 * construction instead of each rebuilding its figures: two computations of one question drift apart,
 * and nothing downstream can say which of the two numbers is right. It is the rule `lib/sales/cards.ts`
 * already applies to its three readings.
 *
 * **It speaks in COLUMNS, not in months**, which is PyG's Datos' rule and the reason the comparison
 * costs no second view: every column carries its own YEAR, so two marked exercises are two blocks of
 * the same table and «abril contra abril» is read across, not by switching tabs. A year's Total and
 * its «% vs ventas» are columns like any other.
 *
 * **The percentages live on the ROWS they describe.** The workbook puts its three levels in three
 * columns whose group cells are merged vertically over the rows they span; here the group's share sits
 * on the group's own subtotal row and the section's on the section row. It is the same three numbers —
 * what changes is that a merged cell of nine rows is lost the moment the header scrolls away, that two
 * fewer columns is what lets twelve months fit, and above all that every level now closes in DOLLARS
 * too, which the workbook never says: it shows «no afiliados» is 11.4 % and never how much that is.
 *
 * **A computed row is drawn only when it sums more than one row already on screen.** Narrowing to a
 * single group would otherwise print its subtotal, its section and the grand total as three identical
 * lines under it — the reader looking for the difference between numbers that have none.
 */
import { MONTHS_SHORT_ES } from "@/lib/date";
import {
  PERSONNEL_SECTIONS,
  groupsOfSection,
  type PersonnelGroupId,
  type PersonnelSectionId,
} from "./accounts";
import {
  shareOf,
  type PersonnelCostReading,
  type PersonnelGroupReading,
  type PersonnelYearReading,
} from "./derive";

export type PersonnelColumnKind = "month" | "total" | "share";

export interface PersonnelGridColumn {
  key: string;
  /** The exercise this column belongs to; `null` on the consolidated block. */
  year: number | null;
  kind: PersonnelColumnKind;
  label: string;
  /** `null` on the Total and «% vs ventas» columns. */
  monthIndex: number | null;
  /** First column of its block — where the grid opens the separating band. */
  startsBlock: boolean;
}

/**
 * A run of columns under one heading: an exercise, or the consolidado. The grid declares them rather
 * than letting the component divide `columns.length` by the number of years — which stopped being true
 * the moment the consolidado made one block narrower than the others.
 */
export interface PersonnelGridBlock {
  key: string;
  /** `null` on the consolidado. */
  year: number | null;
  label: string;
  span: number;
}

export interface PersonnelGridCell {
  key: string;
  /** `null` = nothing to say: outside coverage, or an account this plan does not have. */
  value: number | null;
  kind: PersonnelColumnKind;
  /**
   * Where this cell WRITES, or `null` for the vast majority that only read.
   *
   * The nómina de la familia is captured right here, in the row that shows it, and not behind a
   * drawer: it is one figure per month and the table already puts each month in front of the reader,
   * so a second surface for it would be a second place to look at the same twelve cells.
   */
  edit: { year: number; monthIndex: number } | null;
}

export type PersonnelGridRowKind = "concept" | "group" | "section" | "grand";

export interface PersonnelGridRow {
  key: string;
  kind: PersonnelGridRowKind;
  label: string;
  /** The account behind it, for the «Cta ctable» column; `null` on a computed or captured row. */
  code: string | null;
  /** The group band on the left. Only the FIRST concept row of each group opens it. */
  group: PersonnelGroupId | null;
  /** How many rows that band spans; `0` on every row that does not open one. */
  groupSpan: number;
  /** Extra wording under the label — «Afiliados + no afiliados» on a section row. */
  hint: string | null;
  cells: PersonnelGridCell[];
  /** Whether the row says anything other than zero in ANY marked year. */
  moves: boolean;
  /** The row's account is absent from the plan — a different thing from a row of zeros. */
  missing: boolean;
}

export interface PersonnelGrid {
  columns: PersonnelGridColumn[];
  /** The column runs and their headings; empty when a single exercise needs no band. */
  blocks: PersonnelGridBlock[];
  rows: PersonnelGridRow[];
  /** The months the columns span, ascending. EMPTY when comparing exercises — see `comparing`. */
  months: number[];
  /**
   * Whether the table is comparing EXERCISES rather than reading months.
   *
   * It is not a mode anyone chose: with one year marked the columns are that year's months, and with
   * several they become one Total and one «% vs ventas» per exercise plus the consolidado. The card
   * builders already answer the same question the same way (`lib/personnel-cost/cards.ts`), and the
   * alternative —three exercises at fourteen columns each— is forty-two columns nobody reads.
   */
  comparing: boolean;
  /** How many rows «Ocultar filas en cero» is currently holding back. */
  hiddenRows: number;
}

export interface PersonnelGridOptions {
  /** The marked groups; empty is ALL of them, the house rule. */
  groups: readonly PersonnelGroupId[];
  /** Whether a row that moved nothing anywhere is held back. */
  hideEmptyRows: boolean;
}

function columnsFor(
  years: readonly PersonnelYearReading[],
  months: readonly number[],
  comparing: boolean,
): { columns: PersonnelGridColumn[]; blocks: PersonnelGridBlock[] } {
  const columns: PersonnelGridColumn[] = [];
  const blocks: PersonnelGridBlock[] = [];

  for (const year of years) {
    const before = columns.length;
    months.forEach((month, index) => {
      columns.push({
        key: `${year.year}:m${month}`,
        year: year.year,
        kind: "month",
        label: MONTHS_SHORT_ES[month],
        monthIndex: month,
        startsBlock: index === 0,
      });
    });
    columns.push({
      key: `${year.year}:total`,
      year: year.year,
      kind: "total",
      label: "Total",
      monthIndex: null,
      startsBlock: months.length === 0,
    });
    columns.push({
      key: `${year.year}:share`,
      year: year.year,
      kind: "share",
      label: "% vs ventas",
      monthIndex: null,
      startsBlock: false,
    });
    blocks.push({
      key: String(year.year),
      year: year.year,
      label: String(year.year),
      span: columns.length - before,
    });
  }

  // The consolidado closes the table when there is more than one exercise: it is the SUM of the
  // marked tramos over the SUM of their ventas, never an average of the percentages beside it — two
  // exercises with different ventas cannot have their shares averaged, and the source workbook's own
  // TOTAL row is exactly that mistake.
  if (comparing) {
    columns.push({
      key: "consolidado:total",
      year: null,
      kind: "total",
      label: "Total",
      monthIndex: null,
      startsBlock: true,
    });
    columns.push({
      key: "consolidado:share",
      year: null,
      kind: "share",
      label: "% vs ventas",
      monthIndex: null,
      startsBlock: false,
    });
    blocks.push({ key: "consolidado", year: null, label: "Consolidado", span: 2 });
  }

  return { columns, blocks };
}

/** One row's cells across every marked year and, when comparing, the consolidado. */
function cellsFor(
  rowKey: string,
  years: readonly PersonnelYearReading[],
  months: readonly number[],
  pick: (
    year: PersonnelYearReading,
  ) => { monthly: (number | null)[]; total: number; share: number | null } | undefined,
  editable: boolean,
  consolidated: { revenue: number } | null,
): PersonnelGridCell[] {
  const cells: PersonnelGridCell[] = [];
  for (const year of years) {
    const amounts = pick(year);
    const covered = new Set(year.months);
    for (const month of months) {
      cells.push({
        key: `${rowKey}:${year.year}:m${month}`,
        value: amounts?.monthly[month] ?? null,
        kind: "month",
        // Only a month this exercise actually loaded can be written: capturing against a month with
        // no estado de resultados behind it would be a figure with nothing to be carved out of.
        edit: editable && covered.has(month) ? { year: year.year, monthIndex: month } : null,
      });
    }
    cells.push({
      key: `${rowKey}:${year.year}:total`,
      value: amounts ? amounts.total : null,
      kind: "total",
      edit: null,
    });
    cells.push({
      key: `${rowKey}:${year.year}:share`,
      value: amounts?.share ?? null,
      kind: "share",
      edit: null,
    });
  }

  if (consolidated) {
    // A row nobody's exercise carries reads `null` and not `0`: that is the same distinction the
    // monthly cells keep, and the consolidado must not invent a figure for it.
    const totals = years.map((year) => pick(year)?.total);
    const present = totals.filter((value): value is number => value !== undefined);
    const total = present.reduce((sum, value) => sum + value, 0);
    cells.push({
      key: `${rowKey}:consolidado:total`,
      value: present.length > 0 ? total : null,
      kind: "total",
      edit: null,
    });
    cells.push({
      key: `${rowKey}:consolidado:share`,
      value: present.length > 0 ? shareOf(total, consolidated.revenue) : null,
      kind: "share",
      edit: null,
    });
  }
  return cells;
}

export function buildPersonnelGrid(
  reading: PersonnelCostReading,
  options: PersonnelGridOptions,
): PersonnelGrid {
  const years = reading.years;
  // ONE exercise reads its months; SEVERAL compare their totals. It is the same answer the four cards
  // give to the same question, and no control chooses between the two.
  const comparing = years.length > 1;
  const months = comparing
    ? []
    : [...new Set(years.flatMap((year) => year.months))].sort((a, b) => a - b);
  const consolidated = comparing ? { revenue: reading.revenue } : null;
  const { columns, blocks } = columnsFor(years, months, comparing);

  const marked = new Set(options.groups);
  const inScope = (id: PersonnelGroupId) => marked.size === 0 || marked.has(id);
  // Read off the FIRST year: every year carries the same twenty-one rows in the same order, which is
  // what makes a row's identity independent of the exercise it is being compared in.
  const groups = (years[0]?.groups ?? []).filter((group) => inScope(group.group.id));

  const rows: PersonnelGridRow[] = [];
  let hiddenRows = 0;

  const groupOf = (year: PersonnelYearReading, id: PersonnelGroupId) =>
    year.groups.find((entry) => entry.group.id === id);

  const inScopeIds = new Set(groups.map((group) => group.group.id));
  /** The groups of a section that survived the narrowing — what decides how its figure is written. */
  const sectionGroups = (id: PersonnelSectionId) =>
    groupsOfSection(id).filter((group) => inScopeIds.has(group.id));
  const sectionsInScope = PERSONNEL_SECTIONS.filter(
    (section) => sectionGroups(section.id).length > 0,
  );

  for (const group of groups) {
    const conceptRows: PersonnelGridRow[] = [];
    for (const row of group.rows) {
      const id = row.concept.id;
      const moves = years.some(
        (year) =>
          groupOf(year, group.group.id)?.rows.find((entry) => entry.concept.id === id)?.moves ??
          false,
      );
      if (options.hideEmptyRows && !moves) {
        hiddenRows += 1;
        continue;
      }
      conceptRows.push({
        key: `concept:${id}`,
        kind: "concept",
        label: row.concept.label,
        code: row.code,
        group: null,
        groupSpan: 0,
        hint: null,
        cells: cellsFor(
          `concept:${id}`,
          years,
          months,
          (year) => groupOf(year, group.group.id)?.rows.find((entry) => entry.concept.id === id),
          row.concept.source.kind === "captured",
          consolidated,
        ),
        moves,
        missing: row.missing,
      });
    }

    if (conceptRows.length === 0) {
      // Every row of the group was held back; its subtotal would head nothing.
      continue;
    }

    // The band opens on the first row that SURVIVED the filter, and spans the concepts plus their
    // subtotal — computing it after the pruning is what keeps it aligned with what is drawn.
    conceptRows[0].group = group.group.id;
    conceptRows[0].groupSpan = conceptRows.length + 1;
    rows.push(...conceptRows);

    const section = PERSONNEL_SECTIONS.find((entry) => entry.id === group.group.section);
    const siblings = section ? sectionGroups(section.id) : [];
    const alone = siblings.length === 1 && sectionsInScope.length > 1;
    // A section made of ONE group is the same figure twice, so the two rows become one and the
    // subtotal carries both names. It is not a special case of the layout — it is the workbook's own
    // shape: its columns R and S write 22.6 % side by side for exactly this reason.
    rows.push(
      subtotalRow(
        group,
        years,
        months,
        groupOf,
        alone ? (section?.label ?? null) : null,
        consolidated,
      ),
    );

    // The section closes right after the LAST of its groups, so everything above the band belongs to
    // it. Emitting all sections at the end instead would put «Planta» under the honorarios it does
    // not include.
    const isLast = siblings.length > 1 && siblings[siblings.length - 1].id === group.group.id;
    if (isLast && section) {
      const key = `section:${section.id}`;
      rows.push({
        key,
        kind: "section",
        label: section.label,
        code: null,
        group: null,
        groupSpan: 0,
        hint: section.hint,
        cells: cellsFor(
          key,
          years,
          months,
          (year) => year.sections.find((entry) => entry.section.id === section.id),
          false,
          consolidated,
        ),
        moves: true,
        missing: false,
      });
    }
  }

  // Same rule as the sections: with one group on screen the grand total is that group's subtotal
  // again, and a reader looking for the difference between two identical lines will not find one.
  if (groups.length > 1) {
    rows.push({
      key: "grand",
      kind: "grand",
      label: "Total costo de personal",
      code: null,
      group: null,
      groupSpan: 0,
      hint: null,
      cells: cellsFor("grand", years, months, (year) => year, false, consolidated),
      moves: true,
      missing: false,
    });
  }

  return { columns, blocks, rows, months, comparing, hiddenRows };
}

function subtotalRow(
  group: PersonnelGroupReading,
  years: readonly PersonnelYearReading[],
  months: readonly number[],
  groupOf: (year: PersonnelYearReading, id: PersonnelGroupId) => PersonnelGroupReading | undefined,
  /** The section this subtotal ALSO is, when it is the only group in it. */
  section: string | null,
  consolidated: { revenue: number } | null,
): PersonnelGridRow {
  const key = `group:${group.group.id}`;
  const subtotal = `Subtotal ${group.group.label.toLocaleLowerCase("es")}`;
  return {
    key,
    kind: "group",
    // Con la sección delante el rótulo es UNA frase, así que «Subtotal» pierde su mayúscula.
    label: section
      ? `${section} · ${subtotal[0].toLocaleLowerCase("es")}${subtotal.slice(1)}`
      : subtotal,
    code: null,
    group: null,
    groupSpan: 0,
    hint: null,
    cells: cellsFor(
      key,
      years,
      months,
      (year) => groupOf(year, group.group.id),
      false,
      consolidated,
    ),
    moves: true,
    missing: false,
  };
}
