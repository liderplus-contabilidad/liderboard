/**
 * Detects a reload's conflicts: a value adjustment sitting on top of a file value that
 * changed. The adjustment is never dropped — it keeps applying — this only reports what the
 * user should look at (see the `pyg-edit-overlay` spec's "Los conflictos de una recarga se
 * detectan y se reportan").
 */
import { MONTHS_FULL_ES } from "@/lib/date";
import type { CellEdit, PygDataset } from "./types";

const SUM_TOLERANCE = 0.011;

export interface ReloadConflict {
  /** The dataset id the offending edit lives on — what a "remove this adjustment" action needs. */
  datasetId: string;
  centerId: string;
  centerName: string;
  code: string;
  accountName: string;
  monthIndex: number;
  previousFileValue: number;
  newFileValue: number;
  adjustmentValue: number;
}

/**
 * `before`/`after` are the workspace's datasets right before and right after applying a
 * batch; `touchedMonths` are the month indices the batch actually wrote. Only value edits
 * (comment-only edits never conflict) on a touched month are checked.
 */
export function detectReloadConflicts(
  before: readonly PygDataset[],
  after: readonly PygDataset[],
  touchedMonths: readonly number[],
  edits: readonly CellEdit[],
): ReloadConflict[] {
  const touched = new Set(touchedMonths);
  const beforeById = new Map(before.map((d) => [d.id, d]));
  const afterById = new Map(after.map((d) => [d.id, d]));

  const conflicts: ReloadConflict[] = [];
  for (const edit of edits) {
    if (edit.value === undefined || !touched.has(edit.monthIndex)) {
      continue;
    }
    const beforeDataset = beforeById.get(edit.datasetId);
    const afterDataset = afterById.get(edit.datasetId);
    if (!beforeDataset || !afterDataset) {
      continue;
    }
    const beforeAccount = beforeDataset.accounts.find((a) => a.code === edit.code);
    const afterAccount = afterDataset.accounts.find((a) => a.code === edit.code);
    const previousFileValue = beforeAccount?.values[edit.monthIndex] ?? 0;
    const newFileValue = afterAccount?.values[edit.monthIndex] ?? 0;
    if (Math.abs(newFileValue - previousFileValue) <= SUM_TOLERANCE) {
      continue;
    }
    conflicts.push({
      datasetId: edit.datasetId,
      centerId: afterDataset.centerId ?? afterDataset.id,
      centerName: afterDataset.costCenterName ?? afterDataset.companyName,
      code: edit.code,
      accountName: afterAccount?.name ?? beforeAccount?.name ?? edit.code,
      monthIndex: edit.monthIndex,
      previousFileValue,
      newFileValue,
      // `null` is an explicit clear-to-zero — the adjustment IS zero, not "no adjustment"
      // (already ruled out above by the `edit.value === undefined` check).
      adjustmentValue: edit.value ?? 0,
    });
  }
  return conflicts;
}

export function describeConflict(conflict: ReloadConflict): string {
  const month = MONTHS_FULL_ES[conflict.monthIndex] ?? `mes ${conflict.monthIndex + 1}`;
  return (
    `${conflict.centerName} · ${conflict.code} ${conflict.accountName} (${month}): ` +
    `el archivo cambió de ${conflict.previousFileValue} a ${conflict.newFileValue}, ` +
    `pero el ajuste sigue en ${conflict.adjustmentValue}.`
  );
}
