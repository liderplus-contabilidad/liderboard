/**
 * Profit segmentation rules: the 5.2 subtree is copied as a zeroed root 6 (non-operating
 * expenses), and any amount typed there is discounted from its twin inside 5.2, so the pair
 * always adds up to the uploaded amount.
 *
 * Segmenting is one-way; the presence of root 6 is the flag. Pure — no Dexie, no React.
 */
import type { AccountRow, CellEdit } from "./types";

/** Subtree copied into the non-operating block. */
export const SEGMENT_SOURCE_CODE = "5.2";
/** Root of the non-operating block. */
export const NON_OPERATIONAL_ROOT = "6";

/** Whether a code belongs to the non-operating block. */
export function isNonOperationalCode(code: string): boolean {
  return code === NON_OPERATIONAL_ROOT || code.startsWith(`${NON_OPERATIONAL_ROOT}.`);
}

/** Whether the statement already carries the block. */
export function isSegmented(accounts: AccountRow[]): boolean {
  return accounts.some((account) => isNonOperationalCode(account.code));
}

/** Whether there is still a 5.2 subtree to split out. */
export function canSegment(accounts: AccountRow[]): boolean {
  return !isSegmented(accounts) && accounts.some((account) => account.code === SEGMENT_SOURCE_CODE);
}

/** "5.2" → "6", "5.2.1.1" → "6.1.1"; null outside the source subtree. */
function segmentedCode(code: string): string | null {
  if (code === SEGMENT_SOURCE_CODE) {
    return NON_OPERATIONAL_ROOT;
  }
  if (!code.startsWith(`${SEGMENT_SOURCE_CODE}.`)) {
    return null;
  }
  return `${NON_OPERATIONAL_ROOT}${code.slice(SEGMENT_SOURCE_CODE.length)}`;
}

/** "6" → "5.2", "6.1.1" → "5.2.1.1"; null outside the block. */
export function twinCode(code: string): string | null {
  if (code === NON_OPERATIONAL_ROOT) {
    return SEGMENT_SOURCE_CODE;
  }
  if (!isNonOperationalCode(code)) {
    return null;
  }
  return `${SEGMENT_SOURCE_CODE}${code.slice(NON_OPERATIONAL_ROOT.length)}`;
}

/**
 * Appends the zeroed non-operating block, re-levelled and keeping each account's name.
 * Returns the SAME reference when there is nothing to do, so callers can detect a no-op.
 */
export function segmentAccounts(accounts: AccountRow[]): AccountRow[] {
  if (!canSegment(accounts)) {
    return accounts;
  }
  const block: AccountRow[] = [];
  for (const account of accounts) {
    const code = segmentedCode(account.code);
    if (code === null) {
      continue;
    }
    block.push({ code, name: account.name, values: account.values.map(() => 0) });
  }
  return [...accounts, ...block];
}

/** A cell's current value: its value edit, else the file's. Comment-only edits don't shadow it. */
export function currentValue(
  accounts: AccountRow[],
  edits: CellEdit[],
  code: string,
  monthIndex: number,
): number {
  for (const edit of edits) {
    if (edit.code === code && edit.monthIndex === monthIndex && edit.value !== undefined) {
      return edit.value ?? 0;
    }
  }
  return accounts.find((item) => item.code === code)?.values[monthIndex] ?? 0;
}

/** The paired write on the twin; its existing comment is carried over, not dropped. */
export interface TwinWrite {
  code: string;
  monthIndex: number;
  value: number;
  comment?: string;
}

/**
 * The twin's write for an edit on a non-operating cell; null when nothing is reclassified
 * (comment-only edit, code outside the block, missing twin, or an unchanged value).
 *
 * The discount is by DIFFERENCE against the twin's current value, so manual corrections on 5.2
 * survive and re-editing a cell moves only the delta. Unclamped: over-classifying goes negative.
 */
export function twinWriteFor(
  accounts: AccountRow[],
  edits: CellEdit[],
  code: string,
  monthIndex: number,
  value: number | null | undefined,
): TwinWrite | null {
  if (value === undefined) {
    return null;
  }
  const twin = twinCode(code);
  if (twin === null || !accounts.some((account) => account.code === twin)) {
    return null;
  }
  const previous = currentValue(accounts, edits, code, monthIndex);
  const next = value ?? 0;
  if (next === previous) {
    return null;
  }
  const comment = edits.find(
    (edit) => edit.code === twin && edit.monthIndex === monthIndex && edit.comment,
  )?.comment;
  return {
    code: twin,
    monthIndex,
    value: currentValue(accounts, edits, twin, monthIndex) - (next - previous),
    ...(comment ? { comment } : {}),
  };
}
