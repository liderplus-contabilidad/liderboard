/**
 * The nómina copy: pure. `copyRoster` is the ONLY definition of what survives from one período to
 * another and what does not — the operation's boundary, so nobody has to deduce it by reading
 * `db.ts`.
 *
 * WHAT SURVIVES (the record, stable month to month): name, job title, area, base salary, contract
 * type, cédula, hire date, sector code, the two reserve-fund flags (`FR` and `AC FR`) and the two
 * décimo provision ones (`AS` and `AT`) — which belong to the record because they depend on seniority
 * and on a choice of the employee, not on the month. Provisioning the décimos or taking them monthly
 * is the same as accruing the reserve fund or receiving it: it is decided once with each person, and
 * marking it again each month was a sure way for one month to end up with no provision with nothing
 * warning about it.
 *
 * WHAT DOES NOT: everything that lives in `PayrollMonthlyCapture` —overtime (`G`, `H`, `I`), the
 * approved amount (`M`), commissions/viáticos/bonuses (`P`–`V`), advances, fines, loans and other
 * deductions (`Y`–`AN`)— and everything derived (`F` unified salary, `N` décimo IV, `O` décimo III,
 * `W` total income, `X` IESS contribution, `AO`, `AP`…). The former belong to the MONTH and are
 * captured each time; the latter are recomputed by the engine. That is why the copy leaves `capture`
 * ABSENT instead of at zeros: a freshly copied período has not received its file yet, and that
 * distinction is what keeps the screen from painting a complete rol for an empty month.
 *
 * `days` does belong to the month (days paid), but it has a natural default — it is copied as 30 and
 * corrected on capture (a mid-month start, a departure, a leave) — so the copy RESETS it instead of
 * dragging it along.
 *
 * THE EXCEPTION is the BONUS ROWS, which travel with their label and their class and with the amount
 * at ZERO. It does not contradict the boundary: a bonus row is the rol's SHAPE —the column that
 * company names `MOVILIZACION NO APORTABLE` and repeats every month—, and what does not travel is
 * what each employee received in it. Without dragging them, a nómina of forty people with three
 * bonuses would ask for a hundred and twenty manual additions every month.
 *
 * And the CATALOGUE rows' own labels (`labels`) do NOT travel, which is the asymmetry worth having
 * written down: a catalogue row exists in the book with or without a figure and is only VISIBLE if it
 * has one, so dragging its name without its amount would put March's label waiting for April's figure
 * — a «Rotura de vajilla» over a deduction that is not anything yet. A bonus row, on the other hand,
 * exists only by having been declared.
 *
 * That is why a line with bonuses arrives with `capture` PRESENT, empty except for them, where it
 * used to arrive absent. Nothing today tells absent from empty —every reader does
 * `capture ?? emptyCapture()` and the engine treats them alike— and this copy used to live in
 * `db.ts`, outside the only definition of what survives a período.
 */
import { emptyCapture } from "./employee-input";
import type { ParsedPayrollEmployeeLine, PayrollEmployeeLine } from "./types";

const COPIED_DAYS = 30;

export function copyRoster(source: readonly PayrollEmployeeLine[]): ParsedPayrollEmployeeLine[] {
  return source.map((line) => ({
    name: line.name,
    role: line.role,
    area: line.area,
    baseSalary: line.baseSalary,
    contractType: line.contractType,
    idCard: line.idCard,
    hireDate: line.hireDate,
    sectorCode: line.sectorCode,
    hasReserveFund: line.hasReserveFund,
    accumulatesReserveFund: line.accumulatesReserveFund,
    provisionsThirteenth: line.provisionsThirteenth,
    provisionsFourteenth: line.provisionsFourteenth,
    days: COPIED_DAYS,
    ...(line.capture?.extras?.length
      ? {
          capture: {
            ...emptyCapture(),
            extras: line.capture.extras.map((row) => ({ ...row, amount: 0 })),
          },
        }
      : {}),
  }));
}
