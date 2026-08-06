import { describe, expect, it } from "vitest";
import { PayrollParseError } from "./errors";
import {
  aoaToXlsxBuffer,
  ROL_GENERAL_AOA,
  ROL_GENERAL_BAD_CONTRACT_TYPE_AOA,
  ROL_GENERAL_BAD_HIRE_DATE_AOA,
  ROL_GENERAL_BAD_PERIOD_AOA,
  ROL_GENERAL_NO_AREA_AOA,
  ROL_GENERAL_NO_EMPLOYEES_AOA,
  ROL_GENERAL_NO_PAGADO_AOA,
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
