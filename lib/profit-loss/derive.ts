/**
 * Pure derivations over parsed PyG data: account tree, parent rollups, the Utilidad
 * result, and edit overlays. Parents are ALWAYS recomputed from movement (leaf)
 * accounts — the file's parent values are validation input, never display truth.
 */
import { formatCurrency } from "@/lib/format";
import {
  allowedFrequencies,
  FREQUENCY_ORDER,
  MONTHS_PER_PERIOD,
  periodLabels,
  sumByPeriod,
} from "@/lib/period";
import type { DatosCell, DatosColumn, DatosGrid, DatosResultKind, DatosRow } from "./datos-types";
import { isNonOperationalCode, NON_OPERATIONAL_ROOT } from "./segment";
import type { AccountRow, CellEdit, Frequency, PygDataset } from "./types";

/** Root the operating result closes on — the block income and operating costs live in. */
const OPERATING_ROOT = "5";

export interface AccountNode {
  code: string;
  name: string;
  values: number[];
  /** Code segment count: "4.1.1" → 3. Drives the UI indent. */
  level: number;
  children: AccountNode[];
}

/**
 * Links accounts by dot-prefix (parent of "4.1.1" is "4.1"). An orphan whose immediate
 * parent is missing attaches to its nearest existing ancestor; duplicates keep the
 * first occurrence. Both cases produce a Spanish warning.
 */
export function buildAccountTree(accounts: AccountRow[]): {
  roots: AccountNode[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const byCode = new Map<string, AccountNode>();
  const roots: AccountNode[] = [];

  for (const account of accounts) {
    if (byCode.has(account.code)) {
      warnings.push(`Cuenta duplicada en el archivo: ${account.code}; se conserva la primera.`);
      continue;
    }
    const node: AccountNode = {
      code: account.code,
      name: account.name,
      values: [...account.values],
      level: account.code.split(".").length,
      children: [],
    };
    byCode.set(account.code, node);

    const ancestor = nearestAncestor(account.code, byCode);
    if (ancestor) {
      if (ancestor.code !== parentCode(account.code)) {
        warnings.push(
          `La cuenta ${account.code} no tiene padre directo en el archivo; se anida bajo ${ancestor.code}.`,
        );
      }
      ancestor.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return { roots, warnings };
}

function parentCode(code: string): string | null {
  const cut = code.lastIndexOf(".");
  return cut === -1 ? null : code.slice(0, cut);
}

function nearestAncestor(code: string, byCode: Map<string, AccountNode>): AccountNode | null {
  for (let prefix = parentCode(code); prefix !== null; prefix = parentCode(prefix)) {
    const found = byCode.get(prefix);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * Overlays value edits onto LEAF nodes only (parents derive downstream), cloning just
 * the paths that change so memoized rows keep identity. `null` clears a cell to 0.
 */
export function applyLeafEdits(roots: AccountNode[], edits: CellEdit[]): AccountNode[] {
  const valueEdits = new Map<string, CellEdit[]>();
  for (const item of edits) {
    if (item.value === undefined) {
      continue;
    }
    const list = valueEdits.get(item.code) ?? [];
    list.push(item);
    valueEdits.set(item.code, list);
  }
  if (valueEdits.size === 0) {
    return roots;
  }
  return roots.map((node) => applyToNode(node, valueEdits));
}

function applyToNode(node: AccountNode, valueEdits: Map<string, CellEdit[]>): AccountNode {
  const children = node.children.map((child) => applyToNode(child, valueEdits));
  const childrenChanged = children.some((child, i) => child !== node.children[i]);

  const isLeaf = node.children.length === 0;
  const own = isLeaf ? valueEdits.get(node.code) : undefined;
  if (!own?.length && !childrenChanged) {
    return node;
  }

  let values = node.values;
  if (own?.length) {
    values = [...node.values];
    for (const item of own) {
      if (item.monthIndex >= 0 && item.monthIndex < values.length) {
        values[item.monthIndex] = item.value ?? 0;
      }
    }
  }
  return { ...node, values, children };
}

/** Post-order rollup: every parent's values become the column-wise sum of its children. */
export function computeRollups(roots: AccountNode[]): AccountNode[] {
  return roots.map(rollupNode);
}

function rollupNode(node: AccountNode): AccountNode {
  if (node.children.length === 0) {
    return node;
  }
  const children = node.children.map(rollupNode);
  const values = node.values.map((_, col) =>
    children.reduce((sum, child) => sum + (child.values[col] ?? 0), 0),
  );
  return { ...node, values, children };
}

/**
 * Accounting sign of a root: income (4) adds, costs and expenses (5) subtract, and so does the
 * non-operating block (6) that «Segmentar gastos» splits out of 5.2. Expenses are stored
 * positive in the source system, hence the subtraction (never a sign flip). This is the ONE
 * definition — `analytics/series.ts` re-exports it rather than restating the rule.
 */
export function rootSign(code: string): 1 | -1 | 0 {
  if (code.startsWith("4")) {
    return 1;
  }
  if (code.startsWith("5") || isNonOperationalCode(code)) {
    return -1;
  }
  return 0;
}

/** Final statement summary: operating result, non-operating total (positive as an expense), and net result (operating minus non-operating). */
export interface StatementResult {
  /** Σ4 − Σ5 − Σ6: the result of the exercise — what the file's own row must match. */
  values: number[];
  /** Σ4 − Σ5. Identical to `values` while the statement has no non-operating block. */
  operating: number[];
  /** Σ6, positive: the non-operating block's total. Null when the statement was never segmented. */
  nonOperatingTotal: number[] | null;
  /** Σ5 + Σ6, or null when the statement was never segmented. */
  expenses: number[] | null;
  warnings: string[];
}

/**
 * The statement's results. Segmenting only ever REDISTRIBUTES: what a 6 account takes, its twin
 * inside 5.2 gives up, so `values` is the same number before and after — what moves is each
 * block's own result. Call AFTER computeRollups so root values are trustworthy.
 */
export function computeResult(roots: AccountNode[]): StatementResult {
  const warnings: string[] = [];
  const width = roots[0]?.values.length ?? 0;
  const zeros = () => Array.from({ length: width }, () => 0);
  const income = zeros();
  const operatingCost = zeros();
  const nonOperatingCost = zeros();
  let segmented = false;

  for (const root of roots) {
    const sign = rootSign(root.code);
    if (sign === 0) {
      warnings.push(
        `La cuenta raíz ${root.code} no es de ingresos (4), costos/gastos (5) ni gastos no operacionales (6); se excluye de Utilidad o Pérdida.`,
      );
      continue;
    }
    const nonOperating = isNonOperationalCode(root.code);
    segmented ||= nonOperating;
    const target = sign === 1 ? income : nonOperating ? nonOperatingCost : operatingCost;
    for (let col = 0; col < width; col++) {
      target[col] += root.values[col] ?? 0;
    }
  }

  const operating = income.map((value, col) => value - operatingCost[col]);
  const values = operating.map((value, col) => value - nonOperatingCost[col]);
  return {
    values,
    operating,
    // The block's total as it is stored — positive. `values` already subtracts it, which is the
    // accountant's own arithmetic: operacional − total no operacional = ejercicio.
    nonOperatingTotal: segmented ? nonOperatingCost : null,
    expenses: segmented ? operatingCost.map((value, col) => value + nonOperatingCost[col]) : null,
    warnings,
  };
}

/**
 * The frequency ladder itself is shared with Ocupaciones (`lib/period.ts`); re-exported here so
 * every PyG caller keeps importing period naming from the module that owns PyG's derivations.
 */
export { allowedFrequencies, FREQUENCY_ORDER, periodLabels };

/**
 * Period SUMS — a P&L is a flow statement, so quarters/semesters/years add their
 * months (never average). A non-monthly base can only render itself.
 */
export function aggregate(values: number[], base: Frequency, target: Frequency): number[] {
  if (base === target) {
    return values;
  }
  if (base !== "mensual") {
    throw new Error(`No se puede desagregar de ${base} a ${target}.`);
  }
  return sumByPeriod(values, target);
}

/**
 * The axis a grid renders against: which years, at which granularity. Kept as a list from the
 * start —even though a single-year grid passes one entry— because every consumer below reads a
 * column's year, and a one-year special case would be the thing that has to be undone.
 */
export interface GridAxis {
  /** Years to render, ASCENDING. Column order is chronological regardless of how they arrive. */
  years: number[];
  /** The base frequency of the datasets; an annual base can only render itself. */
  base: Frequency;
  /** The granularity the user is looking at. */
  frequency: Frequency;
}

/** The granularity the columns actually speak in: an annual base cannot be disaggregated. */
function axisFrequency(axis: GridAxis): Frequency {
  return axis.base === "anual" ? "anual" : axis.frequency;
}

/** Whether a year closes with a Total column. In annual granularity the year IS one column, so
 * a Total beside it would repeat the same number under a different name. */
function axisHasTotal(axis: GridAxis): boolean {
  return axisFrequency(axis) !== "anual";
}

/**
 * The column plan: each year's periods followed by that year's Total, years ascending. The
 * two-digit year suffix appears only when there is more than one year to tell apart — with a
 * single year the labels are exactly what the table showed before columns carried a year.
 */
export function buildColumns(axis: GridAxis): DatosColumn[] {
  const labels = periodLabels(axisFrequency(axis));
  const multiYear = axis.years.length > 1;
  const columns: DatosColumn[] = [];
  for (const year of [...axis.years].sort((a, b) => a - b)) {
    const suffix = String(year).slice(-2);
    labels.forEach((label, index) => {
      columns.push({
        kind: "period",
        label: multiYear ? `${label} ${suffix}` : label,
        year,
        index,
      });
    });
    if (axisHasTotal(axis)) {
      columns.push({
        kind: "total",
        label: multiYear ? `Total ${suffix}` : "Total",
        year,
      });
    }
  }
  return columns;
}

/** How many periods a year contributes before its Total — the span each row's cells follow. */
function periodsPerYear(axis: GridAxis): number {
  return periodLabels(axisFrequency(axis)).length;
}

/**
 * The full pipeline the Datos view renders: tree → leaf edits → rollups → aggregate →
 * grid. Comments stay keyed by base month; an aggregated cell inherits (joined) the
 * comments of the months it covers, as a read-only indicator.
 *
 * `previous` is the grid this one replaces, and it is what makes editing a cell cheap:
 * every row whose content came out identical is returned AS THE SAME OBJECT, so the
 * memoized table rows bail out instead of re-rendering. Without it a 500-account
 * statement re-renders all of its rows on every keystroke, edit, frequency change and
 * filter — the derivation itself is not what costs, the reconciliation is. Passing it is
 * optional; omitting it only forfeits the sharing, never changes what the grid says.
 */
export function toDatosGrid(
  dataset: PygDataset,
  edits: CellEdit[],
  frequency: Frequency,
  previous?: DatosGrid,
): DatosGrid {
  return toDatosGridMultiYear([{ dataset, edits }], frequency, previous);
}

/** One year's contribution to a grid: its dataset and that dataset's own edits. */
export interface YearSlice {
  dataset: PygDataset;
  edits: CellEdit[];
}

/**
 * The multi-year form of the pipeline: one `YearSlice` per year, laid side by side.
 *
 * The account tree is the UNION of the years' codes, so a cuenta that only 2025 reports still
 * gets a row — with EMPTY cells in 2026 rather than zeros, because "the account does not exist
 * there" and "it moved nothing there" are different readings and the app has always kept them
 * apart. Each year's amounts come from its own rolled tree, so nothing is ever summed across
 * years except inside that year's own Total column.
 */
export function toDatosGridMultiYear(
  slices: readonly YearSlice[],
  frequency: Frequency,
  previous?: DatosGrid,
): DatosGrid {
  const ordered = [...slices].sort((a, b) => a.dataset.year - b.dataset.year);
  const base = ordered[0]?.dataset.baseFrequency ?? "mensual";
  const axis: GridAxis = { years: ordered.map((slice) => slice.dataset.year), base, frequency };

  const perYear = ordered.map((slice) => {
    const { roots } = buildAccountTree(slice.dataset.accounts);
    const rolled = computeRollups(applyLeafEdits(roots, slice.edits));
    return {
      byCode: indexNodes(rolled),
      result: computeResult(rolled),
      ...editMaps(slice.edits),
    };
  });

  // The union tree carries no values of its own — it exists to fix the SHAPE (which codes,
  // nested how, at which level). Every amount below is read per year, by code.
  const { roots: unionRoots } = buildAccountTree(unionAccounts(ordered));
  const reusable = indexRows(previous?.rows);
  const rows: DatosRow[] = unionRoots.map((node) => toDatosRow(node, axis, perYear, reusable));

  const summary = (
    name: string,
    pick: (result: StatementResult) => number[] | null | undefined,
    resultKind: DatosResultKind,
    anchorCode?: string,
  ): DatosRow =>
    reuse(
      {
        code: "",
        name,
        level: 1,
        movement: false,
        isResult: true,
        resultKind,
        ...(anchorCode ? { anchorCode } : {}),
        cells: appendTotals(
          perYear.flatMap((year) => {
            const values = pick(year.result);
            // A year that does not report this summary (an unsegmented year beside a segmented
            // one) leaves its block empty rather than claiming a zero.
            return values
              ? aggregate(values, base, frequency).map((value) => ({ value }))
              : blankCells(axis);
          }),
          axis,
        ),
      },
      previous?.rows.find((row) => row.resultKind === resultKind),
    );

  // Any segmented year opens the four-summary shape; a year that is not segmented shows those
  // three rows empty and keeps its own «Utilidad del Ejercicio».
  const segmented = perYear.some((year) => year.result.nonOperatingTotal && year.result.expenses);
  if (segmented) {
    rows.push(
      summary("Utilidad Operacional", (r) => r.operating, "operacional", OPERATING_ROOT),
      summary(
        "Total No Operacional",
        (r) => r.nonOperatingTotal,
        "no-operacional",
        NON_OPERATIONAL_ROOT,
      ),
      summary("Total Gastos del Ejercicio", (r) => r.expenses, "total-gastos"),
      summary("Utilidad del Ejercicio", (r) => r.values, "ejercicio"),
    );
  } else {
    rows.push(summary("Utilidad o Pérdida", (r) => r.values, "ejercicio"));
  }

  // The plan is derived from constants, but the copy is not: a fresh `columns` array would
  // invalidate whatever the view memoizes against it (the visible columns) and re-render
  // every row anyway, undoing the row sharing above.
  const fresh = buildColumns(axis);
  const columns = previous && sameColumns(previous.columns, fresh) ? previous.columns : fresh;

  return {
    id: "default",
    title: "Estado de Resultados",
    // The badge is one year's bottom line. With several on screen there is no single figure it
    // could name without inviting the reader to add two exercises together, so it is dropped.
    ...(ordered.length === 1 ? { utilidad: utilidadBadge(perYear[0].result.values) } : {}),
    columns,
    rows,
  };
}

function utilidadBadge(values: number[]): NonNullable<DatosGrid["utilidad"]> {
  const total = values.reduce((sum, value) => sum + value, 0);
  const positive = total >= 0;
  return {
    label: `${positive ? "Utilidad" : "Pérdida"} ${formatCurrency(total, { cents: true })}`,
    positive,
  };
}

/** One year's worth of empty cells — the account (or summary) is not reported that year. */
function blankCells(axis: GridAxis): DatosCell[] {
  return Array.from({ length: periodsPerYear(axis) }, () => ({ value: null }));
}

/** Every code across the years, once, with the most recent year's spelling of its name. */
function unionAccounts(slices: readonly YearSlice[]): AccountRow[] {
  const byCode = new Map<string, AccountRow>();
  for (const slice of slices) {
    for (const account of slice.dataset.accounts) {
      byCode.set(account.code, { code: account.code, name: account.name, values: [] });
    }
  }
  return [...byCode.values()];
}

function indexNodes(roots: AccountNode[]): Map<string, AccountNode> {
  const byCode = new Map<string, AccountNode>();
  const walk = (nodes: AccountNode[]) => {
    for (const node of nodes) {
      byCode.set(node.code, node);
      walk(node.children);
    }
  };
  walk(roots);
  return byCode;
}

/** The comment and value-adjustment lookups a year's cells are decorated with. */
function editMaps(edits: readonly CellEdit[]): {
  comments: Map<string, Map<number, string>>;
  editedMonths: Map<string, Set<number>>;
} {
  const comments = new Map<string, Map<number, string>>();
  const editedMonths = new Map<string, Set<number>>();
  for (const item of edits) {
    if (item.comment) {
      const byMonth = comments.get(item.code) ?? new Map<number, string>();
      byMonth.set(item.monthIndex, item.comment);
      comments.set(item.code, byMonth);
    }
    // Only LEAF accounts ever hold a value edit (`CellEdit`'s own contract), so this map never
    // reaches a parent row below — no separate "skip parents" check is needed.
    if (item.value !== undefined) {
      const months = editedMonths.get(item.code) ?? new Set<number>();
      months.add(item.monthIndex);
      editedMonths.set(item.code, months);
    }
  }
  return { comments, editedMonths };
}

/**
 * Appends each year's Total cell to a row's period cells, so `cells` aligns with `columns`
 * position for position. The sum is over that year's own slice — which is the whole point of
 * the total being a column: it cannot reach into the next year.
 */
function appendTotals(cells: DatosCell[], axis: GridAxis): DatosCell[] {
  if (!axisHasTotal(axis)) {
    return cells;
  }
  const span = periodsPerYear(axis);
  const out: DatosCell[] = [];
  for (let year = 0; year < axis.years.length; year++) {
    const slice = cells.slice(year * span, (year + 1) * span);
    // A year with nothing but empty cells totals to empty, not to zero — the account is not
    // reported that year, and a 0 would read as "it moved nothing".
    const total = slice.every((cell) => cell.value === null)
      ? null
      : slice.reduce((sum, cell) => sum + (cell.value ?? 0), 0);
    out.push(...slice, { value: total });
  }
  return out;
}

/** Where each summary row goes: closing a root's block, or closing the grid. */
export interface SummaryPlacement {
  /** Summaries that close a root, keyed by that root's code. */
  byAnchor: Map<string, DatosRow[]>;
  /** Summaries that close the grid — unanchored, or anchored to a root that isn't rendered. */
  trailing: DatosRow[];
}

/**
 * Splits a grid's summary rows between the block each one closes and the tail of the grid.
 *
 * An anchor only holds while the grid is UNSORTED: sorting reorders the roots, so "after section
 * 5" stops meaning anything. An anchor whose root the account filter hid falls back to the tail
 * too, so a summary is never dropped.
 */
export function planSummaries(
  rows: DatosRow[],
  sorted: boolean,
  visibleRoots: ReadonlySet<string>,
): SummaryPlacement {
  const byAnchor = new Map<string, DatosRow[]>();
  const trailing: DatosRow[] = [];

  for (const row of rows) {
    if (!row.isResult) {
      continue;
    }
    const anchored = !sorted && row.anchorCode && visibleRoots.has(row.anchorCode);
    if (!anchored) {
      trailing.push(row);
      continue;
    }
    const code = row.anchorCode as string;
    byAnchor.set(code, [...(byAnchor.get(code) ?? []), row]);
  }
  return { byAnchor, trailing };
}

/** Every account row of a grid by code, so a rebuild can look up its own predecessor. */
function indexRows(rows: DatosRow[] | undefined): Map<string, DatosRow> {
  const byCode = new Map<string, DatosRow>();
  const walk = (list: DatosRow[]) => {
    for (const row of list) {
      if (!row.isResult) {
        byCode.set(row.code, row);
      }
      if (row.children) {
        walk(row.children);
      }
    }
  };
  if (rows) {
    walk(rows);
  }
  return byCode;
}

/** The predecessor when it says exactly the same thing, otherwise the fresh row. */
function reuse(next: DatosRow, previous: DatosRow | undefined): DatosRow {
  return previous && sameRow(previous, next) ? previous : next;
}

/**
 * Whether two rows are indistinguishable to the renderer. Children compare BY REFERENCE
 * on purpose: they were rebuilt bottom-up through `reuse`, so an identical child already
 * carries the previous object — a deep re-comparison here would repeat that work per level.
 */
function sameRow(a: DatosRow, b: DatosRow): boolean {
  if (
    a.name !== b.name ||
    a.level !== b.level ||
    a.movement !== b.movement ||
    a.isResult !== b.isResult ||
    a.resultKind !== b.resultKind ||
    a.anchorCode !== b.anchorCode ||
    a.cells.length !== b.cells.length ||
    (a.children?.length ?? -1) !== (b.children?.length ?? -1)
  ) {
    return false;
  }
  for (let i = 0; i < a.cells.length; i++) {
    if (
      a.cells[i].value !== b.cells[i].value ||
      a.cells[i].comment !== b.cells[i].comment ||
      a.cells[i].edited !== b.cells[i].edited
    ) {
      return false;
    }
  }
  if (a.children && b.children) {
    for (let i = 0; i < a.children.length; i++) {
      if (a.children[i] !== b.children[i]) {
        return false;
      }
    }
  }
  return true;
}

function sameColumns(a: readonly DatosColumn[], b: readonly DatosColumn[]): boolean {
  return (
    a.length === b.length &&
    a.every((column, index) => {
      const other = b[index];
      return (
        column.kind === other.kind && column.label === other.label && column.year === other.year
      );
    })
  );
}

/** What one year contributes when a row's cells are built: its amounts and its edit overlays. */
interface YearLookup {
  byCode: Map<string, AccountNode>;
  comments: Map<string, Map<number, string>>;
  editedMonths: Map<string, Set<number>>;
}

function toDatosRow(
  node: AccountNode,
  axis: GridAxis,
  perYear: readonly YearLookup[],
  reusable: Map<string, DatosRow>,
): DatosRow {
  const { base, frequency } = axis;
  const span = base === "mensual" ? MONTHS_PER_PERIOD[frequency] : 1;

  const cells = perYear.flatMap((year): DatosCell[] => {
    const own = year.byCode.get(node.code);
    // Absent from this year's chart of accounts entirely — empty, not zero.
    if (!own) {
      return blankCells(axis);
    }
    const byMonth = year.comments.get(node.code);
    const editedSet = year.editedMonths.get(node.code);
    return aggregate(own.values, base, frequency).map((value, period) => {
      const joined = byMonth ? joinComments(byMonth, period, span) : undefined;
      const edited = editedSet ? overlapsSpan(editedSet, period, span) : false;
      return {
        value,
        ...(joined ? { comment: joined } : {}),
        ...(edited ? { edited: true } : {}),
      };
    });
  });

  return reuse(
    {
      code: node.code,
      name: node.name,
      level: node.level,
      movement: node.children.length === 0,
      cells: appendTotals(cells, axis),
      ...(node.children.length > 0
        ? {
            children: node.children.map((child) => toDatosRow(child, axis, perYear, reusable)),
          }
        : {}),
    },
    reusable.get(node.code),
  );
}

/** Joins the comments of every base month a period covers ("" → undefined). */
function joinComments(
  byMonth: Map<number, string>,
  period: number,
  span: number,
): string | undefined {
  const parts: string[] = [];
  for (let m = period * span; m < (period + 1) * span; m++) {
    const comment = byMonth.get(m);
    if (comment) {
      parts.push(comment);
    }
  }
  return parts.length > 0 ? parts.join("\n") : undefined;
}

/** Whether any base month a period covers is in `months` — same span logic as `joinComments`. */
function overlapsSpan(months: ReadonlySet<number>, period: number, span: number): boolean {
  for (let m = period * span; m < (period + 1) * span; m++) {
    if (months.has(m)) {
      return true;
    }
  }
  return false;
}

/** Cómo se llama la subcuenta que recoge lo que un centro anotó sin desglosar. */
export const UNDISTRIBUTED_NAME = "Sin desglosar";

/**
 * Merges several centers' account rows into one set for the Consolidado view: union of
 * codes, column-wise sum of LEAF values (parents recompute downstream via computeRollups).
 *
 * **Los planes desiguales no pierden plata.** Un código puede ser HOJA en un centro —donde alguien
 * escribió el monto directamente— y PADRE en otro, que lo desglosa en subcuentas. Como todo
 * consumidor recalcula un padre desde sus hijas (`computeRollups`), el monto del que no desglosaba
 * se descartaba en silencio y el consolidado salía por debajo: 500 en `4.1` más 300 repartidos en
 * `4.1.01` daban 300, no 800.
 *
 * Ese monto se cuelga ahora de una subcuenta sintética «Sin desglosar» (`4.1.0`), que es la única
 * forma de que a la vez SUME y se VEA de dónde viene. El aviso se mantiene, pero para decir dónde
 * quedó y no que se trató como padre.
 *
 * `unit` is what the warning CALLS what it is summing, because the same merge runs one level up:
 * `consolidate.ts` sums clients with it, and «es hoja en un centro» would then point at the wrong
 * thing entirely. Only the copy changes — the merge does not care what the columns are.
 */
export function mergeCenters(
  centers: AccountRow[][],
  unit = "centro",
): {
  accounts: AccountRow[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const width = centers.find((c) => c.length > 0)?.[0]?.values.length ?? 0;

  // Qué códigos son padres (algún otro los extiende) en el conjunto de todos los centros, y cuáles
  // lo son DENTRO de cada centro. Se marcan los ancestros de cada código en una pasada en vez de
  // comparar cada código contra todos: con cinco clientes de quinientas cuentas, lo segundo son
  // millones de comparaciones de texto por consolidado.
  const allCodes = new Set<string>();
  const parents = new Set<string>();
  const parentsPerCenter = centers.map(() => new Set<string>());
  centers.forEach((center, index) => {
    for (const account of center) {
      allCodes.add(account.code);
      for (const ancestor of ancestorCodes(account.code)) {
        parents.add(ancestor);
        parentsPerCenter[index].add(ancestor);
      }
    }
  });
  const isParent = (code: string): boolean => parents.has(code);

  const order: string[] = [];
  const merged = new Map<string, AccountRow>();
  // Lo que cada centro anotó DIRECTAMENTE en un código que el conjunto trata como padre.
  const undistributed = new Map<string, number[]>();

  centers.forEach((center, index) => {
    for (const account of center) {
      // Hoja aquí, padre en el conjunto: su monto no lo recogería ningún rollup, así que se
      // aparta para colgarlo de su propia subcuenta más abajo.
      if (isParent(account.code) && !parentsPerCenter[index].has(account.code)) {
        const bucket = undistributed.get(account.code) ?? new Array<number>(width).fill(0);
        for (let i = 0; i < width; i++) {
          bucket[i] += account.values[i] ?? 0;
        }
        undistributed.set(account.code, bucket);
      }

      const existing = merged.get(account.code);
      if (!existing) {
        order.push(account.code);
        merged.set(account.code, {
          code: account.code,
          name: account.name,
          values: Array.from({ length: width }, (_, i) => account.values[i] ?? 0),
        });
        continue;
      }
      // Only sum LEAF values; parents recompute from leaves in computeRollups.
      if (!isParent(account.code)) {
        for (let i = 0; i < width; i++) {
          existing.values[i] += account.values[i] ?? 0;
        }
      }
    }
  });

  // Al FINAL del orden, para que cada «Sin desglosar» quede como última hija de la suya y el
  // desglose real se lea primero. `buildAccountTree` la ancla por prefijo, así que su padre ya
  // está en el árbol cuando llega.
  for (const code of [...undistributed.keys()].sort(compareCodes)) {
    const values = undistributed.get(code) as number[];
    // Un cero declarado no gana una fila: no aporta al total y solo ensucia el árbol.
    if (values.every((value) => value === 0)) {
      continue;
    }
    const childCode = freeChildCode(code, allCodes);
    allCodes.add(childCode);
    order.push(childCode);
    merged.set(childCode, { code: childCode, name: UNDISTRIBUTED_NAME, values });
    warnings.push(
      `La cuenta ${code} es hoja en un ${unit} y padre en otro; lo que se anotó directamente en ella se suma bajo «${UNDISTRIBUTED_NAME}».`,
    );
  }

  return { accounts: order.map((code) => merged.get(code) as AccountRow), warnings };
}

/** `4.1.01.01` → `["4", "4.1", "4.1.01"]`; el propio código no se incluye. */
function ancestorCodes(code: string): string[] {
  const segments = code.split(".");
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join("."));
}

/** `${code}.0`, alargando el cero mientras choque con una cuenta real del plan. */
function freeChildCode(code: string, taken: ReadonlySet<string>): string {
  let suffix = "0";
  while (taken.has(`${code}.${suffix}`)) {
    suffix += "0";
  }
  return `${code}.${suffix}`;
}

/** Orden numérico por segmento — el mismo criterio que `merge-month.ts`, aquí para no importarlo
 * al revés (ese módulo ya depende de este). */
function compareCodes(a: string, b: string): number {
  const segA = a.split(".").map(Number);
  const segB = b.split(".").map(Number);
  for (let i = 0; i < Math.max(segA.length, segB.length); i++) {
    const diff = (segA[i] ?? -1) - (segB[i] ?? -1);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/**
 * The value a cell edit should STORE: `undefined` when it is exactly what the file already holds.
 *
 * Typing a figure and then typing the original back is not an adjustment, and the app must not
 * record one — a stored no-op paints the cell as adjusted, writes «Valor original: $0 → $0» into
 * the downloaded workbook, makes a later reload of that month look like a conflict, and keeps the
 * row alive under «Ocultar cuentas en cero» for a change nobody made. Deciding it HERE, at the
 * write, is what lets every one of those readers stay as it is: what is stored is true.
 *
 * A cleared cell (`null`) is a zero, the same reading the whole engine makes of an edit's value;
 * a code or month the file doesn't report reads as a file zero, which is what an account added by
 * a later month is before that month arrives.
 */
export function storedAdjustment(
  accounts: readonly AccountRow[],
  code: string,
  monthIndex: number,
  value: number | null | undefined,
): number | null | undefined {
  if (value === undefined) {
    return undefined; // comment-only edit: there is no value to compare
  }
  const original = accounts.find((account) => account.code === code)?.values[monthIndex] ?? 0;
  return (value ?? 0) === original ? undefined : value;
}

/**
 * Overlays leaf value-edits onto a flat AccountRow list (the shape mergeCenters consumes),
 * so the computed Consolidado reflects per-center edits. Only leaf codes take a value; parents
 * recompute downstream. Non-value edits (comment-only) are ignored here.
 */
export function applyEditsToLeafAccounts(accounts: AccountRow[], edits: CellEdit[]): AccountRow[] {
  const valueEdits = edits.filter((edit) => edit.value !== undefined);
  if (valueEdits.length === 0) {
    return accounts;
  }
  const codes = new Set(accounts.map((a) => a.code));
  const isLeaf = (code: string): boolean => {
    for (const other of codes) {
      if (other !== code && other.startsWith(`${code}.`)) {
        return false;
      }
    }
    return true;
  };
  const byCode = new Map<string, CellEdit[]>();
  for (const edit of valueEdits) {
    const list = byCode.get(edit.code) ?? [];
    list.push(edit);
    byCode.set(edit.code, list);
  }
  return accounts.map((account) => {
    const own = byCode.get(account.code);
    if (!own || !isLeaf(account.code)) {
      return account;
    }
    const values = [...account.values];
    for (const edit of own) {
      if (edit.monthIndex >= 0 && edit.monthIndex < values.length) {
        values[edit.monthIndex] = edit.value ?? 0;
      }
    }
    return { ...account, values };
  });
}
