import { describe, expect, it } from "vitest";
import { emptyCapture } from "./employee-input";
import { DEFAULT_PAYROLL_PARAMETERS as PARAMS } from "./engine/parameters";
import { GOLDEN_MARCH_2026 } from "./engine/golden.fixtures";
import { buildJournalEntry, JOURNAL_ACCOUNTS } from "./journal";
import { journalAmountsFor, journalAmountsForInputs } from "./journal-amounts";
import type {
  ParsedPayrollEmployeeLine,
  PayrollExtraConcept,
  PayrollMonthlyCapture,
} from "./types";

function line(
  overrides: Partial<ParsedPayrollEmployeeLine> = {},
  capture: Partial<PayrollMonthlyCapture> = {},
): ParsedPayrollEmployeeLine {
  return {
    name: "EMPLEADO",
    role: "CARGO",
    area: "ADMINISTRACION",
    baseSalary: 800,
    contractType: "CT",
    idCard: "1712345678",
    hireDate: null,
    sectorCode: "",
    hasReserveFund: false,
    accumulatesReserveFund: false,
    days: 30,
    ...overrides,
    capture: { ...emptyCapture(), ...capture },
  };
}

/** El asiento de una nómina, que es lo que la pantalla arma. */
function entryFor(lines: readonly ParsedPayrollEmployeeLine[]) {
  return buildJournalEntry(journalAmountsFor(lines, PARAMS, []));
}

describe("el asiento derivado de la nómina CUADRA", () => {
  it("con una nómina desnuda", () => {
    expect(entryFor([line()]).balanced).toBe(true);
  });

  it("con los conceptos que llegan por captura", () => {
    const entry = entryFor([
      line(
        {},
        {
          fixedCommission: 120,
          variableCommission: 80,
          allowances: 50,
          bonus: 40,
          vacationPay: 30,
          deductions: {
            ...emptyCapture().deductions,
            salaryAdvance: 200,
            fines: 15,
            meals: 25,
            companyLoans: 60,
            incomeTax: 12,
            inHouseConsumption: 8,
            solidarityContribution: 5,
            otherDeductions: 3,
            iessLoans: 64.25,
          },
        },
      ),
    ]);

    expect(entry.balanced).toBe(true);
  });

  it("CON SEGURO PRIVADO — el caso que la cuenta 25 existe para sostener", () => {
    // Sin esa cuenta el haber superaba al debe por exactamente este importe: `Q` entra en el
    // ingreso, llega al líquido por el haber, y ninguna de las 24 del libro lo recogía por el debe.
    const entry = entryFor([line({}, { privateInsurance: 60 })]);

    expect(entry.balanced).toBe(true);
    expect(entry.lines.find((l) => l.id === "seguro-privado")?.amount).toBeCloseTo(60, 8);
  });

  it("con fondo de reserva, se cobre o se acumule", () => {
    expect(entryFor([line({ hasReserveFund: true })]).balanced).toBe(true);
    expect(entryFor([line({ hasReserveFund: true, accumulatesReserveFund: true })]).balanced).toBe(
      true,
    );
  });

  it("con un empleado a TIEMPO PARCIAL", () => {
    // `Z`, `AI` y `AN` tienen destino en el haber, que es justo lo que `ASIENTOS` no les daba: sin
    // esa cuenta el asiento descuadraba con el primer empleado a tiempo parcial.
    const entry = entryFor([
      line(
        { contractType: "TP" },
        {
          deductions: {
            ...emptyCapture().deductions,
            partTimeDeduction: 120,
            unpaidLeave: 40,
            medicalLeaveDeduction: 25,
          },
        },
      ),
    ]);

    expect(entry.balanced).toBe(true);
    expect(
      entry.lines.find((l) => l.id === "licencias-permisos-tiempo-parcial")?.amount,
    ).toBeCloseTo(185, 8);
  });

  it("con horas extras recortadas por lo aprobado", () => {
    const entry = entryFor([
      line({}, { overtimeHours50: 10, overtimeHours100: 4, approvedOvertime: 50 }),
    ]);

    expect(entry.balanced).toBe(true);
    // `M` es lo APROBADO, nunca `J+K+L`: el asiento no puede asentar horas que no se pagan.
    expect(entry.lines.find((l) => l.id === "horas-extras-administracion")?.amount).toBe(50);
  });

  it("con varios empleados de áreas distintas, en un asiento consolidado", () => {
    const entry = entryFor([
      line({ area: "COCINA", idCard: "1" }, { bonus: 20 }),
      line({ area: "VENTAS", idCard: "2", baseSalary: 500 }),
      line({ area: "HOSPEDAJE", idCard: "3", baseSalary: 1200 }, { allowances: 30 }),
    ]);

    expect(entry.balanced).toBe(true);
  });
});

describe("journalAmountsFor", () => {
  it("devuelve las claves del catálogo COMPLETAS, con cero explícito", () => {
    // Un `0` dice «esa columna no se movió»; una clave ausente diría «no se sabe», y alimentado del
    // período eso ya no puede ocurrir: la nómina se conoce entera.
    const amounts = journalAmountsFor([line()], PARAMS, []);

    for (const account of JOURNAL_ACCOUNTS) {
      expect(amounts[account.id]).toBeTypeOf("number");
    }
  });

  it("una nómina VACÍA deja todo en cero y el asiento cuadrado", () => {
    const entry = entryFor([]);

    expect(entry.lines.every((l) => l.amount === 0)).toBe(true);
    expect(entry.debit).toBe(0);
    expect(entry.credit).toBe(0);
    expect(entry.balanced).toBe(true);
  });

  it("suma la nómina entera, no un empleado", () => {
    const uno = journalAmountsFor([line()], PARAMS, []);
    const dos = journalAmountsFor([line(), line({ idCard: "2" })], PARAMS, []);

    expect(dos["sueldos-administracion"]).toBeCloseTo(uno["sueldos-administracion"]! * 2, 8);
  });

  it("una ficha sin captura vale cero en lo capturado, no rompe", () => {
    const amounts = journalAmountsFor([{ ...line(), capture: undefined }], PARAMS, []);

    expect(amounts["anticipo-empleados"]).toBe(0);
    expect(amounts["sueldos-administracion"]).toBeGreaterThan(0);
  });
});

describe("el mapa respeta las correcciones del libro sobre `ASIENTOS`", () => {
  const capture = {
    allowances: 111, // R · VIATICOS/VIVIENDA
    bonus: 222, // V · BONO CUMPLIMIENTO
    deductions: { ...emptyCapture().deductions, iessLoans: 64.25 }, // Y
  };

  it("«Viaticos» lee R, no V", () => {
    // `ASIENTOS` leía `V` (el Bono ND) en la fila de Viáticos; la corregida lee `R`.
    const amounts = journalAmountsFor([line({}, capture)], PARAMS, []);

    expect(amounts.viaticos).toBe(111);
    expect(amounts["bono-nd"]).toBe(222);
  });

  it("los décimos van al derecho: 621004 ← AS+O y 621005 ← AT+N", () => {
    // `ASIENTOS` los cruzaba entre sí.
    const [row] = [line()];
    const amounts = journalAmountsFor([row], PARAMS, []);
    const tercero = amounts["decimo-tercer-sueldo-administracion"]!;
    const cuarto = amounts["decimo-cuarto-sueldo-administracion"]!;

    // Con las provisiones apagadas, cada uno vale su mensualización: O y N.
    expect(tercero).toBeGreaterThan(0);
    expect(cuarto).toBeGreaterThan(0);
    expect(tercero).not.toBe(cuarto);
    // El décimo tercero mensual es el sueldo / 12; el cuarto es el SBU / 12. Con sueldo 800 y SBU
    // por debajo, el tercero es el mayor — que es exactamente lo que el cruce invertía.
    expect(tercero).toBeGreaterThan(cuarto);
  });

  it("«Aportes IESS por Pagar» vale X+AU+Y+AW, o sea incluye el préstamo IESS", () => {
    // Es la corrección de los 64.25: `ASIENTOS` leía `AB` («PRESTAMOS EMPRESARIALES») en vez de `Y`.
    // Solo se mueve `Y`: los viáticos entran en la base aportable y moverlos arrastraría también a
    // `X` y `AU`, que están en esta misma cuenta — la resta dejaría de aislar lo que se mide.
    const sinPrestamo = journalAmountsFor([line()], PARAMS, [])["aportes-iess-por-pagar"]!;
    const conPrestamo = journalAmountsFor(
      [line({}, { deductions: { ...emptyCapture().deductions, iessLoans: 64.25 } })],
      PARAMS,
      [],
    )["aportes-iess-por-pagar"]!;

    expect(conPrestamo - sinPrestamo).toBeCloseTo(64.25, 8);
  });

  it("un préstamo empresarial NO toca la cuenta del IESS", () => {
    // El otro lado de la misma corrección: `AB` tiene su propia cuenta y no entra en `2.1.7.1.9`.
    const base = journalAmountsFor([line()], PARAMS, []);
    const conPrestamo = journalAmountsFor(
      [line({}, { deductions: { ...emptyCapture().deductions, companyLoans: 64.25 } })],
      PARAMS,
      [],
    );

    expect(conPrestamo["aportes-iess-por-pagar"]).toBeCloseTo(base["aportes-iess-por-pagar"]!, 8);
    expect(conPrestamo["prestamos-empresariales"]).toBe(64.25);
  });
});

describe("contraste contra el archivo real de MARZO 2026", () => {
  // Los seis empleados del rol de HOTEL BOUTIQUE CULTURA MANOR, transcritos del `.xls`, y el
  // asiento que `GENERAL!43-71` escribe para ellos. Si el mapa de columnas está bien, lo segundo
  // sale de lo primero: es la única evidencia EXTERNA de que esta costura acierta, porque los dos
  // lados vienen del archivo del contador y ninguno de este código.
  const amounts = journalAmountsForInputs(
    GOLDEN_MARCH_2026.map((employee) => employee.input),
    PARAMS,
  );
  const entry = buildJournalEntry(amounts);

  it("cuadra en 3,889.06, como la celda de control del libro", () => {
    // `C71 = D71 = 3,889.06`, con `C73 = C71-D71 = 0`.
    expect(entry.debit).toBeCloseTo(3889.06, 2);
    expect(entry.credit).toBeCloseTo(3889.06, 2);
    expect(entry.balanced).toBe(true);
  });

  it.each([
    ["sueldos-administracion", 2918.58],
    ["decimo-tercer-sueldo-administracion", 243.21],
    ["decimo-cuarto-sueldo-administracion", 241.02],
    ["vacaciones-administracion", 131.63],
    ["aporte-patronal-iess-administracion", 354.62],
    ["sueldos-por-pagar", 2862.76],
    ["vacaciones-por-pagar", 131.63],
    ["anticipo-empleados", 200],
    ["aportes-iess-por-pagar", 694.67],
  ] as const)("%s vale %d, como en la hoja", (id, expected) => {
    expect(amounts[id]).toBeCloseTo(expected, 2);
  });

  it("las otras 17 cuentas quedan en cero, como en la hoja", () => {
    const conMovimiento = JOURNAL_ACCOUNTS.filter((a) => amounts[a.id] !== 0).map((a) => a.id);

    expect(conMovimiento).toHaveLength(9);
  });

  it("«Seguro Privado» vale cero — por eso el descuadre no se veía en este mes", () => {
    expect(amounts["seguro-privado"]).toBe(0);
  });
});

/**
 * Los conceptos de ingreso extra que un período declara. Es la prueba de que la cuenta 26
 * (`bonos-aportables`) hace falta: sin ella el asiento descuadraría por lo que la nómina sí pagó,
 * exactamente el mismo agujero que obligó a añadir `Seguro Privado`.
 */
describe("conceptos de ingreso extra en el asiento", () => {
  const APORTABLE: PayrollExtraConcept = { id: "x1", label: "Movilización", kind: "aportable" };
  const NO_APORTABLE: PayrollExtraConcept = {
    id: "x2",
    label: "Alimentación",
    kind: "noAportable",
  };

  const conConceptos = (
    concepts: readonly PayrollExtraConcept[],
    extraAmounts: Record<string, number>,
  ) => journalAmountsFor([line({}, { extraAmounts })], PARAMS, concepts);

  it("el asiento CUADRA con un aportable", () => {
    const entry = buildJournalEntry(conConceptos([APORTABLE], { x1: 120 }));
    expect(entry.balanced).toBe(true);
  });

  it("el asiento CUADRA con un no aportable", () => {
    const entry = buildJournalEntry(conConceptos([NO_APORTABLE], { x2: 80 }));
    expect(entry.balanced).toBe(true);
  });

  it("el asiento CUADRA con las dos clases y varios conceptos a la vez", () => {
    const concepts: PayrollExtraConcept[] = [
      APORTABLE,
      NO_APORTABLE,
      { id: "x3", label: "Bono", kind: "noAportable" },
    ];
    const entry = buildJournalEntry(conConceptos(concepts, { x1: 120, x2: 80, x3: 45 }));
    expect(entry.balanced).toBe(true);
  });

  it("el aportable va a su propia cuenta y el no aportable a «Bono ND»", () => {
    const amounts = conConceptos([APORTABLE, NO_APORTABLE], { x1: 120, x2: 80 });
    expect(amounts["bonos-aportables"]).toBeCloseTo(120, 8);
    expect(amounts["bono-nd"]).toBeCloseTo(80, 8);
  });

  it("«Bono ND» suma la columna `V` y los no aportables en la MISMA cuenta", () => {
    const amounts = journalAmountsFor([line({}, { bonus: 26, extraAmounts: { x2: 80 } })], PARAMS, [
      NO_APORTABLE,
    ]);
    expect(amounts["bono-nd"]).toBeCloseTo(106, 8);
  });

  it("un aportable arrastra también el aporte patronal, el no aportable no", () => {
    const sin = journalAmountsFor([line()], PARAMS, []);
    const aportable = conConceptos([APORTABLE], { x1: 120 });
    const noAportable = conConceptos([NO_APORTABLE], { x2: 120 });

    expect(aportable["aporte-patronal-iess-administracion"]).toBeGreaterThan(
      sin["aporte-patronal-iess-administracion"]!,
    );
    expect(noAportable["aporte-patronal-iess-administracion"]).toBeCloseTo(
      sin["aporte-patronal-iess-administracion"]!,
      8,
    );
  });

  it("sin conceptos declarados, las dos cuentas nuevas quedan en cero", () => {
    const amounts = journalAmountsFor([line({}, { extraAmounts: { x1: 999 } })], PARAMS, []);
    expect(amounts["bonos-aportables"]).toBe(0);
    expect(amounts["bono-nd"]).toBe(0);
  });
});
