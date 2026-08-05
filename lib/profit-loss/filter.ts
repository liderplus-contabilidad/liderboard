/**
 * View filters for the PyG › Datos table, layered on top of the derived grid so the
 * amounts (and the global Utilidad row) are never recomputed — filters only decide which
 * rows are visible. Kept pure and out of the components so Vitest can reason about them
 * and `useMemo` can wrap the work. Unchanged subtrees keep their node reference, so the
 * memoized rows don't all re-render when a filter changes.
 */
import type { DatosCell, DatosGrid, DatosRow } from "./datos-types";
import { buildAccountTree, type AccountNode } from "./derive";
import type { AccountRow } from "./types";

/** One selectable account in the "Cuenta contable" filter. */
export interface AccountOption {
  code: string;
  name: string;
  /** Code segment count: "4.1.1" → 3. Drives the tree indent. */
  level: number;
  /** True when some account nests under this one (gets an expand/collapse chevron). */
  hasChildren: boolean;
}

/** Depth of the deepest movement (leaf) account; the deepest code is always a leaf. */
export function deepestLevel(accounts: AccountRow[]): number {
  return accounts.reduce((max, account) => Math.max(max, account.code.split(".").length), 0);
}

/** Every account (parents included) as a filter option, in file order. */
export function accountOptions(accounts: AccountRow[]): AccountOption[] {
  // A code is a parent iff some account nests under it — by dot-prefix, matching how
  // `buildAccountTree` re-parents orphans onto their nearest existing ancestor.
  const withChildren = new Set<string>();
  for (const account of accounts) {
    for (let prefix = parentPrefix(account.code); prefix !== null; prefix = parentPrefix(prefix)) {
      withChildren.add(prefix);
    }
  }
  return accounts.map((account) => ({
    code: account.code,
    name: account.name,
    level: account.code.split(".").length,
    hasChildren: withChildren.has(account.code),
  }));
}

/**
 * The filter's visible rows for a collapse state: drops any option that has a collapsed
 * ancestor (its subtree is folded). Order preserved; an empty set is a no-op (same reference).
 * Collapse is view-only — a collapsed node stays visible, only its descendants hide.
 */
export function visibleAccountOptions(
  options: AccountOption[],
  collapsed: ReadonlySet<string>,
): AccountOption[] {
  if (collapsed.size === 0) {
    return options;
  }
  return options.filter((option) => !hasCollapsedAncestor(option.code, collapsed));
}

function hasCollapsedAncestor(code: string, collapsed: ReadonlySet<string>): boolean {
  for (let prefix = parentPrefix(code); prefix !== null; prefix = parentPrefix(prefix)) {
    if (collapsed.has(prefix)) {
      return true;
    }
  }
  return false;
}

/** Strips the last dotted segment: "4.1.1" → "4.1"; a root ("4") has no parent. */
function parentPrefix(code: string): string | null {
  const cut = code.lastIndexOf(".");
  return cut === -1 ? null : code.slice(0, cut);
}

/**
 * "Enfocar con contexto": keep the selected accounts with their whole subtree and their
 * ancestor rows as context, pruning unselected sibling branches. An empty selection is a
 * no-op (same reference). `isResult` rows are always kept (the global Utilidad).
 */
export function focusAccounts(rows: DatosRow[], selected: ReadonlySet<string>): DatosRow[] {
  if (selected.size === 0) {
    return rows;
  }
  const out: DatosRow[] = [];
  for (const row of rows) {
    if (row.isResult) {
      out.push(row);
      continue;
    }
    const kept = keepFocused(row, selected, false);
    if (kept) {
      out.push(kept);
    }
  }
  return out;
}

function keepFocused(
  node: DatosRow,
  selected: ReadonlySet<string>,
  ancestorSelected: boolean,
): DatosRow | null {
  if (ancestorSelected || selected.has(node.code)) {
    return node; // whole subtree kept, reference preserved
  }
  if (!node.children?.length) {
    return null;
  }
  const keptChildren: DatosRow[] = [];
  for (const child of node.children) {
    const kept = keepFocused(child, selected, false);
    if (kept) {
      keptChildren.push(kept);
    }
  }
  return keptChildren.length > 0 ? { ...node, children: keptChildren } : null;
}
/**
 * Checks if a row has movement based on values, comments, or edits. A `null` cell is treated as 0.
 * Filters cells by `positions` if provided, otherwise checks all cells.
 */
export function hasMovement(row: DatosRow, positions: readonly number[] | null): boolean {
  if (positions === null) {
    return row.cells.some(moves);
  }
  return positions.some((position) => {
    const cell = row.cells[position];
    return cell !== undefined && moves(cell);
  });
}

function moves(cell: DatosCell): boolean {
  return (cell.value ?? 0) !== 0 || Boolean(cell.comment) || cell.edited === true;
}

/**
 * Removes branches with no movement. Keeps `isResult` rows and parents with active children.
 * Preserves references for unchanged subtrees.
 */
export function pruneEmptyAccounts(
  rows: DatosRow[],
  positions: readonly number[] | null,
): DatosRow[] {
  const out: DatosRow[] = [];
  let changed = false;
  for (const row of rows) {
    const kept = keepWithMovement(row, positions);
    if (kept !== null) {
      out.push(kept);
    }
    changed ||= kept !== row;
  }
  return changed ? out : rows;
}

function keepWithMovement(node: DatosRow, positions: readonly number[] | null): DatosRow | null {
  if (node.isResult) {
    return node;
  }
  if (!node.children?.length) {
    return hasMovement(node, positions) ? node : null;
  }
  const children = pruneEmptyAccounts(node.children, positions);
  if (children === node.children) {
    return node;
  }
  if (children.length > 0) {
    return { ...node, children };
  }
  return hasMovement(node, positions) ? { ...node, children } : null;
}

/**
 * Identifies columns with movement based on `positions`. Returns the original array if all columns move.
 */
export function movingColumnPositions(
  rows: readonly DatosRow[],
  positions: readonly number[],
): readonly number[] {
  const moving = new Set<number>();
  const walk = (list: readonly DatosRow[]): void => {
    for (const row of list) {
      if (moving.size === positions.length) {
        return;
      }
      for (const position of positions) {
        const cell = row.cells[position];
        if (!moving.has(position) && cell !== undefined && moves(cell)) {
          moving.add(position);
        }
      }
      if (row.children) {
        walk(row.children);
      }
    }
  };
  walk(rows);
  return moving.size === positions.length
    ? positions
    : positions.filter((position) => moving.has(position));
}

/**
 * Finds account codes with no movement across all grids. Ensures alignment across sheets.
 */
export function emptyAccountCodes(grids: readonly DatosGrid[]): Set<string> {
  const all = new Set<string>();
  const kept = new Set<string>();
  for (const grid of grids) {
    collectCodes(grid.rows, all);
    collectCodes(pruneEmptyAccounts(grid.rows, null), kept);
  }
  for (const code of kept) {
    all.delete(code);
  }
  return all;
}

function collectCodes(rows: readonly DatosRow[], out: Set<string>): void {
  for (const row of rows) {
    if (!row.isResult) {
      out.add(row.code);
    }
    if (row.children) {
      collectCodes(row.children, out);
    }
  }
}

/**
 * Codes to collapse so the tree shows expanded down to `level`: every parent node at
 * `level >= level` (its children hide). "Todo"/fully-expanded is an empty set (handled by
 * the caller), never this function.
 */
export function collapsedForLevel(accounts: AccountRow[], level: number): Set<string> {
  const { roots } = buildAccountTree(accounts);
  const out = new Set<string>();
  const walk = (nodes: AccountNode[]) => {
    for (const node of nodes) {
      if (node.children.length > 0) {
        if (node.level >= level) {
          out.add(node.code);
        }
        walk(node.children);
      }
    }
  };
  walk(roots);
  return out;
}

/**
 * Which "Nivel" level (1..deepest) is active for the current collapse state, or null if
 * custom. Level `deepest` is the fully-expanded state (its collapse set is empty, since the
 * deepest accounts are leaves with nothing to collapse); the "Nivel" filter surfaces that as
 * "Todos los niveles".
 */
export function matchExpandLevel(
  accounts: AccountRow[],
  collapsed: ReadonlySet<string>,
  deepest: number,
): number | null {
  for (let level = 1; level <= deepest; level++) {
    if (setsEqual(collapsed, collapsedForLevel(accounts, level))) {
      return level;
    }
  }
  return null;
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }
  return true;
}
