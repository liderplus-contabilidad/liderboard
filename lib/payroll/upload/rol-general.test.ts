import { describe, expect, it } from "vitest";
import { PayrollParseError } from "./errors";
import {
  aoaToXlsxBuffer,
  ROL_GENERAL_AOA,
  ROL_GENERAL_BAD_CONTRACT_TYPE_AOA,
  ROL_GENERAL_BAD_HIRE_DATE_AOA,
  ROL_GENERAL_BAD_PERIOD_AOA,
  ROL_GENERAL_NO_ANTICIPO_AOA,
  ROL_GENERAL_NO_AREA_AOA,
  ROL_GENERAL_NO_EMPLOYEES_AOA,
  ROL_GENERAL_NO_PAGADO_AOA,
  ROL_GENERAL_NO_TOTAL_HORAS_EXTRAS_AOA,
  ROL_GENERAL_ODD_RESERVE_FUND_AOA,
  ROL_GENERAL_OVERTIME_FLOAT_NOISE_AOA,
} from "./rol-general.fixtures";
import { parseRolGeneral } from "./rol-general";

function bufferOf(aoa: Parameters<typeof aoaToXlsxBuffer>[0], sheetName?: string): ArrayBuffer {
  return aoaToXlsxBuffer(aoa, sheetName);
}

function errorOf(buffer: ArrayBuffer): PayrollParseError {
  try {
    parseRolGeneral(buffer);
  } catch (error) {
    if (error instanceof PayrollParseError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected parse to fail");
}

describe("parseRolGeneral — archivo bien formado", () => {
  it("lee la empresa de B1 y el período de B2", () => {
    const result = parseRolGeneral(bufferOf(ROL_GENERAL_AOA));
    expect(result.company).toBe("HOTEL BOUTIQUE FICTICIO");
    expect(result.year).toBe(2026);
    expect(result.monthIndex).toBe(2);
  });

  it("el período nunca sale del nombre del archivo — la función ni siquiera lo recibe", () => {
    // A diferencia del formato mensual por centros de PyG (que sí lee el nombre), este parser no
    // toma ningún nombre de archivo como argumento: no hay forma de que el período salga de ahí.
    const result = parseRolGeneral(bufferOf(ROL_GENERAL_AOA));
    expect(result.year).toBe(2026);
    expect(result.monthIndex).toBe(2);
  });

  it("produce 3 empleados, cada uno con figures presente", () => {
    const result = parseRolGeneral(bufferOf(ROL_GENERAL_AOA));
    expect(result.lines).toHaveLength(3);
    for (const line of result.lines) {
      expect(line.figures).toBeDefined();
    }
  });

  it("no recalcula: los 5 valores del mes se leen VERBATIM de sus columnas", () => {
    const [primero] = parseRolGeneral(bufferOf(ROL_GENERAL_AOA)).lines;
    expect(primero?.figures).toEqual({
      gross: 600,
      deductions: 50,
      net: 550,
      cost: 650,
      paid: 550,
    });
  });

  it("una cédula guardada como número se lee igual que una guardada como texto", () => {
    const result = parseRolGeneral(bufferOf(ROL_GENERAL_AOA));
    expect(result.lines[0]?.idCard).toBe("1714097084");
    expect(result.lines[1]?.idCard).toBe("1202738207");
  });

  it("convierte la fecha de ingreso desde el serial de Excel", () => {
    const result = parseRolGeneral(bufferOf(ROL_GENERAL_AOA));
    expect(result.lines[0]?.hireDate).toBe("2025-10-07");
    expect(result.lines[2]?.hireDate).toBe("2026-03-01");
  });

  it("acepta CT y TP como tipo de contrato", () => {
    const result = parseRolGeneral(bufferOf(ROL_GENERAL_AOA));
    expect(result.lines.map((l) => l.contractType)).toEqual(["CT", "CT", "TP"]);
  });

  it("sin avisos cuando el archivo no tiene nada raro que señalar", () => {
    expect(parseRolGeneral(bufferOf(ROL_GENERAL_AOA)).warnings).toEqual([]);
  });
});

describe("parseRolGeneral — la captura del mes", () => {
  it("cada concepto capturado sale de su propia columna del libro", () => {
    const [primero] = parseRolGeneral(bufferOf(ROL_GENERAL_AOA)).lines;
    expect(primero?.capture).toEqual({
      overtimeHours50: 5.5,
      overtimeHours100: 2.5,
      overtimeHours25: 1.5,
      approvedOvertime: 0,
      vacationPay: 11,
      privateInsurance: 12,
      allowances: 13,
      fixedCommission: 14,
      variableCommission: 15,
      bonus: 16,
      deductions: {
        iessLoans: 41,
        unpaidLeave: 42,
        salaryAdvance: 43,
        companyLoans: 44,
        incomeTax: 45,
        meals: 46,
        fines: 47,
        inHouseConsumption: 48,
        solidarityContribution: 49,
        otherDeductions: 51,
        partTimeDeduction: 52,
        medicalLeaveDeduction: 53,
      },
      provisionsThirteenth: false,
      provisionsFourteenth: false,
      // `BZ` viaja también aquí, no solo a `figures`: es un valor tecleado y la pantalla lo deja
      // corregir sin tocar lo que el archivo declaró.
      paid: 550, // `BZ` del fixture de esta prueba
    });
  });

  it("los tres empleados traen captura: el archivo declara el mes entero, no solo sus totales", () => {
    const result = parseRolGeneral(bufferOf(ROL_GENERAL_AOA));
    expect(result.lines.every((l) => l.capture !== undefined)).toBe(true);
  });
});

describe("parseRolGeneral — approvedOvertime se DEDUCE de los valores, no se transcribe", () => {
  it("M = J+K+L ⇒ null: no hubo recorte y las horas entran enteras", () => {
    const vega = parseRolGeneral(bufferOf(ROL_GENERAL_AOA)).lines.find(
      (l) => l.name === "VEGA TORRES MARIA JOSE",
    );
    expect(vega?.capture?.overtimeHours25).toBe(140);
    expect(vega?.capture?.approvedOvertime).toBeNull();
  });

  it("M = 0 con horas valoradas ⇒ 0: el `*0` que el contador escribe a mano", () => {
    const morales = parseRolGeneral(bufferOf(ROL_GENERAL_AOA)).lines.find(
      (l) => l.name === "MORALES PEREZ ANA LUCIA",
    );
    expect(morales?.capture?.approvedOvertime).toBe(0);
  });

  it("M parcial ⇒ ese importe exacto, que es lo que un booleano no podría decir", () => {
    const sandoval = parseRolGeneral(bufferOf(ROL_GENERAL_AOA)).lines.find(
      (l) => l.name === "SANDOVAL RUIZ PEDRO JOSE",
    );
    expect(sandoval?.capture?.approvedOvertime).toBe(50);
  });

  it("el ruido de coma flotante por debajo del centavo no se lee como recorte", () => {
    // 16,75 + 79,41 + 0,10 da 96,25999999999999 y `M` guarda 96,26: comparados con `===` esto
    // inventaría un recorte que el libro no hizo.
    const morales = parseRolGeneral(bufferOf(ROL_GENERAL_OVERTIME_FLOAT_NOISE_AOA)).lines.find(
      (l) => l.name === "MORALES PEREZ ANA LUCIA",
    );
    expect(morales?.capture?.approvedOvertime).toBeNull();
  });

  it("sin columna M no hay recorte que deducir: null, nunca 0", () => {
    const result = parseRolGeneral(bufferOf(ROL_GENERAL_NO_TOTAL_HORAS_EXTRAS_AOA));
    expect(result.lines.every((l) => l.capture?.approvedOvertime === null)).toBe(true);
    expect(result.warnings).toContain("No se encontraron las columnas: TOTAL HORAS EXTRAS.");
  });
});

describe("parseRolGeneral — las provisiones de décimos se deducen de AS y AT", () => {
  it("AS y AT en cero dejan las dos apagadas, como en todo el archivo real", () => {
    const morales = parseRolGeneral(bufferOf(ROL_GENERAL_AOA)).lines.find(
      (l) => l.name === "MORALES PEREZ ANA LUCIA",
    );
    expect(morales?.capture?.provisionsThirteenth).toBe(false);
    expect(morales?.capture?.provisionsFourteenth).toBe(false);
  });

  it("cada una se deduce de SU columna: AS con valor no enciende la de AT", () => {
    const lines = parseRolGeneral(bufferOf(ROL_GENERAL_AOA)).lines;
    const vega = lines.find((l) => l.name === "VEGA TORRES MARIA JOSE");
    expect(vega?.capture?.provisionsThirteenth).toBe(true);
    expect(vega?.capture?.provisionsFourteenth).toBe(false);
    const sandoval = lines.find((l) => l.name === "SANDOVAL RUIZ PEDRO JOSE");
    expect(sandoval?.capture?.provisionsThirteenth).toBe(false);
    expect(sandoval?.capture?.provisionsFourteenth).toBe(true);
  });
});

describe("parseRolGeneral — FR y AC FR, las dos banderas del fondo de reserva", () => {
  it('"S" enciende y "N" apaga, cada una desde su columna', () => {
    const lines = parseRolGeneral(bufferOf(ROL_GENERAL_AOA)).lines;
    const morales = lines.find((l) => l.name === "MORALES PEREZ ANA LUCIA");
    expect(morales?.hasReserveFund).toBe(false);
    expect(morales?.accumulatesReserveFund).toBe(true);
    const vega = lines.find((l) => l.name === "VEGA TORRES MARIA JOSE");
    expect(vega?.hasReserveFund).toBe(true);
    expect(vega?.accumulatesReserveFund).toBe(false);
  });

  it("ignora mayúsculas, como el `=` de Excel", () => {
    const sandoval = parseRolGeneral(bufferOf(ROL_GENERAL_AOA)).lines.find(
      (l) => l.name === "SANDOVAL RUIZ PEDRO JOSE",
    );
    expect(sandoval?.hasReserveFund).toBe(true);
    expect(sandoval?.accumulatesReserveFund).toBe(true); // la celda trae "s"
  });

  it('vacío y basura apagan, sin avisar: el libro compara `="S"` y lo demás cae en el else', () => {
    const result = parseRolGeneral(bufferOf(ROL_GENERAL_ODD_RESERVE_FUND_AOA));
    const sandoval = result.lines.find((l) => l.name === "SANDOVAL RUIZ PEDRO JOSE");
    expect(sandoval?.hasReserveFund).toBe(false); // celda vacía
    expect(sandoval?.accumulatesReserveFund).toBe(false); // "SI" no es "S"
    expect(result.warnings).toEqual([]);
  });
});

describe("parseRolGeneral — una columna de concepto ausente no rompe la carga", () => {
  it("los 3 empleados se leen igual, ese concepto queda en cero y el aviso agrupado la nombra", () => {
    const result = parseRolGeneral(bufferOf(ROL_GENERAL_NO_ANTICIPO_AOA));
    expect(result.lines).toHaveLength(3);
    expect(result.lines[0]?.capture?.deductions.salaryAdvance).toBe(0);
    expect(result.lines[0]?.capture?.deductions.companyLoans).toBe(44);
    expect(result.warnings).toEqual(["No se encontraron las columnas: ANTICIPO SUELDO."]);
  });
});

describe("parseRolGeneral — el área es la del encabezado más cercano por encima", () => {
  it("HOSPEDAJE cubre a los dos primeros, COCINA al tercero", () => {
    const result = parseRolGeneral(bufferOf(ROL_GENERAL_AOA));
    expect(result.lines.map((l) => l.area)).toEqual(["HOSPEDAJE", "HOSPEDAJE", "COCINA"]);
  });

  it("avisa con el conteo cuando falta el área, nunca uno por empleado", () => {
    const result = parseRolGeneral(bufferOf(ROL_GENERAL_NO_AREA_AOA));
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.area).toBe("");
    expect(result.warnings).toEqual([
      "1 empleado no tiene un área asignada (sin encabezado de área por encima).",
    ]);
  });
});

describe("parseRolGeneral — SUBTOTAL, SUMAN y el asiento contable posterior se saltan", () => {
  it("solo 3 líneas, ninguna es una fila de asientos contables", () => {
    const result = parseRolGeneral(bufferOf(ROL_GENERAL_AOA));
    expect(result.lines.map((l) => l.name)).not.toContain("Sueldos Administracion");
    expect(result.lines).toHaveLength(3);
  });
});

describe("parseRolGeneral — PAGADO puede no existir en el libro", () => {
  it("paid = null para todos los empleados, con un aviso nombrando la columna", () => {
    const result = parseRolGeneral(bufferOf(ROL_GENERAL_NO_PAGADO_AOA));
    expect(result.lines.every((l) => l.figures?.paid === null)).toBe(true);
    expect(result.warnings).toContain("No se encontraron las columnas: PAGADO.");
  });
});

describe("parseRolGeneral — tipo de contrato inválido", () => {
  it("se asume CT y avisa con el conteo", () => {
    const result = parseRolGeneral(bufferOf(ROL_GENERAL_BAD_CONTRACT_TYPE_AOA));
    const empleado = result.lines.find((l) => l.name === "MORALES PEREZ ANA LUCIA");
    expect(empleado?.contractType).toBe("CT");
    expect(result.warnings).toContain(
      "1 empleado trae un tipo de contrato distinto de CT/TP; se asume CT.",
    );
  });
});

describe("parseRolGeneral — fecha de ingreso ilegible", () => {
  it("queda en null y avisa con el conteo", () => {
    const result = parseRolGeneral(bufferOf(ROL_GENERAL_BAD_HIRE_DATE_AOA));
    const empleado = result.lines.find((l) => l.name === "MORALES PEREZ ANA LUCIA");
    expect(empleado?.hireDate).toBeNull();
    expect(result.warnings).toContain(
      "1 empleado trae una fecha de ingreso ilegible; queda sin fecha.",
    );
  });
});

describe("parseRolGeneral — errores tipados", () => {
  it("archivo ilegible", () => {
    // Texto plano SheetJS lo acepta como CSV de una celda; un ZIP truncado es lo que hace
    // fallar `XLSX.read` de verdad, y es lo que este caso cubre.
    const garbage = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]).buffer;
    expect(errorOf(garbage).code).toBe("invalid-file");
  });

  it("hoja GENERAL ausente", () => {
    const buffer = bufferOf(ROL_GENERAL_AOA, "OTROS");
    expect(errorOf(buffer).code).toBe("general-sheet-missing");
  });

  it("período ilegible en B2", () => {
    expect(errorOf(bufferOf(ROL_GENERAL_BAD_PERIOD_AOA)).code).toBe("invalid-period");
  });

  it("ninguna fila de empleado", () => {
    expect(errorOf(bufferOf(ROL_GENERAL_NO_EMPLOYEES_AOA)).code).toBe("no-employees");
  });
});
