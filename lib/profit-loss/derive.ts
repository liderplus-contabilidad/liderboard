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
import type { DatosCell, DatosGrid, DatosRow } from "./datos-types";
import type { AccountRow, CellEdit, Frequency, PygDataset } from "./types";

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
 * Utilidad o Pérdida = Σ roots starting "4" − Σ roots starting "5". Expenses are
 * stored positive in the source system, hence the subtraction (never a sign flip).
 * Call AFTER computeRollups so root values are trustworthy.
 */
export function computeResult(roots: AccountNode[]): { values: number[]; warnings: string[] } {
  const warnings: string[] = [];
  const width = roots[0]?.values.length ?? 0;
  const values = Array.from({ length: width }, () => 0);

  for (const root of roots) {
    const sign = root.code.startsWith("4") ? 1 : root.code.startsWith("5") ? -1 : 0;
    if (sign === 0) {
      warnings.push(
        `La cuenta raíz ${root.code} no es de ingresos (4) ni costos/gastos (5); se excluye de Utilidad o Pérdida.`,
      );
      continue;
    }
    for (let col = 0; col < width; col++) {
      values[col] += sign * (root.values[col] ?? 0);
    }
  }
  return { values, warnings };
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
  const { roots } = buildAccountTree(dataset.accounts);
  const rolled = computeRollups(applyLeafEdits(roots, edits));
  const result = computeResult(rolled);

  const comments = new Map<string, Map<number, string>>();
  for (const item of edits) {
    if (!item.comment) {
      continue;
    }
    const byMonth = comments.get(item.code) ?? new Map<number, string>();
    byMonth.set(item.monthIndex, item.comment);
    comments.set(item.code, byMonth);
  }

  const reusable = indexRows(previous?.rows);
  const base = dataset.baseFrequency;
  const rows: DatosRow[] = rolled.map((node) =>
    toDatosRow(node, base, frequency, comments, reusable),
  );
  const resultValues = aggregate(result.values, base, frequency);
  rows.push(
    reuse(
      {
        code: "",
        name: "Utilidad o Pérdida",
        level: 1,
        movement: false,
        isResult: true,
        cells: resultValues.map((value) => ({ value })),
      },
      previous?.rows.find((row) => row.isResult),
    ),
  );

  // The labels are a module constant, but the copy is not: a fresh `months` array would
  // invalidate whatever the view memoizes against it (the visible columns) and re-render
  // every row anyway, undoing the row sharing above.
  const labels = [...periodLabels(base === "anual" ? "anual" : frequency)];
  const months = previous && sameStrings(previous.months, labels) ? previous.months : labels;

  const total = result.values.reduce((sum, v) => sum + v, 0);
  const positive = total >= 0;
  return {
    id: "default",
    title: "Estado de Resultados",
    utilidad: {
      label: `${positive ? "Utilidad" : "Pérdida"} ${formatCurrency(total, { cents: true })}`,
      positive,
    },
    months,
    rows,
  };
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
    a.cells.length !== b.cells.length ||
    (a.children?.length ?? -1) !== (b.children?.length ?? -1)
  ) {
    return false;
  }
  for (let i = 0; i < a.cells.length; i++) {
    if (a.cells[i].value !== b.cells[i].value || a.cells[i].comment !== b.cells[i].comment) {
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

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function toDatosRow(
  node: AccountNode,
  base: Frequency,
  frequency: Frequency,
  comments: Map<string, Map<number, string>>,
  reusable: Map<string, DatosRow>,
): DatosRow {
  const values = aggregate(node.values, base, frequency);
  const byMonth = comments.get(node.code);
  const span = base === "mensual" ? MONTHS_PER_PERIOD[frequency] : 1;

  const cells: DatosCell[] = values.map((value, period) => {
    const joined = byMonth ? joinComments(byMonth, period, span) : undefined;
    return joined ? { value, comment: joined } : { value };
  });

  return reuse(
    {
      code: node.code,
      name: node.name,
      level: node.level,
      movement: node.children.length === 0,
      cells,
      ...(node.children.length > 0
        ? {
            children: node.children.map((child) =>
              toDatosRow(child, base, frequency, comments, reusable),
            ),
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

/**
 * Merges several centers' account rows into one set for the Consolidado view: union of
 * codes, column-wise sum of LEAF values (parents recompute downstream via computeRollups).
 * Assumes a shared chart of accounts across centers; a code that is a leaf in one center and
 * a parent in another is a structural conflict — the parent structure wins and it is warned.
 */
export function mergeCenters(centers: AccountRow[][]): {
  accounts: AccountRow[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const width = centers.find((c) => c.length > 0)?.[0]?.values.length ?? 0;

  // Which codes are parents (some other code extends them) anywhere across the centers.
  const allCodes = new Set<string>();
  for (const center of centers) {
    for (const account of center) {
      allCodes.add(account.code);
    }
  }
  const isParent = (code: string): boolean => {
    for (const other of allCodes) {
      if (other !== code && other.startsWith(`${code}.`)) {
        return true;
      }
    }
    return false;
  };

  const order: string[] = [];
  const merged = new Map<string, AccountRow>();
  const conflicted = new Set<string>();

  for (const center of centers) {
    for (const account of center) {
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
  }

  // Structural conflict: a code that is a leaf in at least one center but a parent overall.
  for (const code of order) {
    if (!isParent(code)) {
      continue;
    }
    const leafSomewhere = centers.some(
      (center) =>
        center.some((a) => a.code === code) &&
        !center.some((a) => a.code !== code && a.code.startsWith(`${code}.`)),
    );
    if (leafSomewhere && !conflicted.has(code)) {
      conflicted.add(code);
      warnings.push(
        `La cuenta ${code} es hoja en un centro y padre en otro; se trata como padre en el consolidado.`,
      );
    }
  }

  return { accounts: order.map((code) => merged.get(code) as AccountRow), warnings };
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
