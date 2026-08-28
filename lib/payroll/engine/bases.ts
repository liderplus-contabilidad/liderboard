/**
 * The SIX computation bases of the rol (§2 of `docs/payroll/rol-de-pagos-formulas.md`).
 *
 * The subtlest thing in the accountant's book: each derivation adds a DIFFERENT subset of the income
 * items, and **none of them uses the total** (`W`). They are so alike that one column too many or too
 * few breaks nothing visible — it comes out as a difference of cents against the Excel months later.
 * That is why they live here, named one by one, instead of being written by hand inside each formula
 * of `compute.ts`.
 *
 * Each function declares with a `Pick` exactly which columns it reads. That signature is the
 * specification: if someone adds a new income component, the compiler will not tell them which bases
 * it enters, but `bases.test.ts`'s truth table will.
 *
 * None of them rounds. Rounding belongs to whoever consumes them, because the book rounds each
 * derivation's RESULT, not its base (§9).
 */
import type { IncomeComponents } from "./types";

/** What the five partial bases share: salary, overtime, the four «other payments» that always enter
 *  (viáticos and the two commissions travel together in all of them) and the CONTRIBUTORY extra
 *  concepts the período declares. */
type CoreEarnings = Pick<
  IncomeComponents,
  | "unifiedSalary"
  | "overtimeTotal"
  | "allowances"
  | "fixedCommission"
  | "variableCommission"
  | "contributoryExtras"
>;

/**
 * `contributoryExtras` comes in HERE and not base by base, and that is the whole implementation of «a
 * contributory bonus behaves like viáticos»: this single point is what puts it at once into the
 * personal contribution `X`, the employer one `AU`, décimo III `O`, the vacation provision `AV`, the
 * reserve fund `U`/`AW` and provision XIII `AS`. Spreading it over five addends would be five places
 * to get it wrong, and this file warns above about what one column too many or too few in a base
 * costs.
 */
function core(c: CoreEarnings): number {
  return (
    c.unifiedSalary +
    c.overtimeTotal +
    c.allowances +
    c.fixedCommission +
    c.variableCommission +
    c.contributoryExtras
  );
}

/**
 * `F+M+P+Q+R+S+T` — the base the IESS contribution is computed on (`X` personal, `AU` employer) and
 * that of the reserve fund paid within the month (`U`). It is the widest of the partial ones.
 */
export function contributoryBase(
  c: CoreEarnings & Pick<IncomeComponents, "vacationPay" | "privateInsurance">,
): number {
  return core(c) + c.vacationPay + c.privateInsurance;
}

/**
 * `F+M+Q+R+S+T` — the twelfth that produces the monthly décimo tercero (`O`).
 * It is the contributory one **minus the monthly vacations** (`P`).
 */
export function thirteenthBase(
  c: CoreEarnings & Pick<IncomeComponents, "privateInsurance">,
): number {
  return core(c) + c.privateInsurance;
}

/**
 * `F+M+P+R+S+T` — the one the reserve fund accrues on at the IESS (`AW`).
 * It is the contributory one **minus the private insurance** (`Q`), the opposite of its twin `U`,
 * which does add it.
 */
export function reserveFundAccrualBase(
  c: CoreEarnings & Pick<IncomeComponents, "vacationPay">,
): number {
  return core(c) + c.vacationPay;
}

/**
 * `F+M+N+P+R+S+T` — the vacation provision (`AV`). It is the only partial base that adds the décimo
 * cuarto (`N`), and it does not carry the private insurance either.
 */
export function vacationBase(
  c: CoreEarnings & Pick<IncomeComponents, "fourteenthMonthly" | "vacationPay">,
): number {
  return core(c) + c.fourteenthMonthly + c.vacationPay;
}

/**
 * `F+M+N+O+P+Q+R+S+T` — the décimo tercero provision (`AS`). It is the contributory one **plus the
 * two monthly décimos**, and that is why it is the widest of all the partial ones.
 */
export function thirteenthProvisionBase(
  c: CoreEarnings &
    Pick<
      IncomeComponents,
      "fourteenthMonthly" | "thirteenthMonthly" | "vacationPay" | "privateInsurance"
    >,
): number {
  return contributoryBase(c) + c.fourteenthMonthly + c.thirteenthMonthly;
}

/**
 * `W` · TOTAL INGRESO — the eleven components. It is the ONLY one that adds the paid reserve fund
 * (`U`) and the bonus (`V`): those two are the base of nothing, they only reach the total.
 *
 * Unrounded, just as in the book. That is where the file's `569.5500000000001` comes from (§9).
 *
 * The addends go in the book's COLUMN ORDER (`+F+N+M+P+Q+R+S+T+U+O+V`) and not in the one that would
 * come out of composing `thirteenthProvisionBase() + U + V`, which is the short and exactly
 * equivalent form in exact arithmetic. Since this total is NOT rounded, floating-point addition is
 * not associative: two different orders can drift apart in the last bit, and that bit is exactly what
 * gets compared against the hand-typed `PAGADO`. With the six employees of March 2026 the two orders
 * agree —only `F`, `N` and `O` are non-zero—, so no test would have given it away: that is why it is
 * written explicitly.
 *
 * The two extra-concept aggregates go AT THE END for that same reason read the other way round: they
 * have no column in the book, so there is no order to inherit and their place in the sum is a
 * decision that gets written rather than inherited. With a período that declares none both are worth
 * `0`, and `x + 0 === x` exactly in IEEE-754, so the golden fixture does not move a single bit.
 */
export function grossIncome(c: IncomeComponents): number {
  return (
    c.unifiedSalary +
    c.fourteenthMonthly +
    c.overtimeTotal +
    c.vacationPay +
    c.privateInsurance +
    c.allowances +
    c.fixedCommission +
    c.variableCommission +
    c.reserveFundPaid +
    c.thirteenthMonthly +
    c.bonus +
    c.contributoryExtras +
    c.nonContributoryExtras
  );
}
