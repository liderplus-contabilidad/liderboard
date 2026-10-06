/**
 * The Excel-style notes of the flow: which CELL a note hangs from, as a key, and how a patch of
 * notes lands over the ones a flow already has. It is the ONE place a key is composed — the screen
 * asks these functions where to draw a note and the report asks them which note goes in which cell
 * of the Excel, so the two cannot disagree.
 *
 * Captured and derived amounts share the same dated flow note map. Keys identify the cell,
 * never its current amount, so recalculating a total preserves its annotation.
 */

export type PayableNoteField = "priority" | "account" | "payOn" | "urgent" | "pending";

export function balanceNoteKey(accountId: string): string {
  return `balance:${accountId}`;
}

export function overdraftNoteKey(accountId: string): string {
  return `overdraft:${accountId}`;
}

export function payableNoteKey(payableId: string, field: PayableNoteField): string {
  return `payable:${payableId}:${field}`;
}

/**
 * The notes after a patch: a key with text writes it (trimmed), a key with `null` — or with only
 * blanks — removes it. A note is never stored as `""`: an empty cell and a cell without a note are
 * the same thing.
 */
export function applyNotes(
  current: Readonly<Record<string, string>> | undefined,
  patch: Readonly<Record<string, string | null>> | undefined,
): Record<string, string> {
  const next: Record<string, string> = { ...current };
  for (const [key, text] of Object.entries(patch ?? {})) {
    const trimmed = text?.trim() ?? "";
    if (trimmed) {
      next[key] = trimmed;
    } else {
      delete next[key];
    }
  }
  return next;
}

/** Stable report coordinates, shared by screen and exported comments. */
export function figureNoteKey(section: string, row: string, column: string): string {
  return `figure:${JSON.stringify([section, row, column])}`;
}
