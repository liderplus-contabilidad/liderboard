import { describe, expect, it } from "vitest";
import {
  contributoryBase,
  grossIncome,
  reserveFundAccrualBase,
  thirteenthBase,
  thirteenthProvisionBase,
  vacationBase,
} from "./bases";
import type { IncomeComponents } from "./types";

const ZERO: IncomeComponents = {
  unifiedSalary: 0,
  overtimeTotal: 0,
  fourteenthMonthly: 0,
  thirteenthMonthly: 0,
  vacationPay: 0,
  privateInsurance: 0,
  allowances: 0,
  fixedCommission: 0,
  variableCommission: 0,
  reserveFundPaid: 0,
  bonus: 0,
};

const BASES = {
  contributory: contributoryBase,
  thirteenth: thirteenthBase,
  reserveFundAccrual: reserveFundAccrualBase,
  vacation: vacationBase,
  thirteenthProvision: thirteenthProvisionBase,
  gross: grossIncome,
} as const;

type BaseName = keyof typeof BASES;

/**
 * §2 del documento, como tabla de verdad: para cada componente de ingreso, en QUÉ bases entra.
 *
 * Es el test de más valor del motor. Las seis bases se parecen tanto entre sí que un error de
 * una sola columna es invisible leyendo el código, no rompe ningún total obvio, y sale a la luz
 * como una diferencia de céntimos frente al Excel del contador meses después. Es exactamente el
 * error que tenía el prototipo del diseño: calculaba las seis sobre el sueldo unificado a secas,
 * y coincidía solo porque en el archivo de marzo 2026 `P`…`T` están todas en cero.
 */
const MEMBERSHIP: Record<keyof IncomeComponents, readonly BaseName[]> = {
  // `F` y `M` son el núcleo: entran en todas.
  unifiedSalary: [
    "contributory",
    "thirteenth",
    "reserveFundAccrual",
    "vacation",
    "thirteenthProvision",
    "gross",
  ],
  overtimeTotal: [
    "contributory",
    "thirteenth",
    "reserveFundAccrual",
    "vacation",
    "thirteenthProvision",
    "gross",
  ],
  // Los décimos mensualizados no se aportan ni se re-decimalizan; el IV sí provisiona vacaciones.
  fourteenthMonthly: ["vacation", "thirteenthProvision", "gross"],
  thirteenthMonthly: ["thirteenthProvision", "gross"],
  // `P` sale del décimo III; `Q` sale del fondo de reserva acumulado y de vacaciones.
  vacationPay: ["contributory", "reserveFundAccrual", "vacation", "thirteenthProvision", "gross"],
  privateInsurance: ["contributory", "thirteenth", "thirteenthProvision", "gross"],
  allowances: [
    "contributory",
    "thirteenth",
    "reserveFundAccrual",
    "vacation",
    "thirteenthProvision",
    "gross",
  ],
  fixedCommission: [
    "contributory",
    "thirteenth",
    "reserveFundAccrual",
    "vacation",
    "thirteenthProvision",
    "gross",
  ],
  variableCommission: [
    "contributory",
    "thirteenth",
    "reserveFundAccrual",
    "vacation",
    "thirteenthProvision",
    "gross",
  ],
  // `U` y `V` no son base de NADA: solo llegan al total.
  reserveFundPaid: ["gross"],
  bonus: ["gross"],
};

describe("las seis bases de cálculo (§2)", () => {
  const components = Object.keys(MEMBERSHIP) as (keyof IncomeComponents)[];
  const baseNames = Object.keys(BASES) as BaseName[];

  it.each(components)(
    "%s entra exactamente en las bases que le tocan y en ninguna otra",
    (component) => {
      const moved = baseNames.filter((name) => BASES[name]({ ...ZERO, [component]: 100 }) !== 0);
      expect(moved.sort()).toEqual([...MEMBERSHIP[component]].sort());
    },
  );

  it("cada base es la SUMA de sus componentes, no otra cosa", () => {
    const all: IncomeComponents = {
      unifiedSalary: 1,
      overtimeTotal: 2,
      fourteenthMonthly: 4,
      thirteenthMonthly: 8,
      vacationPay: 16,
      privateInsurance: 32,
      allowances: 64,
      fixedCommission: 128,
      variableCommission: 256,
      reserveFundPaid: 512,
      bonus: 1024,
    };
    // Potencias de dos: cada total identifica sin ambigüedad qué sumandos entraron.
    expect(contributoryBase(all)).toBe(1 + 2 + 16 + 32 + 64 + 128 + 256);
    expect(thirteenthBase(all)).toBe(1 + 2 + 32 + 64 + 128 + 256);
    expect(reserveFundAccrualBase(all)).toBe(1 + 2 + 16 + 64 + 128 + 256);
    expect(vacationBase(all)).toBe(1 + 2 + 4 + 16 + 64 + 128 + 256);
    expect(thirteenthProvisionBase(all)).toBe(1 + 2 + 4 + 8 + 16 + 32 + 64 + 128 + 256);
    expect(grossIncome(all)).toBe(1 + 2 + 4 + 8 + 16 + 32 + 64 + 128 + 256 + 512 + 1024);
  });

  it("una base sin nada vale cero, no NaN", () => {
    for (const name of baseNames) {
      expect(BASES[name](ZERO)).toBe(0);
    }
  });

  it("ninguna base redondea — el redondeo lo pone quien las consume", () => {
    // `contributoryBase` alimenta a `X` (IESS), que sí redondea. Si la base redondeara antes,
    // el aporte saldría de un número distinto del que usa el libro.
    expect(contributoryBase({ ...ZERO, unifiedSalary: 0.005, allowances: 0.005 })).toBe(0.01);
    expect(
      grossIncome({
        ...ZERO,
        unifiedSalary: 487.21,
        fourteenthMonthly: 40.17,
        thirteenthMonthly: 40.6,
      }),
    ).toBe(567.98);
  });
});

describe("las bases contra las cifras reales del rol", () => {
  // MORALES MENA SILVIA JIMENA, marzo 2026. Con `P`…`T` en cero las seis bases colapsan a `F`,
  // que es justamente por qué el archivo real no distingue entre ellas y por qué hacen falta
  // los tests sintéticos de arriba.
  const morales: IncomeComponents = {
    ...ZERO,
    unifiedSalary: 487.21,
    overtimeTotal: 0, // apagada por el `*0` de `M15`
    fourteenthMonthly: 40.17,
    thirteenthMonthly: 40.6,
  };

  it("la base aportable de MORALES es su sueldo unificado", () => {
    expect(contributoryBase(morales)).toBe(487.21);
  });

  it("su total ingreso son 567,98 — sin las horas extras", () => {
    expect(grossIncome(morales)).toBe(567.98);
  });

  it("con viáticos y comisiones las bases YA no coinciden entre sí", () => {
    const conExtras: IncomeComponents = { ...morales, vacationPay: 50, privateInsurance: 30 };
    expect(contributoryBase(conExtras)).toBe(567.21); // suma P y Q
    expect(thirteenthBase(conExtras)).toBe(517.21); // suma Q, no P
    expect(reserveFundAccrualBase(conExtras)).toBe(537.21); // suma P, no Q
    expect(vacationBase(conExtras)).toBe(577.38); // suma P y N, no Q
  });
});
