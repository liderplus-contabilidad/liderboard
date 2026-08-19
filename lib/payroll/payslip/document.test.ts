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

/**
 * El mismo empleado con TODO capturado. Es el único caso en el que el comprobante imprime sus 26
 * filas, así que es donde se puede afirmar el orden completo del papel — con la ficha real solo
 * salen cinco.
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
    const full = build(FULL);
    const marked = full.incomes.filter((r) => r.quantity === "(*)").map((r) => r.label);
    expect(marked).toEqual(["FONDO DE RESERVA", "BONO CUMPLIMIENTO"]);
    expect(full.deductions.every((r) => r.quantity === null)).toBe(true);
  });
});

describe("qué filas se imprimen", () => {
  it("solo las que traen importe", () => {
    // La ficha real de SORIA: sueldo, los dos décimos, el aporte al IESS y su anticipo. Las otras
    // veintiuna valen cero y no ocupan renglón.
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
    // Lo omitido son FILAS. Un total es una afirmación sobre el mes —«no se le descontó nada»— y
    // esconderlo lo haría parecer un dato que falta.
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
    // Son las dos filas que más veces valen cero: un pie que aclara un `(*)` ausente manda a
    // buscar en la hoja algo que no está.
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
    // El orden es el del papel, no el de lo que sobrevivió: las tres de SORIA salen en las mismas
    // posiciones relativas que ocupan con todo capturado.
    const printed = build(SORIA).incomes.map((r) => r.label);
    const all = build(FULL).incomes.map((r) => r.label);
    expect(printed).toEqual(all.filter((label) => printed.includes(label)));
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

  it("sin horas no hay fila que imprimir", () => {
    // Sin horas la fila vale cero, y una fila en cero ya no ocupa renglón: por eso la columna
    // `Cantidad` no tiene caso para el cero en ningún sitio.
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

  // El motivo entero de `row-labels.ts`: `E-11` es la columna `AH OTROS` del libro, y un
  // comprobante que imprime el nombre de la COLUMNA no dice qué se descontó.
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

  // Las líneas llegan COMPUESTAS, no como campos: es lo que hace imposible que el papel escriba la
  // dirección de una manera y el Excel de otra.
  it("baja el perfil a las líneas de `letterheadLines`", () => {
    expect(withCompany.companyLines).toEqual([
      "DELICMAR S.A.S. · RUC 1891234567001",
      "TUNGURAHUA / AMBATO / AMBATO / LUIS ANIBAL GRANJA Y CALLE LIBARDO PARRA",
      "0991045439 - 0958780660",
    ]);
  });

  // El nombre del cliente y su razón social son dos cosas distintas, y el papel escribe las dos.
  it("no toca el nombre del cliente, que sigue siendo la primera línea", () => {
    expect(withCompany.company).toBe("HOTEL BOUTIQUE CULTURA MANOR");
  });

  it("sin perfil no hay líneas", () => {
    expect(build(SORIA).companyLines).toEqual([]);
  });
});
