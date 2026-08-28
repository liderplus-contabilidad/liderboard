/**
 * Amount-comparison helpers for the Rol de Pagos module. One single definition of «two amounts are
 * the same» so an employee's reconciliation and the journal entry's balance use the same rule.
 */

/**
 * Two amounts are the SAME when they are so TO THE CENT. Exact equality does not serve here and that
 * is not a technicality: in the real rol, the net pay (`AP`) is the result of a formula and arrives
 * with floating-point noise —`457.69000000000005`— while what was paid (`BZ`) is a hand-typed value,
 * `457.69`. Compared with `===`, four of the five reconciled employees of the accountant's file came
 * out «with a difference» by 5.7e-14, and the KPI card said exactly the opposite of what the file
 * says.
 */
export function sameToTheCentavo(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}
