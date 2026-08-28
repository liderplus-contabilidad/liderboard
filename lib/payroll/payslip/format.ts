/**
 * THE PAYSLIP'S FORMATS, which are not the app's.
 *
 * Every amount carries **`$`**, the rows included, which in the book go with no symbol and only its
 * three totals carry it (and as `US$`). It is a decision of the firm about their own paper: one
 * single symbol, the same one `formatCurrency` writes throughout the app, so the screen and the
 * payslip do not speak two dialects of the dollar.
 *
 * It lives here and not in `lib/format.ts` for two reasons that still stand:
 *
 * - **Two decimals always.** `formatCurrency` gives whole dollars by default, which in a rol loses
 *   the cents the accountant checks.
 * - **A zero never comes out signed.** The engine does not round its totals (§9 of the formulas
 *   document) and drags floating-point noise; with `formatCurrency`'s rule —`value < 0`— a `-1e-14`
 *   would print `-$0.00` on the net-pay band. Here the sign is judged AFTER rounding to cents.
 *
 * What this file no longer writes is the dash of the book's accounting format
 * (`_(* #,##0.00_);_(* \(#,##0.00\);_(* "-"??_)` of cells `G9:G40`): the payslip OMITS the rows with
 * no amount instead of printing them at zero, so no row zero is left to put a dash on. Who decides
 * that omission is `document.ts`.
 */

/** Ecuador's separators: `,` for the thousands and `.` for the cents — the same reason
 *  `lib/format.ts` is built on `en-US` and not on `es-EC`, which swaps the two. */
const AMOUNT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * A payslip amount: `$487.21`, `$6,704.32`, with the sign in front of the symbol (`-$40.00`), like
 * `formatCurrency`.
 *
 * There is ONE single one for rows and totals. There were two while the rows at zero were printed
 * with a dash and the totals with `$0.00`; now a row at zero is not printed, so the only zero left is
 * a total's —«nothing was deducted from this employee»—, which is a claim about the month and goes as
 * a figure.
 */
export function formatPayslipAmount(value: number): string {
  const formatted = `$${AMOUNT.format(Math.abs(value))}`;
  return Math.round(value * 100) < 0 ? `-${formatted}` : formatted;
}

/** A number of hours from the `Cantidad` column: with no decimals if whole (`5`), with them if not
 *  (`5.50`). It has no case for zero: with no hours the row is worth nothing, and a row with no
 *  amount is no longer printed. */
export function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : AMOUNT.format(value);
}
