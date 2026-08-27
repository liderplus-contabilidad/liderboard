import { describe, expect, it } from "vitest";
import { computeEmployeePayroll } from "./compute";
import { DEFAULT_PAYROLL_PARAMETERS } from "./parameters";
import type { PayrollEmployeeInput } from "./types";

function employee(overrides: Partial<PayrollEmployeeInput> = {}): PayrollEmployeeInput {
  return {
    baseSalary: 480,
    days: 30,
    contractType: "CT",
    hasReserveFund: false,
    accumulatesReserveFund: false,
    overtimeHours50: 0,
    overtimeHours100: 0,
    overtimeHours25: 0,
    approvedOvertime: null,
    vacationPay: 0,
    privateInsurance: 0,
    allowances: 0,
    fixedCommission: 0,
    variableCommission: 0,
    bonus: 0,
    extras: { contributory: 0, nonContributory: 0 },
    deductions: {
      iessLoans: 0,
      unpaidLeave: 0,
      salaryAdvance: 0,
      companyLoans: 0,
      incomeTax: 0,
      meals: 0,
      fines: 0,
      inHouseConsumption: 0,
      solidarityContribution: 0,
      otherDeductions: 0,
      partTimeDeduction: 0,
      medicalLeaveDeduction: 0,
    },
    paid: null,
    flags: {
      provisionsThirteenth: false,
      provisionsFourteenth: false,
    },
    ...overrides,
  };
}

const compute = (overrides: Partial<PayrollEmployeeInput> = {}) =>
  computeEmployeePayroll(employee(overrides), DEFAULT_PAYROLL_PARAMETERS);

describe("sueldo unificado (`F`)", () => {
  it("con 30 días es el sueldo base entero", () => {
    expect(compute({ baseSalary: 487.21 }).unifiedSalary).toBe(487.21);
  });

  it("se prorratea por días trabajados", () => {
    expect(compute({ baseSalary: 480, days: 15 }).unifiedSalary).toBe(240);
    expect(compute({ baseSalary: 487.21, days: 7 }).unifiedSalary).toBe(113.68);
  });

  it("cero días es cero, no el sueldo base", () => {
    expect(compute({ days: 0 }).unifiedSalary).toBe(0);
  });

  it("más de 30 días paga de más — el libro no acota y el motor tampoco debe hacerlo", () => {
    // A 31-day month with 31 paid exists in practice; inventing a cap here would be a rule the
    // accountant's file does not have.
    expect(compute({ baseSalary: 480, days: 31 }).unifiedSalary).toBe(496);
  });
});

describe("horas extras (`J`, `K`, `L`, `M`)", () => {
  it("el valor hora sale del sueldo BASE, no del unificado", () => {
    // At half time the unified salary drops by half, but the overtime hour is paid at the full rate.
    const completo = compute({ baseSalary: 480, days: 30, overtimeHours50: 10 });
    const medio = compute({ baseSalary: 480, days: 15, overtimeHours50: 10 });
    expect(medio.overtimePay50).toBe(completo.overtimePay50);
    expect(medio.overtimePay50).toBe(30); // 480/30/8 = 2 → 2 × 1,5 × 10
  });

  it("cada recargo usa su propio multiplicador", () => {
    const r = compute({
      baseSalary: 480,
      overtimeHours50: 1,
      overtimeHours100: 1,
      overtimeHours25: 1,
    });
    expect(r.overtimePay50).toBe(3); // 2 × 1,5
    expect(r.overtimePay100).toBe(4); // 2 × 2
    expect(r.overtimePay25).toBe(0.5); // 2 × 0.25 — only the premium, see §11.2
  });

  it("acepta fracciones de hora", () => {
    expect(compute({ baseSalary: 487.21, overtimeHours50: 5.5 }).overtimePay50).toBe(16.75);
  });

  it("el total de horas extras es la suma de los tres", () => {
    const r = compute({
      baseSalary: 480,
      overtimeHours50: 1,
      overtimeHours100: 1,
      overtimeHours25: 1,
    });
    expect(r.overtimeTotal).toBe(7.5);
  });
});

describe("`approvedOvertime`: el importe aprobado se TECLEA, no se calcula (§6, §11.1)", () => {
  const conHoras = { baseSalary: 480, overtimeHours50: 10 } as const; // J = 30

  it("sin aprobación tecleada, cuenta todo lo trabajado", () => {
    expect(compute({ ...conHoras, approvedOvertime: null }).overtimeTotal).toBe(30);
  });

  it("un cero tecleado no cuenta nada — es el `*0` del libro", () => {
    expect(compute({ ...conHoras, approvedOvertime: 0 }).overtimeTotal).toBe(0);
  });

  it("un importe tecleado es EXACTAMENTE lo que cuenta", () => {
    // Neither a fraction nor a rule: the number the accountant wrote in `M`.
    expect(compute({ ...conHoras, approvedOvertime: 6.7 }).overtimeTotal).toBe(6.7);
  });

  it("no es un porcentaje: `0.5` son cincuenta centavos, no la mitad", () => {
    // This test exists because the previous model WAS a fraction. If someone reverts it carelessly,
    // it shows here: with `0.5` as a fraction it would give 15.
    expect(compute({ ...conHoras, approvedOvertime: 0.5 }).overtimeTotal).toBe(0.5);
  });

  it("no se acota por arriba: el libro no lo hace y el motor tampoco", () => {
    expect(compute({ ...conHoras, approvedOvertime: 500 }).overtimeTotal).toBe(500);
  });

  it("lo aprobado recorta lo que SUMA, no lo que se muestra", () => {
    // The payslip has to keep saying how many hours they worked and what they are worth, even though
    // only a part of it is recognised this month.
    expect(compute({ ...conHoras, approvedOvertime: 0 }).overtimePay50).toBe(30);
    expect(compute({ ...conHoras, approvedOvertime: 6.7 }).overtimePay50).toBe(30);
  });

  it("arrastra TODA la cascada, no solo el total ingreso", () => {
    const todo = compute({ ...conHoras, approvedOvertime: null });
    const parte = compute({ ...conHoras, approvedOvertime: 15 });
    const nada = compute({ ...conHoras, approvedOvertime: 0 });

    // It moves the IESS contribution, the décimo tercero and the employer provisions, not just the
    // figure the employee receives.
    for (const key of [
      "grossIncome",
      "iessEmployee",
      "thirteenthMonthly",
      "iessEmployer",
      "vacationProvision",
      "employerCost",
    ] as const) {
      expect(parte[key]).toBeLessThan(todo[key]);
      expect(parte[key]).toBeGreaterThan(nada[key]);
    }
  });

  it("sin horas extras, lo aprobado no cambia nada", () => {
    expect(compute({ baseSalary: 480, approvedOvertime: 0 })).toEqual(
      compute({ baseSalary: 480, approvedOvertime: null }),
    );
  });
});

describe("décimo cuarto mensualizado (`N`)", () => {
  it("es el SBU repartido en el año, por días trabajados", () => {
    expect(compute({ days: 30 }).fourteenthMonthly).toBe(40.17); // 482/360×30
  });

  it("no depende del sueldo del empleado sino del SBU", () => {
    expect(compute({ baseSalary: 480 }).fourteenthMonthly).toBe(
      compute({ baseSalary: 1200 }).fourteenthMonthly,
    );
  });

  it("el contrato a tiempo parcial cobra la mitad", () => {
    expect(compute({ contractType: "TP" }).fourteenthMonthly).toBe(20.08);
  });

  it("se prorratea por días", () => {
    expect(compute({ days: 15 }).fourteenthMonthly).toBe(20.08);
  });
});

describe("décimo tercero mensualizado (`O`)", () => {
  it("es un doceavo de su base", () => {
    expect(compute({ baseSalary: 487.21 }).thirteenthMonthly).toBe(40.6);
  });

  it("las vacaciones mensualizadas NO entran — es la trampa de esta base", () => {
    const sin = compute({ baseSalary: 480 });
    const con = compute({ baseSalary: 480, vacationPay: 120 });
    expect(con.thirteenthMonthly).toBe(sin.thirteenthMonthly);
  });

  it("el seguro privado y las comisiones SÍ entran", () => {
    expect(compute({ baseSalary: 480, privateInsurance: 120 }).thirteenthMonthly).toBe(50);
    expect(compute({ baseSalary: 480, fixedCommission: 120 }).thirteenthMonthly).toBe(50);
  });
});

describe("fondo de reserva: las dos banderas (§7)", () => {
  // ⚠️ NONE of these branches is exercised in the real file: the six employees of March 2026 bring
  // `FR = "N"`. They are written against the book's formula and remain UNCONFIRMED.
  it("sin derecho, no genera nada por ninguna vía", () => {
    const r = compute({ baseSalary: 480, hasReserveFund: false, accumulatesReserveFund: false });
    expect(r.reserveFundPaid).toBe(0);
    expect(r.reserveFundAccrued).toBe(0);
  });

  it("sin derecho, «acumula» no lo resucita", () => {
    const r = compute({ baseSalary: 480, hasReserveFund: false, accumulatesReserveFund: true });
    expect(r.reserveFundPaid).toBe(0);
    expect(r.reserveFundAccrued).toBe(0);
  });

  it("con derecho y sin acumular, lo cobra como INGRESO", () => {
    const r = compute({ baseSalary: 480, hasReserveFund: true, accumulatesReserveFund: false });
    expect(r.reserveFundPaid).toBe(40); // 480/12
    expect(r.reserveFundAccrued).toBe(0);
    expect(r.grossIncome).toBeGreaterThan(compute({ baseSalary: 480 }).grossIncome);
  });

  it("con derecho y acumulando, lo genera como COSTO PATRONAL y no lo ve en su líquido", () => {
    const r = compute({ baseSalary: 480, hasReserveFund: true, accumulatesReserveFund: true });
    expect(r.reserveFundPaid).toBe(0);
    expect(r.reserveFundAccrued).toBe(39.98); // 480 × 8,33 %
    expect(r.netPay).toBe(compute({ baseSalary: 480 }).netPay);
    expect(r.employerCost).toBeGreaterThan(compute({ baseSalary: 480 }).employerCost);
  });

  it("las dos ramas NO dan lo mismo: /12 y ×8,33 % difieren en centavos (§8)", () => {
    const pagado = compute({
      baseSalary: 487.21,
      hasReserveFund: true,
      accumulatesReserveFund: false,
    });
    const acumulado = compute({
      baseSalary: 487.21,
      hasReserveFund: true,
      accumulatesReserveFund: true,
    });
    expect(pagado.reserveFundPaid).toBe(40.6);
    expect(acumulado.reserveFundAccrued).toBe(40.58);
  });

  it("el fondo de reserva pagado NO es base de nada: no mueve el aporte ni el décimo", () => {
    const sin = compute({ baseSalary: 480 });
    const con = compute({ baseSalary: 480, hasReserveFund: true });
    expect(con.iessEmployee).toBe(sin.iessEmployee);
    expect(con.thirteenthMonthly).toBe(sin.thirteenthMonthly);
  });
});

describe("aportes al IESS (`X`, `AU`)", () => {
  it("personal y patronal comparten base y difieren solo en la tasa", () => {
    const r = compute({ baseSalary: 487.21 });
    expect(r.iessEmployee).toBe(46.04); // 9,45 %
    expect(r.iessEmployer).toBe(59.2); // 12,15 %
  });

  it("el bono NO se aporta", () => {
    const sin = compute({ baseSalary: 480 });
    const con = compute({ baseSalary: 480, bonus: 500 });
    expect(con.iessEmployee).toBe(sin.iessEmployee);
    expect(con.grossIncome).toBeGreaterThan(sin.grossIncome);
  });
});

describe("egresos y líquido (`AO`, `AP`)", () => {
  it("el total de egresos es el aporte personal más lo capturado", () => {
    const r = compute({
      baseSalary: 480,
      deductions: { ...employee().deductions, iessLoans: 64.25, salaryAdvance: 200 },
    });
    expect(r.totalDeductions).toBe(r.iessEmployee + 64.25 + 200);
  });

  it("el líquido es ingresos menos egresos", () => {
    const r = compute({ baseSalary: 480 });
    expect(r.netPay).toBe(r.grossIncome - r.totalDeductions);
  });

  it("un líquido negativo no se acota: si le descuentan de más, lo dice", () => {
    const r = compute({
      baseSalary: 480,
      deductions: { ...employee().deductions, salaryAdvance: 10_000 },
    });
    expect(r.netPay).toBeLessThan(0);
  });
});

describe("provisión y costo empresa (`AX`, `AY`)", () => {
  it("con las provisiones de décimos apagadas, la provisión es patronal + vacaciones", () => {
    const r = compute({ baseSalary: 487.21 });
    expect(r.thirteenthProvision).toBe(0);
    expect(r.fourteenthProvision).toBe(0);
    expect(r.totalProvision).toBe(r.iessEmployer + r.vacationProvision);
    expect(r.totalProvision).toBe(81.17);
  });

  it("encendidas, los décimos vuelven a la provisión", () => {
    const r = compute({
      baseSalary: 487.21,
      flags: {
        provisionsThirteenth: true,
        provisionsFourteenth: true,
      },
    });
    expect(r.thirteenthProvision).toBeGreaterThan(0);
    expect(r.fourteenthProvision).toBeGreaterThan(0);
  });

  it("el costo empresa es el total ingreso más la provisión", () => {
    const r = compute({ baseSalary: 487.21 });
    expect(r.employerCost).toBe(r.grossIncome + r.totalProvision);
    expect(r.employerCost).toBe(649.15);
  });

  it("los egresos del empleado NO bajan el costo de la empresa", () => {
    const sin = compute({ baseSalary: 480 });
    const con = compute({
      baseSalary: 480,
      deductions: { ...employee().deductions, salaryAdvance: 200 },
    });
    expect(con.employerCost).toBe(sin.employerCost);
    expect(con.netPay).toBeLessThan(sin.netPay);
  });
});

describe("conciliación (`CA`)", () => {
  it("sin PAGADO declarado la diferencia es null, no cero", () => {
    expect(compute({ paid: null }).difference).toBeNull();
  });

  it("con PAGADO igual al líquido, la diferencia es cero", () => {
    const r = compute({ baseSalary: 480 });
    expect(
      computeEmployeePayroll(
        employee({ baseSalary: 480, paid: r.netPay }),
        DEFAULT_PAYROLL_PARAMETERS,
      ).difference,
    ).toBe(0);
  });

  it("con PAGADO de más, la diferencia es negativa", () => {
    const r = compute({ baseSalary: 480, paid: 1000 });
    expect(r.difference).toBeLessThan(0);
  });

  // MORALES' case: their net pay is the difference of two unrounded sums and arrives with noise.
  const morales = {
    baseSalary: 487.21,
    deductions: { ...employee().deductions, iessLoans: 64.25 },
  };

  it("el ruido por debajo del centavo colapsa a CERO exacto", () => {
    // What was paid is typed with two decimals. Without this rule the five reconciled employees of
    // the file would come out «with a difference» by 5.7e-14 and the screen would say exactly the
    // opposite of what the Excel says.
    expect(compute(morales).netPay).toBe(457.69000000000005);
    expect(compute({ ...morales, paid: 457.69 }).difference).toBe(0);
  });

  it("un CENTAVO sí es una diferencia, y conserva su ruido intacto", () => {
    // The tolerance is only for the noise: it cannot swallow a real difference or round it, because
    // the file stores its own with noise —VEGA's is `-41.70999999999992`— and the engine has to
    // square with that.
    const conDiferencia = compute({ ...morales, paid: 457.68 });
    expect(conDiferencia.difference).not.toBe(0);
    expect(conDiferencia.difference).toBeCloseTo(0.01, 10);
    expect(conDiferencia.difference).not.toBe(0.01);
  });
});

describe("redondeo: las derivaciones redondean, los totales NO (§9)", () => {
  it("cada derivación llega ya con dos decimales", () => {
    const r = compute({ baseSalary: 487.21, overtimeHours50: 5.5 });
    for (const value of [
      r.unifiedSalary,
      r.overtimePay50,
      r.fourteenthMonthly,
      r.thirteenthMonthly,
      r.iessEmployee,
      r.iessEmployer,
      r.vacationProvision,
    ]) {
      expect(value).toBe(Math.round(value * 100) / 100);
    }
  });

  it("los totales arrastran el ruido de coma flotante, como el archivo", () => {
    // It is not a defect: it is what makes the app and the accountant's Excel say the same thing.
    const r = compute({ baseSalary: 488.66 });
    expect(r.grossIncome).toBe(569.5500000000001);
  });
});

/**
 * The proof that the TWO CLASSES mean what they say, against the whole engine and not just against
 * the bases: `bases.test.ts` already declares which bases each one enters, but what the firm reviews
 * are the twenty columns, and between a base and a column there is a rounding and a parameter.
 */
describe("conceptos de ingreso extra: aportable contra no aportable", () => {
  const CONTRIBUTORY_COLUMNS = [
    "iessEmployee",
    "iessEmployer",
    "thirteenthMonthly",
    "vacationProvision",
    "grossIncome",
  ] as const;

  it("sin conceptos declarados no cambia ninguna columna", () => {
    const sin = compute({ baseSalary: 487.21 });
    const conCero = compute({
      baseSalary: 487.21,
      extras: { contributory: 0, nonContributory: 0 },
    });
    expect(conCero).toEqual(sin);
  });

  it("un APORTABLE mueve las columnas que dependen de la base aportable", () => {
    const sin = compute({ baseSalary: 480 });
    const con = compute({ baseSalary: 480, extras: { contributory: 100, nonContributory: 0 } });

    for (const column of CONTRIBUTORY_COLUMNS) {
      expect(con[column]).toBeGreaterThan(sin[column]);
    }
    // The personal contribution is the contributory base times 9.45 %: 100 more of base is 9.45 more.
    expect(con.iessEmployee - sin.iessEmployee).toBeCloseTo(9.45, 10);
    expect(con.grossIncome - sin.grossIncome).toBeCloseTo(
      100 + (con.thirteenthMonthly - sin.thirteenthMonthly),
      10,
    );
  });

  it("un NO APORTABLE mueve el total y NADA más", () => {
    const sin = compute({ baseSalary: 480 });
    const con = compute({ baseSalary: 480, extras: { contributory: 0, nonContributory: 100 } });

    expect(con.grossIncome - sin.grossIncome).toBeCloseTo(100, 10);
    expect(con.iessEmployee).toBe(sin.iessEmployee);
    expect(con.iessEmployer).toBe(sin.iessEmployer);
    expect(con.thirteenthMonthly).toBe(sin.thirteenthMonthly);
    expect(con.vacationProvision).toBe(sin.vacationProvision);
    expect(con.reserveFundAccrued).toBe(sin.reserveFundAccrued);
  });

  it("el no aportable llega íntegro al líquido; el aportable llega menos su aporte", () => {
    const sin = compute({ baseSalary: 480 });
    const noAportable = compute({
      baseSalary: 480,
      extras: { contributory: 0, nonContributory: 100 },
    });
    const aportable = compute({
      baseSalary: 480,
      extras: { contributory: 100, nonContributory: 0 },
    });

    expect(noAportable.netPay - sin.netPay).toBeCloseTo(100, 10);
    expect(aportable.netPay - sin.netPay).toBeLessThan(100);
  });

  it("el fondo de reserva acumulado también sigue al aportable", () => {
    const ficha = { baseSalary: 480, hasReserveFund: true, accumulatesReserveFund: true };
    const sin = compute(ficha);
    const con = compute({ ...ficha, extras: { contributory: 100, nonContributory: 0 } });

    expect(con.reserveFundAccrued).toBeGreaterThan(sin.reserveFundAccrued);
    expect(
      compute({ ...ficha, extras: { contributory: 0, nonContributory: 100 } }).reserveFundAccrued,
    ).toBe(sin.reserveFundAccrued);
  });
});
