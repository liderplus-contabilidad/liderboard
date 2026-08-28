/**
 * Excel's `ROUND(x, 2)`, which is NOT `Math.round(x * 100) / 100`, and both differences matter
 * because the engine has to square to the cent with the accountant's book:
 *
 * 1. **Halves go AWAY from zero**, not towards +∞. `ROUND(-0.005, 2)` is `-0.01` in Excel;
 *    `Math.round(-0.5)` is `-0`. Almost everything in a rol is positive, but a deduction typed as a
 *    negative would be enough to separate the app from the file.
 * 2. **The binary representation error is absorbed before deciding the half.** `1.005` is not exactly
 *    `1.005` in binary but `1.00499999999999989…`, so `Math.round(1.005 * 100)` gives `100` and the
 *    cent is lost. Excel decides on the DECIMAL number the user sees, not on its binary
 *    approximation, and `toPrecision(15)` —the digits a `double` does guarantee— reconstructs exactly
 *    that.
 *
 * It applies only to the derivations (`F`, `J`…`AW`). The book's totals (`W`, `AO`, `AP`, `AX`, `AY`)
 * are deliberately NOT rounded: see §9 of `docs/payroll/rol-de-pagos-formulas.md`.
 */
export function roundToCents(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  const sign = value < 0 ? -1 : 1;
  const scaled = Number((Math.abs(value) * 100).toPrecision(15));
  const result = (sign * Math.round(scaled)) / 100;
  // `-0` is a legitimate value of this computation and it propagates to the totals; returning it as
  // `0` keeps a cell at zero from printing as «-0.00».
  return result === 0 ? 0 : result;
}
