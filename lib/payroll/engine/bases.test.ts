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
  contributoryExtras: 0,
  nonContributoryExtras: 0,
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
 * §2 of the document, as a truth table: for each income component, WHICH bases it enters.
 *
 * It is the engine's most valuable test. The six bases are so alike that an error in a single column
 * is invisible reading the code, breaks no obvious total, and comes to light as a difference of cents
 * against the accountant's Excel months later. It is exactly the error the design prototype had: it
 * computed all six over the bare unified salary, and it matched only because in the March 2026 file
 * `P`…`T` are all at zero.
 */
const MEMBERSHIP: Record<keyof IncomeComponents, readonly BaseName[]> = {
  // `F` and `M` are the core: they enter all of them.
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
  // The monthly décimos are neither contributed on nor re-decimalized; the fourteenth does provision
  // vacations.
  fourteenthMonthly: ["vacation", "thirteenthProvision", "gross"],
  thirteenthMonthly: ["thirteenthProvision", "gross"],
  // `P` comes out of décimo III; `Q` comes out of the accrued reserve fund and of vacations.
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
  // `U` and `V` are the base of NOTHING: they only reach the total.
  reserveFundPaid: ["gross"],
  bonus: ["gross"],
  // The extra concepts, which have no column: the contributory one behaves EXACTLY like `R`, `S` and
  // `T` —all six— and the non-contributory one exactly like `U` and `V` —only the total—. This row is
  // the executable definition of what the two classes mean, and the `Record` over
  // `keyof IncomeComponents` is what stops a component being added without declaring it.
  contributoryExtras: [
    "contributory",
    "thirteenth",
    "reserveFundAccrual",
    "vacation",
    "thirteenthProvision",
    "gross",
  ],
  nonContributoryExtras: ["gross"],
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
      contributoryExtras: 2048,
      nonContributoryExtras: 4096,
    };
    // Powers of two: each total identifies unambiguously which addends went in.
    expect(contributoryBase(all)).toBe(1 + 2 + 16 + 32 + 64 + 128 + 256 + 2048);
    expect(thirteenthBase(all)).toBe(1 + 2 + 32 + 64 + 128 + 256 + 2048);
    expect(reserveFundAccrualBase(all)).toBe(1 + 2 + 16 + 64 + 128 + 256 + 2048);
    expect(vacationBase(all)).toBe(1 + 2 + 4 + 16 + 64 + 128 + 256 + 2048);
    expect(thirteenthProvisionBase(all)).toBe(1 + 2 + 4 + 8 + 16 + 32 + 64 + 128 + 256 + 2048);
    expect(grossIncome(all)).toBe(
      1 + 2 + 4 + 8 + 16 + 32 + 64 + 128 + 256 + 512 + 1024 + 2048 + 4096,
    );
  });

  it("una base sin nada vale cero, no NaN", () => {
    for (const name of baseNames) {
      expect(BASES[name](ZERO)).toBe(0);
    }
  });

  it("ninguna base redondea — el redondeo lo pone quien las consume", () => {
    // `contributoryBase` feeds `X` (IESS), which does round. If the base rounded first, the
    // contribution would come out of a different number from the one the book uses.
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
  // MORALES MENA SILVIA JIMENA, March 2026. With `P`…`T` at zero the six bases collapse into `F`,
  // which is precisely why the real file does not tell them apart and why the synthetic tests above
  // are needed.
  const morales: IncomeComponents = {
    ...ZERO,
    unifiedSalary: 487.21,
    overtimeTotal: 0, // switched off by `M15`'s `*0`
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
    expect(contributoryBase(conExtras)).toBe(567.21); // adds P and Q
    expect(thirteenthBase(conExtras)).toBe(517.21); // adds Q, not P
    expect(reserveFundAccrualBase(conExtras)).toBe(537.21); // adds P, not Q
    expect(vacationBase(conExtras)).toBe(577.38); // adds P and N, not Q
  });
});
