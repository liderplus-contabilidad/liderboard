import { describe, expect, it } from "vitest";
import { emptyCapture, toEngineInput } from "../employee-input";
import { computeEmployeePayroll } from "../engine/compute";
import { DEFAULT_PAYROLL_PARAMETERS } from "../engine/parameters";
import type { PayrollEmployeeLine, PayrollMonthlyCapture } from "../types";
import { buildPayslipDocument, compareExcelColumns, payslipIncomeConcepts } from "./document";
import type { PayslipDocument, PayslipRow } from "./types";

/**
 * El empleado 6 de MARZO 2026 del libro real, `GENERAL!36`: la única fila del archivo con un
 * anticipo, así que ejercita las dos mitades del comprobante. Su ficha va aquí verbatim y las
 * cifras salen del MOTOR, no escritas a mano — lo que se afirma abajo es que el comprobante que
 * la app imprime dice lo mismo que la hoja `INDIVIDUAL` del contador.
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
  days: 30,
  capture: { ...emptyCapture(), deductions: { ...emptyCapture().deductions, salaryAdvance: 200 } },
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
    // `G7` concatena el número crudo: un cero sale `FR=0`, no `FR=-`.
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
    // `AP36` guarda 321.94000000000005 — el motor no redondea sus totales y el comprobante sí.
    expect(doc.netPay).toBe("$321.94");
  });

  it("marca con (*) el fondo de reserva y el bono, y nada más", () => {
    const marked = doc.incomes.filter((r) => r.quantity === "(*)").map((r) => r.label);
    expect(marked).toEqual(["FONDO DE RESERVA", "BONO CUMPLIMIENTO"]);
    expect(doc.deductions.every((r) => r.quantity === null)).toBe(true);
  });
});

describe("qué filas se imprimen", () => {
  it("las 26 siempre, aunque no haya nada capturado", () => {
    const doc = build({ ...SORIA, capture: undefined });
    expect(doc.incomes).toHaveLength(13);
    expect(doc.deductions).toHaveLength(13);
  });

  it("un concepto sin importe sale con raya, no en cero", () => {
    const doc = build({ ...SORIA, capture: undefined });
    expect(row(doc.incomes, "VACACIONES - MENSUAL")?.value).toBe("-");
    expect(row(doc.deductions, "ANTICIPO SUELDO")?.value).toBe("-");
    // Un empleado sin nada capturado imprime veintidós rayas —solo el sueldo, los dos décimos y
    // el aporte al IESS traen cifra— y sigue teniendo sus 26 filas: es un formulario de posición
    // fija, no una lista de lo que hay.
    const dashes = [...doc.incomes, ...doc.deductions].filter((r) => r.value === "-");
    expect(dashes).toHaveLength(22);
  });

  it("no imprime las cuatro filas mudas del Excel", () => {
    const doc = build(SORIA);
    const labels = doc.deductions.map((r) => r.label);
    expect(labels.indexOf("Descuento PERMISO MEDICO")).toBe(
      labels.indexOf("DESCUENTO TIEMPO PACIAL") + 1,
    );
    expect(labels.every((label) => label.trim() !== "")).toBe(true);
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
    const doc = build(SORIA);
    expect(doc.incomes.map((r) => r.label).indexOf("FONDO DE RESERVA")).toBe(11);
    expect(doc.incomes[10].label).toBe("COMISION VARIABLE");
  });

  it("los egresos arrancan en el aporte y terminan en el permiso médico", () => {
    const doc = build(SORIA);
    expect(doc.deductions[0].label).toBe("APORTES AL IESS");
    expect(doc.deductions[12].label).toBe("Descuento PERMISO MEDICO");
  });

  it("una columna de dos letras va DESPUÉS de una de una", () => {
    // Sin la regla de longitud, un orden alfabético a secas pondría `AA` antes que `Z` y el
    // bloque de egresos saldría al revés.
    expect(["AB", "Z", "AA"].sort(compareExcelColumns)).toEqual(["Z", "AA", "AB"]);
  });
});

describe("las horas extras", () => {
  it("salen enteras aunque Gerencia apruebe menos", () => {
    // `approvedOvertime` recorta lo que SUMA, no lo que se muestra: la fila sigue declarando las
    // horas trabajadas y su valor entero, y el recorte se ve en el total.
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

  it("sin horas, la cantidad sale con raya", () => {
    const doc = build({ ...SORIA, capture: undefined });
    expect(row(doc.incomes, "VALOR GANADO EXTRAS 100%")?.quantity).toBe("-");
  });
});
