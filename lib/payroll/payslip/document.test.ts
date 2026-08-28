import { describe, expect, it } from "vitest";
import { emptyCapture, toEngineInput } from "../employee-input";
import { computeEmployeePayroll } from "../engine/compute";
import { DEFAULT_PAYROLL_PARAMETERS } from "../engine/parameters";
import type { PayrollEmployeeLine, PayrollMonthlyCapture } from "../types";
import {
  NOT_CONTRIBUTORY_MARK,
  PAYSLIP_FOOTNOTE,
  buildPayslipDocument,
  compareExcelColumns,
  payslipIncomeConcepts,
} from "./document";
import type { PayslipDocument, PayslipRow } from "./types";

/**
 * The real book's employee 6 of MARCH 2026, `GENERAL!36`: the only row of the file with an advance, so
 * it exercises both halves of the payslip. Their record goes here verbatim and the figures come from
 * the ENGINE, not written by hand — what is asserted below is that the payslip the app prints says the
 * same as the accountant's `INDIVIDUAL` sheet.
 */
const SORIA: PayrollEmployeeLine = {
  id: "e6",
  periodId: "p1",
  name: "SORIA CHALA MISHELL FERNANDA",
  role: "RECEPCIONISTA POLIVALENTE CERTIFICADA",
  area: "VENTAS",
  baseSalary: 487.21,
  contractType: "CT",
  idCard: "1723220065",
  hireDate: "2026-02-16",
  sectorCode: "",
  hasReserveFund: false,
  accumulatesReserveFund: false,
  provisionsThirteenth: false,
  provisionsFourteenth: false,
  days: 30,
  capture: { ...emptyCapture(), deductions: { ...emptyCapture().deductions, salaryAdvance: 200 } },
};

/**
 * The same employee with EVERYTHING captured. It is the only case in which the payslip prints its 26
 * rows, so it is where the paper's complete order can be asserted — with the real record only five
 * come out.
 */
const FULL: PayrollEmployeeLine = {
  ...SORIA,
  hasReserveFund: true,
  capture: {
    ...emptyCapture(),
    overtimeHours50: 2,
    overtimeHours100: 3,
    overtimeHours25: 4,
    vacationPay: 10,
    privateInsurance: 11,
    allowances: 12,
    fixedCommission: 13,
    variableCommission: 14,
    bonus: 15,
    deductions: {
      iessLoans: 1,
      unpaidLeave: 2,
      salaryAdvance: 3,
      companyLoans: 4,
      incomeTax: 5,
      meals: 6,
      fines: 7,
      inHouseConsumption: 8,
      solidarityContribution: 9,
      otherDeductions: 10,
      partTimeDeduction: 11,
      medicalLeaveDeduction: 12,
    },
  },
};

function build(line: PayrollEmployeeLine, position = 6): PayslipDocument {
  const capture: PayrollMonthlyCapture = line.capture ?? emptyCapture();
  return buildPayslipDocument({
    line,
    computed: computeEmployeePayroll(toEngineInput(line), DEFAULT_PAYROLL_PARAMETERS),
    capture,
    year: 2026,
    monthIndex: 2,
    clientName: "HOTEL BOUTIQUE CULTURA MANOR",
    position,
  });
}

const row = (rows: readonly PayslipRow[], label: string) => rows.find((r) => r.label === label);

describe("el comprobante del empleado 6 de marzo 2026", () => {
  const doc = build(SORIA);

  it("encabeza como la hoja INDIVIDUAL", () => {
    expect(doc.company).toBe("HOTEL BOUTIQUE CULTURA MANOR");
    expect(doc.title).toBe("ROL DE PAGOS");
    expect(doc.period).toBe("MES: MARZO 2026");
  });

  it("identifica al empleado como el libro", () => {
    expect(doc.codeLine).toBe("Codigo: 6");
    expect(doc.daysLine).toBe("Dias Trabajados: 30");
    expect(doc.employeeName).toBe("SORIA CHALA MISHELL FERNANDA");
    expect(doc.role).toBe("RECEPCIONISTA POLIVALENTE CERTIFICADA");
    // `G7` concatenates the raw number: a zero comes out `FR=0`, not `FR=-`.
    expect(doc.reserveFundLine).toBe("FR=0");
    expect(doc.idCardLine).toBe("C.C. 1723220065");
  });

  it("trae las cifras del archivo, al centavo", () => {
    expect(row(doc.incomes, "SUELDO UNIFICADO")?.value).toBe("$487.21");
    expect(row(doc.incomes, "DECIMO IV SUELDO-MENSUAL")?.value).toBe("$40.17");
    expect(row(doc.incomes, "DECIMO III SUELDO-MENSUAL")?.value).toBe("$40.60");
    expect(row(doc.deductions, "APORTES AL IESS")?.value).toBe("$46.04");
    expect(row(doc.deductions, "ANTICIPO SUELDO")?.value).toBe("$200.00");
  });

  it("cierra con los tres totales en $", () => {
    expect(doc.totalIncome).toBe("$567.98");
    expect(doc.totalDeductions).toBe("$246.04");
    // `AP36` stores 321.94000000000005 — the engine does not round its totals and the payslip does.
    expect(doc.netPay).toBe("$321.94");
  });

  it("marca con (*) el fondo de reserva y el bono, y nada más", () => {
    const full = build(FULL);
    const marked = full.incomes.filter((r) => r.quantity === "(*)").map((r) => r.label);
    expect(marked).toEqual(["FONDO DE RESERVA", "BONO CUMPLIMIENTO"]);
    expect(full.deductions.every((r) => r.quantity === null)).toBe(true);
  });
});

describe("qué filas se imprimen", () => {
  it("solo las que traen importe", () => {
    // SORIA's real record: salary, the two décimos, the IESS contribution and their advance. The
    // other twenty-one are zero and take up no line.
    expect(build(SORIA).incomes.map((r) => r.label)).toEqual([
      "SUELDO UNIFICADO",
      "DECIMO IV SUELDO-MENSUAL",
      "DECIMO III SUELDO-MENSUAL",
    ]);
    expect(build(SORIA).deductions.map((r) => r.label)).toEqual([
      "APORTES AL IESS",
      "ANTICIPO SUELDO",
    ]);
  });

  it("ninguna fila sale con raya ni en cero", () => {
    const doc = build(SORIA);
    for (const line of [...doc.incomes, ...doc.deductions]) {
      expect(line.value, line.label).not.toBe("-");
      expect(line.value, line.label).not.toBe("$0.00");
    }
  });

  it("sin nada capturado quedan solo las cuatro que el motor deriva", () => {
    const doc = build({ ...SORIA, capture: undefined });
    expect(doc.incomes.map((r) => r.label)).toEqual([
      "SUELDO UNIFICADO",
      "DECIMO IV SUELDO-MENSUAL",
      "DECIMO III SUELDO-MENSUAL",
    ]);
    expect(doc.deductions.map((r) => r.label)).toEqual(["APORTES AL IESS"]);
  });

  it("con todo capturado vuelven las 26", () => {
    const doc = build(FULL);
    expect(doc.incomes).toHaveLength(13);
    expect(doc.deductions).toHaveLength(13);
  });

  it("un total en cero SÍ es una cifra: no se esconde", () => {
    // What is omitted are ROWS. A total is a claim about the month —«nothing was deducted from
    // them»— and hiding it would make it look like a missing datum.
    const doc = build({ ...SORIA, capture: undefined, baseSalary: 0, days: 0 });
    expect(doc.deductions).toHaveLength(0);
    expect(doc.totalDeductions).toBe("$0.00");
  });

  it("no imprime las cuatro filas mudas del Excel", () => {
    const doc = build(FULL);
    const labels = doc.deductions.map((r) => r.label);
    expect(labels.indexOf("Descuento PERMISO MEDICO")).toBe(
      labels.indexOf("DESCUENTO TIEMPO PACIAL") + 1,
    );
    expect(labels.every((label) => label.trim() !== "")).toBe(true);
  });
});

describe("la nota al pie sigue a la marca que explica", () => {
  it("sale cuando alguna fila impresa lleva (*)", () => {
    expect(build(FULL).footnote).toBe("(*) No aporta IESS ni es Ingreso Gravado");
  });

  it("no sale cuando el fondo de reserva y el bono se quedaron fuera", () => {
    // They are the two rows that are zero most often: a footnote clarifying an absent `(*)` sends the
    // reader hunting the sheet for something that is not there.
    const doc = build(SORIA);
    expect(doc.incomes.some((r) => r.quantity === "(*)")).toBe(false);
    expect(doc.footnote).toBeNull();
  });
});

describe("el orden es el de columnas del libro, no el del catálogo", () => {
  it("los ingresos van F, J, K, L, N, O, P, Q, R, S, T, U, V", () => {
    expect(payslipIncomeConcepts().map((c) => c.column)).toEqual([
      "F",
      "J",
      "K",
      "L",
      "N",
      "O",
      "P",
      "Q",
      "R",
      "S",
      "T",
      "U",
      "V",
    ]);
  });

  it("el fondo de reserva es DUODÉCIMO en el papel y séptimo en la pantalla", () => {
    const doc = build(FULL);
    expect(doc.incomes.map((r) => r.label).indexOf("FONDO DE RESERVA")).toBe(11);
    expect(doc.incomes[10].label).toBe("COMISION VARIABLE");
  });

  it("los egresos arrancan en el aporte y terminan en el permiso médico", () => {
    const doc = build(FULL);
    expect(doc.deductions[0].label).toBe("APORTES AL IESS");
    expect(doc.deductions[12].label).toBe("Descuento PERMISO MEDICO");
  });

  it("omitir filas no reordena las que quedan", () => {
    // The order is the paper's, not that of whatever survived: SORIA's three come out in the same
    // relative positions they occupy with everything captured.
    const printed = build(SORIA).incomes.map((r) => r.label);
    const all = build(FULL).incomes.map((r) => r.label);
    expect(printed).toEqual(all.filter((label) => printed.includes(label)));
  });

  it("una columna de dos letras va DESPUÉS de una de una", () => {
    // Without the length rule, a plain alphabetical order would put `AA` before `Z` and the
    // deductions block would come out backwards.
    expect(["AB", "Z", "AA"].sort(compareExcelColumns)).toEqual(["Z", "AA", "AB"]);
  });
});

describe("las horas extras", () => {
  it("salen enteras aunque Gerencia apruebe menos", () => {
    // `approvedOvertime` trims what ADDS UP, not what is shown: the row still declares the hours
    // worked and their whole value, and the trim shows in the total.
    const line: PayrollEmployeeLine = {
      ...SORIA,
      capture: { ...emptyCapture(), overtimeHours50: 5, approvedOvertime: 0 },
    };
    const doc = build(line);
    const extras = row(doc.incomes, "VALOR GANADO EXTRAS 50%");
    expect(extras?.quantity).toBe("5");
    expect(extras?.value).not.toBe("-");
    expect(doc.totalIncome).toBe("$567.98");
  });

  it("sin horas no hay fila que imprimir", () => {
    // With no hours the row is worth zero, and a row at zero no longer takes up a line: that is why
    // the `Cantidad` column has no case for zero anywhere.
    const doc = build({ ...SORIA, capture: undefined });
    expect(row(doc.incomes, "VALOR GANADO EXTRAS 100%")).toBeUndefined();
  });
});

describe("las filas de bono del empleado", () => {
  const APORTABLE = { id: "x1", label: "Movilización", kind: "aportable" as const };
  const NO_APORTABLE = { id: "x2", label: "Alimentación", kind: "noAportable" as const };

  const buildWith = (
    extras: readonly { id: string; label: string; kind: "aportable" | "noAportable" }[],
    amounts: Record<string, number>,
  ) => {
    const line: PayrollEmployeeLine = {
      ...FULL,
      capture: {
        ...(FULL.capture ?? emptyCapture()),
        extras: extras.map((row) => ({ ...row, amount: amounts[row.id] ?? 0 })),
      },
    };
    return buildPayslipDocument({
      line,
      computed: computeEmployeePayroll(toEngineInput(line), DEFAULT_PAYROLL_PARAMETERS),
      capture: line.capture ?? emptyCapture(),
      year: 2026,
      monthIndex: 2,
      clientName: "HOTEL BOUTIQUE CULTURA MANOR",
      position: 6,
    });
  };

  it("imprime el rótulo que el empleado le puso, en mayúsculas", () => {
    const document = buildWith([APORTABLE], { x1: 45 });
    const row = document.incomes.find((entry) => entry.label === "MOVILIZACIÓN");
    expect(row).toBeDefined();
    expect(row?.value).toBe("$45.00");
  });

  it("el NO aportable lleva el (*) y el aportable no", () => {
    const document = buildWith([APORTABLE, NO_APORTABLE], { x1: 45, x2: 30 });
    const aportable = document.incomes.find((entry) => entry.label === "MOVILIZACIÓN");
    const noAportable = document.incomes.find((entry) => entry.label === "ALIMENTACIÓN");

    expect(noAportable?.quantity).toBe(NOT_CONTRIBUTORY_MARK);
    expect(aportable?.quantity).toBeNull();
  });

  it("un no aportable enciende la nota al pie aunque el bono y el FR estén en cero", () => {
    expect(buildWith([NO_APORTABLE], { x2: 30 }).footnote).toBe(PAYSLIP_FOOTNOTE);
  });

  it("uno en cero no produce fila", () => {
    const document = buildWith([APORTABLE], { x1: 0 });
    expect(document.incomes.some((entry) => entry.label === "MOVILIZACIÓN")).toBe(false);
  });

  it("van DETRÁS de las trece filas del catálogo", () => {
    const document = buildWith([APORTABLE], { x1: 45 });
    const last = document.incomes[document.incomes.length - 1];
    expect(last.label).toBe("MOVILIZACIÓN");
  });

  it("sin filas declaradas el comprobante es exactamente el de antes", () => {
    expect(buildWith([], {})).toEqual(build(FULL));
  });

  it("el total de ingresos INCLUYE la fila de bono", () => {
    const amount = (formatted: string) => Number(formatted.replace(/[$,]/g, ""));
    const sin = buildWith([], {});
    const con = buildWith([NO_APORTABLE], { x2: 30 });
    expect(amount(con.totalIncome) - amount(sin.totalIncome)).toBeCloseTo(30, 2);
  });
});

describe("el rótulo propio de una fila del catálogo", () => {
  const withLabels = (labels: Record<string, string>, otherDeductions: number) => {
    const base = FULL.capture ?? emptyCapture();
    const line: PayrollEmployeeLine = {
      ...FULL,
      capture: { ...base, labels, deductions: { ...base.deductions, otherDeductions } },
    };
    return buildPayslipDocument({
      line,
      computed: computeEmployeePayroll(toEngineInput(line), DEFAULT_PAYROLL_PARAMETERS),
      capture: line.capture ?? emptyCapture(),
      year: 2026,
      monthIndex: 2,
      clientName: "HOTEL BOUTIQUE CULTURA MANOR",
      position: 6,
    });
  };

  // The whole reason for `row-labels.ts`: `E-11` is the book's `AH OTROS` column, and a payslip that
  // prints the COLUMN's name does not say what was deducted.
  it("«Otros» se imprime con el nombre del descuento, en mayúsculas", () => {
    const document = withLabels({ "E-11": "Uniformes" }, 36);
    expect(row(document.deductions, "UNIFORMES")?.value).toBe("$36.00");
    expect(row(document.deductions, "OTROS")).toBeUndefined();
  });

  it("sin rótulo propio manda el libro", () => {
    const document = withLabels({}, 36);
    expect(row(document.deductions, "OTROS")?.value).toBe("$36.00");
  });

  it("un rótulo sobre una fila SIN importe no imprime nada: la regla del papel es el importe", () => {
    const document = withLabels({ "E-11": "Uniformes" }, 0);
    expect(row(document.deductions, "UNIFORMES")).toBeUndefined();
  });
});

describe("el membrete del cliente", () => {
  const COMPANY = {
    legalName: "DELICMAR S.A.S.",
    taxId: "1891234567001",
    province: "TUNGURAHUA",
    canton: "AMBATO",
    parish: "AMBATO",
    address: "LUIS ANIBAL GRANJA Y CALLE LIBARDO PARRA",
    phones: "0991045439 - 0958780660",
  };

  const withCompany = buildPayslipDocument({
    line: SORIA,
    computed: computeEmployeePayroll(toEngineInput(SORIA), DEFAULT_PAYROLL_PARAMETERS),
    capture: SORIA.capture ?? emptyCapture(),
    year: 2026,
    monthIndex: 2,
    clientName: "HOTEL BOUTIQUE CULTURA MANOR",
    clientCompany: COMPANY,
    position: 6,
  });

  // The lines arrive COMPOSED, not as fields: it is what makes it impossible for the paper to write
  // the address one way and the Excel another.
  it("baja el perfil a las líneas de `letterheadLines`", () => {
    expect(withCompany.companyLines).toEqual([
      "DELICMAR S.A.S. · RUC 1891234567001",
      "TUNGURAHUA / AMBATO / AMBATO / LUIS ANIBAL GRANJA Y CALLE LIBARDO PARRA",
      "0991045439 - 0958780660",
    ]);
  });

  // The client's name and its razón social are two different things, and the paper writes both.
  it("no toca el nombre del cliente, que sigue siendo la primera línea", () => {
    expect(withCompany.company).toBe("HOTEL BOUTIQUE CULTURA MANOR");
  });

  it("sin perfil no hay líneas", () => {
    expect(build(SORIA).companyLines).toEqual([]);
  });
});
