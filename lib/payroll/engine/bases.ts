/**
 * Las SEIS bases de cálculo del rol (§2 de `docs/payroll/rol-de-pagos-formulas.md`).
 *
 * Lo más sutil del libro del contador: cada derivación suma un subconjunto DISTINTO de los
 * ingresos, y **ninguna usa el total** (`W`). Se parecen tanto entre sí que una columna de más
 * o de menos no rompe nada visible — sale como una diferencia de céntimos contra el Excel meses
 * después. Por eso viven aquí, nombradas de una en una, en vez de estar escritas a mano dentro
 * de cada fórmula de `compute.ts`.
 *
 * Cada función declara con un `Pick` exactamente qué columnas lee. Esa firma es la
 * especificación: si alguien añade un componente de ingreso nuevo, el compilador no le va a
 * decir en qué bases entra, pero la tabla de verdad de `bases.test.ts` sí.
 *
 * Ninguna redondea. El redondeo es de quien las consume, porque el libro redondea el RESULTADO
 * de cada derivación, no su base (§9).
 */
import type { IncomeComponents } from "./types";

/** Lo que comparten las cinco bases parciales: sueldo, horas extras y los cuatro «otros pagos»
 *  que siempre entran (viáticos y las dos comisiones van juntos en todas). */
type CoreEarnings = Pick<
  IncomeComponents,
  "unifiedSalary" | "overtimeTotal" | "allowances" | "fixedCommission" | "variableCommission"
>;

function core(c: CoreEarnings): number {
  return (
    c.unifiedSalary + c.overtimeTotal + c.allowances + c.fixedCommission + c.variableCommission
  );
}

/**
 * `F+M+P+Q+R+S+T` — la base sobre la que se aporta al IESS (`X` personal, `AU` patronal) y la
 * del fondo de reserva que se paga en el mes (`U`). Es la más ancha de las parciales.
 */
export function contributoryBase(
  c: CoreEarnings & Pick<IncomeComponents, "vacationPay" | "privateInsurance">,
): number {
  return core(c) + c.vacationPay + c.privateInsurance;
}

/**
 * `F+M+Q+R+S+T` — el doceavo que produce el décimo tercero mensualizado (`O`).
 * Es la aportable **menos las vacaciones mensualizadas** (`P`).
 */
export function thirteenthBase(
  c: CoreEarnings & Pick<IncomeComponents, "privateInsurance">,
): number {
  return core(c) + c.privateInsurance;
}

/**
 * `F+M+P+R+S+T` — sobre la que se acumula el fondo de reserva en el IESS (`AW`).
 * Es la aportable **menos el seguro privado** (`Q`), al revés que su gemela `U`, que sí lo suma.
 */
export function reserveFundAccrualBase(
  c: CoreEarnings & Pick<IncomeComponents, "vacationPay">,
): number {
  return core(c) + c.vacationPay;
}

/**
 * `F+M+N+P+R+S+T` — la provisión de vacaciones (`AV`). Es la única base parcial que suma el
 * décimo cuarto (`N`), y tampoco lleva el seguro privado.
 */
export function vacationBase(
  c: CoreEarnings & Pick<IncomeComponents, "fourteenthMonthly" | "vacationPay">,
): number {
  return core(c) + c.fourteenthMonthly + c.vacationPay;
}

/**
 * `F+M+N+O+P+Q+R+S+T` — la provisión del décimo tercero (`AS`). Es la aportable **más los dos
 * décimos mensualizados**, y por eso es la más ancha de todas las parciales.
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
 * `W` · TOTAL INGRESO — los once componentes. Es la ÚNICA que suma el fondo de reserva pagado
 * (`U`) y el bono (`V`): esos dos no son base de nada, solo llegan al total.
 *
 * Sin redondear, igual que en el libro. De ahí sale el `569.5500000000001` del archivo (§9).
 *
 * Los sumandos van en el ORDEN DE COLUMNAS del libro (`+F+N+M+P+Q+R+S+T+U+O+V`) y no en el que
 * saldría de componer `thirteenthProvisionBase() + U + V`, que es la forma corta y equivalente
 * en aritmética exacta. Como este total NO se redondea, la suma en coma flotante no es
 * asociativa: dos órdenes distintos pueden separarse en el último bit, y ese bit es justo lo
 * que se compara contra el `PAGADO` tecleado a mano. Con los seis empleados de marzo 2026 los
 * dos órdenes coinciden —solo `F`, `N` y `O` son distintos de cero—, así que ningún test lo
 * habría delatado: por eso se escribe explícito.
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
    c.bonus
  );
}
