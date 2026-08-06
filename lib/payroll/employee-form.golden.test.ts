/**
 * Los SEIS empleados del rol de MARZO 2026, dados de alta **por el formulario** en vez de leídos
 * del archivo, y comparados al centavo contra lo que el Excel del contador calcula (§12).
 *
 * `lib/payroll/engine/golden.test.ts` ya prueba el motor contra esas mismas cifras; lo que prueba
 * ESTE archivo es la COSTURA que el alta a mano añade — formulario → `toEmployeeLine` →
 * `toEngineInput` → motor —, que es justo donde un campo mal trasladado no se notaría: la pantalla
 * enseñaría un número plausible y solo el contador lo vería al cuadrar. Por eso recorre el mismo
 * camino que `EmployeeDetailView` (`computeEmployeePayroll(toEngineInput(line), …)`) y no el motor
 * a pelo.
 *
 * Dos empleados llevan además un descuento que el modal de alta no captura (se teclea después, en
 * la ficha): se aplica sobre la captura igual que lo hace esa pantalla.
 */
import { describe, expect, it } from "vitest";
import { emptyEmployeeForm, toEmployeeLine, type EmployeeFormValues } from "./employee-form";
import { emptyCapture, toEngineInput } from "./employee-input";
import { computeEmployeePayroll } from "./engine/compute";
import { DEFAULT_PAYROLL_PARAMETERS } from "./engine/parameters";
import type { CapturedDeductions } from "./engine/types";
import type { PayrollEmployeeLine } from "./types";

interface GoldenCase {
  name: string;
  form: Partial<EmployeeFormValues>;
  /** Lo que se teclea DESPUÉS en la ficha; el alta no lo pide. */
  deductions?: Partial<CapturedDeductions>;
  /** Ausente en los casos que no comparan los cinco totales sino una derivación suelta. */
  expected?: {
    grossIncome: number;
    iessEmployee: number;
    totalDeductions: number;
    netPay: number;
    employerCost: number;
  };
}

/**
 * Las horas extras de MORALES, SANDOVAL COLIMBA y ACOSTA están APAGADAS en el archivo
 * (`approvedOvertime: 0`, el `*0` de §6) y las de los otros tres no hacen falta apagarlas porque no
 * tienen ninguna. VEGA entra sin horas: sus 140 «al 15 %» las anula el propio archivo en la columna
 * `L`, que es la errata de §11.2 y no algo que la app modele.
 */
const GOLDEN: GoldenCase[] = [
  {
    name: "MORALES MENA SILVIA JIMENA",
    form: { baseSalary: 487.21, overtimeHours50: 5.5, approvedOvertime: 0 },
    deductions: { iessLoans: 64.25 },
    expected: {
      grossIncome: 567.98,
      iessEmployee: 46.04,
      totalDeductions: 110.28999999999999,
      netPay: 457.69000000000005,
      employerCost: 649.15,
    },
  },
  {
    name: "VEGA GARCIA MARIANA DE JESUS",
    form: { baseSalary: 482.04 },
    expected: {
      grossIncome: 562.38,
      iessEmployee: 45.55,
      totalDeductions: 45.55,
      netPay: 516.83,
      employerCost: 642.71,
    },
  },
  {
    name: "SANDOVAL COLIMBA PEDRO MANUEL",
    form: { baseSalary: 488.66, overtimeHours50: 26, approvedOvertime: 0 },
    expected: {
      grossIncome: 569.5500000000001,
      iessEmployee: 46.18,
      totalDeductions: 46.18,
      netPay: 523.3700000000001,
      employerCost: 650.95,
    },
  },
  {
    name: "ACOSTA MARIA PASTORA",
    form: { baseSalary: 486.25, overtimeHours50: 13, approvedOvertime: 0 },
    expected: {
      grossIncome: 566.9399999999999,
      iessEmployee: 45.95,
      totalDeductions: 45.95,
      netPay: 520.9899999999999,
      employerCost: 647.9499999999999,
    },
  },
  {
    name: "SANDOVAL ACOSTA LUIS FERNANDO",
    form: { baseSalary: 487.21 },
    expected: {
      grossIncome: 567.98,
      iessEmployee: 46.04,
      totalDeductions: 46.04,
      netPay: 521.94,
      employerCost: 649.15,
    },
  },
  {
    name: "SORIA CHALA MISHELL FERNANDA",
    form: { baseSalary: 487.21 },
    deductions: { salaryAdvance: 200 },
    expected: {
      grossIncome: 567.98,
      iessEmployee: 46.04,
      totalDeductions: 246.04,
      netPay: 321.94000000000005,
      employerCost: 649.15,
    },
  },
];

/** El alta tal como la escribe `db.ts`: la ficha del formulario, con el dueño estampado. */
function registered(entry: GoldenCase): PayrollEmployeeLine {
  const line: PayrollEmployeeLine = {
    ...toEmployeeLine({
      ...emptyEmployeeForm(),
      name: entry.name,
      idCard: "1002030405",
      role: "Camarera",
      area: "HOSPEDAJE",
      ...entry.form,
    }),
    id: "line-1",
    periodId: "period-1",
  };

  if (!entry.deductions) {
    return line;
  }
  // Lo que hace la ficha al teclear un descuento: parte de la captura que haya, o de una vacía.
  const capture = line.capture ?? emptyCapture();
  return {
    ...line,
    capture: { ...capture, deductions: { ...capture.deductions, ...entry.deductions } },
  };
}

function compute(entry: GoldenCase) {
  return computeEmployeePayroll(toEngineInput(registered(entry)), DEFAULT_PAYROLL_PARAMETERS);
}

describe("los seis de MARZO 2026, dados de alta por el formulario", () => {
  for (const entry of GOLDEN) {
    it(`${entry.name} cuadra al centavo`, () => {
      const computed = compute(entry);
      expect({
        grossIncome: computed.grossIncome,
        iessEmployee: computed.iessEmployee,
        totalDeductions: computed.totalDeductions,
        netPay: computed.netPay,
        employerCost: computed.employerCost,
      }).toEqual(entry.expected);
    });
  }
});

describe("las derivaciones que el pie del modal promete que «se generan solas»", () => {
  const morales = GOLDEN[0];

  it("el sueldo unificado con 30 días es el sueldo base", () => {
    expect(compute(morales).unifiedSalary).toBe(487.21);
  });

  it("el décimo cuarto mensualizado es 40.17 en los seis: sale del SBU, no del sueldo", () => {
    for (const entry of GOLDEN) {
      expect(compute(entry).fourteenthMonthly).toBe(40.17);
    }
  });

  it("el décimo tercero mensualizado es el sueldo base entre doce", () => {
    // 487.21 / 12 = 40.6008… → ROUND → 40.60
    expect(compute(morales).thirteenthMonthly).toBe(40.6);
  });
});

describe("bajar los días trabajados a 15", () => {
  // El valor hora sale del sueldo BASE (`D/30/8`), no del unificado: a quien trabajó medio mes su
  // hora extra se le paga a tarifa completa (§4). Es la trampa que un alta a mano podría delatar,
  // porque es el único sitio donde alguien teclea unos días distintos de 30.
  const base: GoldenCase = {
    name: "Media jornada",
    form: { baseSalary: 487.21, overtimeHours50: 5.5, approvedOvertime: null },
  };

  it("parte el sueldo unificado a la mitad", () => {
    expect(compute({ ...base, form: { ...base.form, days: 15 } }).unifiedSalary).toBe(243.61);
    expect(compute(base).unifiedSalary).toBe(487.21);
  });

  it("NO cambia el valor de la hora extra", () => {
    const full = compute(base).overtimePay50;
    expect(compute({ ...base, form: { ...base.form, days: 15 } }).overtimePay50).toBe(full);
    expect(full).toBe(16.75);
  });
});
