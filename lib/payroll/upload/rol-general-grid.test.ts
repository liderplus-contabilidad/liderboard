import { describe, expect, it } from "vitest";
import type { Cell } from "@/lib/excel/workbook";
import {
  ROL_GENERAL_AOA,
  ROL_GENERAL_NO_AREA_AOA,
  ROL_GENERAL_NO_EMPLOYEES_AOA,
  ROL_GENERAL_NO_PAGADO_AOA,
} from "./rol-general.fixtures";
import {
  excelSerialToISODate,
  locateColumns,
  missingColumnLabels,
  parsePeriodText,
  readEmployeeRows,
} from "./rol-general-grid";

describe("locateColumns — localiza por rótulo, nunca por coordenada", () => {
  it("encuentra las 14 columnas del rol bien formado", () => {
    const columns = locateColumns(ROL_GENERAL_AOA);
    expect(missingColumnLabels(columns)).toEqual([]);
    expect(columns.headerRow).not.toBeNull();
    expect(columns.sumanRow).not.toBeNull();
  });

  it("no lee la fila 1 (índices de VLOOKUP desincronizados) como si fuera un rótulo", () => {
    // La fila de basura trae números en las mismas columnas que TOTAL/PAGADO ocupan de verdad;
    // si `locateColumns` los tomara como rótulos, headerRow/columns saldrían de la fila 0.
    const columns = locateColumns(ROL_GENERAL_AOA);
    expect(columns.headerRow).toBeGreaterThan(0);
  });

  it("nombra la columna que falta cuando PAGADO no aparece en el libro", () => {
    const columns = locateColumns(ROL_GENERAL_NO_PAGADO_AOA);
    expect(columns.paidCol).toBeNull();
    expect(missingColumnLabels(columns)).toEqual(["PAGADO"]);
  });

  it("un rótulo repetido más abajo no desplaza al primero", () => {
    // Simula lo que el archivo real hace con LIQUIDO A RECIBIR (AP y BH) y PAGADO (BZ y CC): la
    // etiqueta real va primero, una copia repetida más abajo no debe ganar.
    const grid: Cell[][] = ROL_GENERAL_AOA.map((row) => [...row]);
    const withDuplicate = [...grid, ["", "LIQUIDO A RECIBIR"] as Cell[]];
    const columns = locateColumns(withDuplicate);
    const original = locateColumns(ROL_GENERAL_AOA);
    expect(columns.netCol).toBe(original.netCol);
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
