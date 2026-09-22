/**
 * The Excel-style notes of the flow: which CELL a note hangs from, as a key, and how a patch of
 * notes lands over the ones a flow already has. It is the ONE place a key is composed — the screen
 * asks these functions where to draw a note and the report asks them which note goes in which cell
 * of the Excel, so the two cannot disagree.
 *
 * Only a cell the flow CAPTURES takes a note: each account's saldo and sobregiro in «Flujo de
 * bancos», and the five working cells of a document in «Pagos marcados» (estado · cuenta · fecha de
 * pago · urgente · pendiente); a derived figure has nothing to annotate. A note whose cell no longer
 * exists (an account removed, a document unmarked or settled) stays in the map but nobody reads it:
 * pruned on read, never cleaned in an effect, and back if the cell comes back on the same date.
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
