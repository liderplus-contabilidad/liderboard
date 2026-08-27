import { describe, expect, it } from "vitest";
import type { Cell } from "@/lib/excel/workbook";
import {
  ROL_GENERAL_AOA,
  ROL_GENERAL_NO_ANTICIPO_AOA,
  ROL_GENERAL_NO_AREA_AOA,
  ROL_GENERAL_NO_EMPLOYEES_AOA,
  ROL_GENERAL_NO_PAGADO_AOA,
  ROL_GENERAL_NO_TOTAL_HORAS_EXTRAS_AOA,
} from "./rol-general.fixtures";
import {
  excelSerialToISODate,
  findPeriod,
  locateColumns,
  missingColumnLabels,
  parsePeriodText,
  readEmployeeRows,
} from "./rol-general-grid";

describe("locateColumns — localiza por rótulo, nunca por coordenada", () => {
  it("encuentra todas las columnas del rol bien formado", () => {
    const columns = locateColumns(ROL_GENERAL_AOA);
    expect(missingColumnLabels(columns)).toEqual([]);
    expect(columns.headerRow).not.toBeNull();
    expect(columns.sumanRow).not.toBeNull();
  });

  it("ningún rótulo colisiona con otro: dos columnas nunca caen en el mismo índice", () => {
    // The test that catches a crossed attribution at the root. Two labels `compactLabel` normalizes
    // alike (or one that is, literally, the text of another earlier cell) would return the SAME index
    // for two different concepts, and every figure would keep adding up the same.
    const { headerRow: _headerRow, sumanRow: _sumanRow, ...cols } = locateColumns(ROL_GENERAL_AOA);
    const found = Object.values(cols).filter((col): col is number => col !== null);
    expect(new Set(found).size).toBe(found.length);
  });

  it('el agrupador " No. HORAS EXTRAS" de la fila 2 no le roba la columna al "No." de la fila 3', () => {
    // The grouper is ABOVE the ordinal's label and starts with the same two letters: if the
    // comparison were not by the WHOLE label, the ordinal would come out of the hours column and no
    // employee row could be told apart from an area header.
    const columns = locateColumns(ROL_GENERAL_AOA);
    expect(columns.ordinalCol).not.toBe(columns.overtimeHours50Col);
    expect(columns.ordinalCol).toBeLessThan(columns.overtimeHours50Col ?? Infinity);
  });

  it("los rótulos que el bloque de asientos repite más abajo no desplazan a los de la cabecera", () => {
    // PRESTAMOS EMPRESARIALES, ALMUERZOS and CONTRIBUCION SOLIDARIA appear again as journal entry
    // descriptions, just like LIQUIDO A RECIBIR and PAGADO: the first match (the header, which is
    // above) is the one that counts.
    const columns = locateColumns(ROL_GENERAL_AOA);
    const headerRow = columns.headerRow ?? 0;
    for (const col of [
      columns.companyLoansCol,
      columns.mealsCol,
      columns.solidarityContributionCol,
    ]) {
      expect(col).not.toBeNull();
    }
    // And they are still body columns, not of column B where the echoes live.
    expect(columns.companyLoansCol).not.toBe(columns.employeeCol);
    expect(columns.mealsCol).not.toBe(columns.employeeCol);
    expect(columns.solidarityContributionCol).not.toBe(columns.employeeCol);
    expect(headerRow).toBeGreaterThan(0);
  });

  it("absorbe el espacio sobrante de «OTROS » y el salto de línea de «CONTRIBUCION\\nSOLIDARIA»", () => {
    const columns = locateColumns(ROL_GENERAL_AOA);
    expect(columns.otherDeductionsCol).not.toBeNull();
    expect(columns.solidarityContributionCol).not.toBeNull();
  });

  it("nombra la columna de concepto que falta, con el rótulo del libro", () => {
    expect(missingColumnLabels(locateColumns(ROL_GENERAL_NO_ANTICIPO_AOA))).toEqual([
      "ANTICIPO SUELDO",
    ]);
    expect(missingColumnLabels(locateColumns(ROL_GENERAL_NO_TOTAL_HORAS_EXTRAS_AOA))).toEqual([
      "TOTAL HORAS EXTRAS",
    ]);
  });

  it("no lee la fila 1 (índices de VLOOKUP desincronizados) como si fuera un rótulo", () => {
    // The junk row brings numbers in the same columns TOTAL/PAGADO really occupy; if `locateColumns`
    // took them for labels, headerRow/columns would come out of row 0.
    const columns = locateColumns(ROL_GENERAL_AOA);
    expect(columns.headerRow).toBeGreaterThan(0);
  });

  it("nombra la columna que falta cuando PAGADO no aparece en el libro", () => {
    const columns = locateColumns(ROL_GENERAL_NO_PAGADO_AOA);
    expect(columns.paidCol).toBeNull();
    expect(missingColumnLabels(columns)).toEqual(["PAGADO"]);
  });

  it("un rótulo repetido más abajo no desplaza al primero", () => {
    // It simulates what the real file does with PAGADO, which appears in BZ and again in CC: the real
    // label comes first, a repeated copy further down must not win.
    const grid: Cell[][] = ROL_GENERAL_AOA.map((row) => [...row]);
    const withDuplicate = [...grid, ["", "PAGADO"] as Cell[]];
    const columns = locateColumns(withDuplicate);
    const original = locateColumns(ROL_GENERAL_AOA);
    expect(columns.paidCol).toBe(original.paidCol);
  });
});

describe("readEmployeeRows — clasifica cada fila por lo que trae A (ordinal) y B (nombre)", () => {
  it("lee los 3 empleados del rol bien formado, con su área heredada del encabezado más cercano", () => {
    const columns = locateColumns(ROL_GENERAL_AOA);
    const { rows, warnings } = readEmployeeRows(ROL_GENERAL_AOA, columns);
    expect(rows.map((r) => r.name)).toEqual([
      "MORALES PEREZ ANA LUCIA",
      "VEGA TORRES MARIA JOSE",
      "SANDOVAL RUIZ PEDRO JOSE",
    ]);
    expect(rows.map((r) => r.area)).toEqual(["HOSPEDAJE", "HOSPEDAJE", "COCINA"]);
    expect(warnings).toEqual([]);
  });

  it('tolera el ordinal "1-" con guion igual que cualquier otro', () => {
    const columns = locateColumns(ROL_GENERAL_AOA);
    const { rows } = readEmployeeRows(ROL_GENERAL_AOA, columns);
    expect(rows[0]?.name).toBe("MORALES PEREZ ANA LUCIA");
  });

  it("salta SUBTOTAL, SUMAN, la fila de ordinal sin nombre y el asiento contable posterior a SUMAN", () => {
    const columns = locateColumns(ROL_GENERAL_AOA);
    const { rows } = readEmployeeRows(ROL_GENERAL_AOA, columns);
    expect(rows).toHaveLength(3);
    expect(rows.some((r) => r.name.includes("Sueldos Administracion"))).toBe(false);
  });

  it("avisa con el CONTEO cuando un empleado no tiene área asignada, nunca uno por empleado", () => {
    const columns = locateColumns(ROL_GENERAL_NO_AREA_AOA);
    const { rows, warnings } = readEmployeeRows(ROL_GENERAL_NO_AREA_AOA, columns);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.area).toBe("");
    expect(warnings).toEqual([
      "1 empleado no tiene un área asignada (sin encabezado de área por encima).",
    ]);
  });

  it("PAGADO ausente en el libro se traduce en null para todos, no en cero", () => {
    const columns = locateColumns(ROL_GENERAL_NO_PAGADO_AOA);
    const { rows } = readEmployeeRows(ROL_GENERAL_NO_PAGADO_AOA, columns);
    expect(rows.every((r) => r.paid === null)).toBe(true);
  });

  it("sin ninguna fila de ordinal+nombre, no produce empleados", () => {
    const columns = locateColumns(ROL_GENERAL_NO_EMPLOYEES_AOA);
    const { rows } = readEmployeeRows(ROL_GENERAL_NO_EMPLOYEES_AOA, columns);
    expect(rows).toEqual([]);
  });

  it("cada concepto sale de SU columna: un valor distinto por columna caza el cruce", () => {
    const columns = locateColumns(ROL_GENERAL_AOA);
    const [primero] = readEmployeeRows(ROL_GENERAL_AOA, columns).rows;
    expect(primero).toMatchObject({
      // G, H, I — cantidades de horas
      overtimeHours50: 5.5,
      overtimeHours100: 2.5,
      overtimeHours25: 1.5,
      // J, K, L — their value, and M the recognised total
      overtimePay50: 16.75,
      overtimePay100: 9.5,
      overtimePay25: 0.75,
      overtimeTotal: 0,
      // P…T, V — the captured income items
      vacationPay: 11,
      privateInsurance: 12,
      allowances: 13,
      fixedCommission: 14,
      variableCommission: 15,
      bonus: 16,
      // Y…AN — egresos capturados
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
      // AS, AT — the décimo provisions, raw
      thirteenthProvisionRaw: 0,
      fourteenthProvisionRaw: 0,
      // BA, AZ — the two reserve-fund flags, not yet interpreted
      hasReserveFundRaw: "N",
      accumulatesReserveFundRaw: "S",
    });
  });

  it("M ausente en el libro se traduce en null, no en cero — igual que PAGADO", () => {
    // Zero would mean «no overtime hour was recognised», which is a claim a book without that column
    // does not make.
    const columns = locateColumns(ROL_GENERAL_NO_TOTAL_HORAS_EXTRAS_AOA);
    const { rows } = readEmployeeRows(ROL_GENERAL_NO_TOTAL_HORAS_EXTRAS_AOA, columns);
    expect(rows.every((r) => r.overtimeTotal === null)).toBe(true);
  });

  it("una columna de concepto ausente deja ese concepto en cero y no toca a los demás", () => {
    const columns = locateColumns(ROL_GENERAL_NO_ANTICIPO_AOA);
    const [primero] = readEmployeeRows(ROL_GENERAL_NO_ANTICIPO_AOA, columns).rows;
    expect(primero?.salaryAdvance).toBe(0);
    expect(primero?.companyLoans).toBe(44);
  });

  it("sin columna EMPLEADO no hay dónde empezar a leer, y no produce empleados", () => {
    const blank: Cell[][] = [[], [], []];
    const { rows, warnings } = readEmployeeRows(blank, locateColumns(blank));
    expect(rows).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

describe("parsePeriodText — GENERAL!B2, nunca el nombre del archivo", () => {
  it('lee "MARZO 2026" como año 2026, mes de índice 2', () => {
    expect(parsePeriodText("MARZO 2026")).toEqual({ year: 2026, monthIndex: 2 });
  });

  it("ignora mayúsculas y acentos", () => {
    expect(parsePeriodText("marzo 2026")).toEqual({ year: 2026, monthIndex: 2 });
    expect(parsePeriodText("Diciembre 2025")).toEqual({ year: 2025, monthIndex: 11 });
  });

  it("null cuando la celda no es texto", () => {
    expect(parsePeriodText(46082)).toBeNull();
    expect(parsePeriodText(null)).toBeNull();
  });

  it("null cuando el mes no es reconocible", () => {
    expect(parsePeriodText("MARZONA 2026")).toBeNull();
    expect(parsePeriodText("2026")).toBeNull();
    expect(parsePeriodText("MARZO")).toBeNull();
  });
});

describe("excelSerialToISODate", () => {
  it("convierte los seriales verificados contra el archivo real", () => {
    expect(excelSerialToISODate(45937)).toBe("2025-10-07");
    expect(excelSerialToISODate(46082)).toBe("2026-03-01");
  });

  it("null cuando la celda no es un número positivo", () => {
    expect(excelSerialToISODate("sin fecha")).toBeNull();
    expect(excelSerialToISODate(null)).toBeNull();
    expect(excelSerialToISODate(0)).toBeNull();
    expect(excelSerialToISODate(-5)).toBeNull();
  });
});

describe("findPeriod — por su forma, no por su celda", () => {
  it("lee el período del archivo del contador, donde vive en B2", () => {
    const columns = locateColumns(ROL_GENERAL_AOA);
    expect(findPeriod(ROL_GENERAL_AOA, columns.headerRow)).toEqual({ year: 2026, monthIndex: 2 });
  });

  it("lo sigue leyendo cuando un membrete lo empuja hacia abajo", () => {
    // It is the file this app generates: `writeLogoHeader` opens a few rows above the preamble, so
    // `B2` stops being `B2` and a fixed coordinate would not find it.
    const withBand: Cell[][] = [[], [], [], ...ROL_GENERAL_AOA];
    const columns = locateColumns(withBand);
    expect(findPeriod(withBand, columns.headerRow)).toEqual({ year: 2026, monthIndex: 2 });
  });

  it("no mira por debajo de la cabecera, donde el cuerpo podría llevar cualquier texto", () => {
    const columns = locateColumns(ROL_GENERAL_AOA);
    const sinPreambulo = ROL_GENERAL_AOA.map((row, index) =>
      index < (columns.headerRow ?? 0) ? [] : row,
    );
    expect(findPeriod(sinPreambulo, columns.headerRow)).toBeNull();
  });

  it("ignora los rótulos del preámbulo, que no tienen su forma", () => {
    // «TOTAL HORAS EXTRAS», «DECIMO IV MENSUAL» and the razón social live alongside the period on
    // those same rows: only the cell that is, in its entirety, a month and a year matches.
    const columns = locateColumns(ROL_GENERAL_AOA);
    expect(findPeriod(ROL_GENERAL_AOA, columns.headerRow)).not.toBeNull();
    expect(parsePeriodText("TOTAL HORAS EXTRAS")).toBeNull();
    expect(parsePeriodText("HOTEL BOUTIQUE FICTICIO")).toBeNull();
  });
});

describe("PAGADO en blanco no es cero", () => {
  const columns = locateColumns(ROL_GENERAL_AOA);
  const paidCol = columns.paidCol ?? -1;
  const ordinalCol = columns.ordinalCol ?? -1;

  /** The same workbook, with the `PAGADO` cell empty on every employee row. */
  const blanked: Cell[][] = ROL_GENERAL_AOA.map((row) => {
    const cells = [...row] as Cell[];
    if (cells[ordinalCol] !== null && cells[ordinalCol] !== undefined && cells[ordinalCol] !== "") {
      cells[paidCol] = null;
    }
    return cells;
  });

  it("una celda vacía se lee null: nadie declaró lo pagado", () => {
    // With the old rule it came back as `0`, and the employee came out «with a difference» by their
    // whole net pay — which is exactly what the rol downloaded by the app would say about someone who
    // has not been paid yet.
    const { rows } = readEmployeeRows(blanked, locateColumns(blanked));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.paid === null)).toBe(true);
  });

  it("un cero escrito sigue siendo cero", () => {
    const zeroed: Cell[][] = blanked.map((row) => {
      const cells = [...row] as Cell[];
      if (
        cells[ordinalCol] !== null &&
        cells[ordinalCol] !== undefined &&
        cells[ordinalCol] !== ""
      ) {
        cells[paidCol] = 0;
      }
      return cells;
    });
    const { rows } = readEmployeeRows(zeroed, locateColumns(zeroed));
    expect(rows.every((row) => row.paid === 0)).toBe(true);
  });
});
