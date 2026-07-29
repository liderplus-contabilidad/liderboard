/**
 * Turns a persisted dataset into the materialized source the engine consumes. Every
 * derivation here is `derive.ts`'s — the tree, the leaf edits and the rollups — so the
 * numbers a chart draws are the same ones the Datos table shows.
 */
import {
  applyLeafEdits,
  buildAccountTree,
  computeRollups,
  periodLabels,
  type AccountNode,
} from "../derive";
import type { CellEdit, Frequency, PygDataset } from "../types";
import type { AnalyticsSource } from "./types";

/** Center id for a standalone statement, which carries no cost center of its own. */
export const DEFAULT_CENTER_ID = "default";

/**
 * `coveredIndices` is the workspace's declared coverage (`WorkspaceMeta.loadedMonths`, in
 * either mode now) — when given, it wins outright and the values are never inspected to decide
 * it. Omitting it falls back to value-based inference, kept only for callers with no declared
 * coverage to pass (tests, fixtures) — every real workspace declares one.
 */
export function buildAnalyticsSource(
  dataset: PygDataset,
  edits: CellEdit[] = [],
  coveredIndices?: ReadonlySet<number>,
): AnalyticsSource {
  const { roots } = buildAccountTree(dataset.accounts);
  const rolled = computeRollups(applyLeafEdits(roots, edits));

  const valuesByCode = new Map<string, number[]>();
  const namesByCode = new Map<string, string>();
  const parentByCode = new Map<string, string>();

  const walk = (nodes: AccountNode[], parent: string | null): void => {
    for (const node of nodes) {
      valuesByCode.set(node.code, node.values);
      namesByCode.set(node.code, node.name);
      if (parent !== null) {
        // The tree's parent, not the dot-prefix one: an orphan hangs from its nearest ancestor.
        parentByCode.set(node.code, parent);
      }
      walk(node.children, node.code);
    }
  };
  walk(rolled, null);

  return {
    centerId: dataset.centerId ?? DEFAULT_CENTER_ID,
    centerName: dataset.costCenterName ?? dataset.companyName,
    // A file with no date-range line has no year; 0 keeps the axis usable and comparable.
    year: dataset.year ?? 0,
    baseFrequency: dataset.baseFrequency,
    valuesByCode,
    namesByCode,
    parentByCode,
    coverage: coveredIndices ?? computeCoverage(valuesByCode),
  };
}

/**
 * Coverage is a property of the SOURCE, not of an account: the question is "did the business
 * move in this period?", not "did this account move?". Otherwise every legitimate zero of a
 * seasonal account — most of them in a hotel — would become a hole in the chart.
 */
function computeCoverage(valuesByCode: Map<string, number[]>): ReadonlySet<number> {
  const covered = new Set<number>();
  for (const values of valuesByCode.values()) {
    for (let index = 0; index < values.length; index++) {
      if (values[index] !== 0) {
        covered.add(index);
      }
    }
  }
  return covered;
}

/**
 * Whether a source can be read at `target`. Mirrors what `aggregate` accepts: a monthly base
 * aggregates up to anything, any other base can only render itself. Nothing ever disaggregates.
 */
export function canReexpress(base: Frequency, target: Frequency): boolean {
  return base === target || base === "mensual";
}

/**
 * A coarse period is covered when at least one of the base periods it spans is. The uncovered
 * months are zero, so the SUM never changes — what changes is whether the period gets drawn.
 */
export function aggregateCoverage(
  coverage: ReadonlySet<number>,
  base: Frequency,
  target: Frequency,
): ReadonlySet<number> {
  if (base === target) {
    return new Set(coverage);
  }
  if (base !== "mensual") {
    throw new Error(`No se puede desagregar de ${base} a ${target}.`);
  }
  const span = 12 / periodLabels(target).length;
  const covered = new Set<number>();
  for (const index of coverage) {
    covered.add(Math.floor(index / span));
  }
  return covered;
}
