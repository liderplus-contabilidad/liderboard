import { describe, expect, it } from "vitest";
import { DEDUCTION_CONCEPTS, INCOME_CONCEPTS } from "../concepts";
import {
  columnIndexOf,
  EXTRA_INCOME_COLUMN,
  OVERTIME_GROUP_LABELS,
  ROL_EXPORT_COLUMNS,
  sheetWidth,
} from "./columns";

describe("columnIndexOf", () => {
  it("cuenta como Excel", () => {
    expect(columnIndexOf("A")).toBe(0);
    expect(columnIndexOf("Z")).toBe(25);
    expect(columnIndexOf("AA")).toBe(26);
    expect(columnIndexOf("BZ")).toBe(77);
    expect(columnIndexOf("CA")).toBe(78);
  });
});

describe("el catálogo de columnas", () => {
  it("no repite ninguna letra", () => {
    const letters = ROL_EXPORT_COLUMNS.map((column) => column.letter);
    expect(new Set(letters).size).toBe(letters.length);
    expect(letters).not.toContain(EXTRA_INCOME_COLUMN.letter);
  });

  it("va en el orden de la hoja, sin saltar hacia atrás", () => {
    const indexes = ROL_EXPORT_COLUMNS.map((column) => columnIndexOf(column.letter));
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it("llega hasta CA y la columna extra va detrás", () => {
    expect(sheetWidth(ROL_EXPORT_COLUMNS)).toBe(columnIndexOf("CA") + 1);
    expect(columnIndexOf(EXTRA_INCOME_COLUMN.letter)).toBeGreaterThan(columnIndexOf("CA"));
  });

  it("no reproduce el bloque de trabajo del contador, que repite PAGADO tras CA", () => {
    // Si volviera, `findLabel` seguiría quedándose con el primero — pero el archivo diría dos veces
    // la misma cifra y la segunda no significaría nada.
    expect(ROL_EXPORT_COLUMNS.some((column) => column.letter === "CC")).toBe(false);
  });

  it("solo totaliza columnas numéricas, y nunca los días", () => {
    for (const column of ROL_EXPORT_COLUMNS) {
      if (column.totalled) {
        expect(column.format === "money" || column.format === "hours").toBe(true);
      }
    }
    expect(ROL_EXPORT_COLUMNS.find((column) => column.letter === "E")?.totalled).toBe(false);
  });

  it("deja vacías, con su letra, las columnas cuyo dato la app no guarda", () => {
    const ctx = null as never;
    for (const letter of ["AJ", "AK", "AL", "AM", "AQ", "AR", "BE"]) {
      const column = ROL_EXPORT_COLUMNS.find((entry) => entry.letter === letter);
      expect(column, `falta la columna ${letter}`).toBeDefined();
      expect(column?.read(ctx)).toBeNull();
    }
  });

  it("rotula todas menos las cuatro que el libro dejó sin nombre", () => {
    const unlabelled = ROL_EXPORT_COLUMNS.filter((column) => column.label === null).map(
      (column) => column.letter,
    );
    expect(unlabelled).toEqual(["AJ", "AK", "AL", "AM", "AR"]);
  });
});

describe("el cruce con el catálogo de conceptos", () => {
  // Un concepto declara de qué columna del libro sale; si esa letra no existe aquí, el importe se
  // escribiría en otra columna —o en ninguna— y ninguna suma lo delataría, porque el total sigue
  // cuadrando sin él.
  const letters = new Set(ROL_EXPORT_COLUMNS.map((column) => column.letter));

  it("toda columna de un ingreso existe en la hoja", () => {
    for (const concept of INCOME_CONCEPTS) {
      expect(letters, `${concept.code} · ${concept.column}`).toContain(concept.column);
      if (concept.kind === "calculado" && concept.hoursColumn) {
        expect(letters, `${concept.code} · horas ${concept.hoursColumn}`).toContain(
          concept.hoursColumn,
        );
      }
    }
  });

  it("toda columna de un egreso existe en la hoja", () => {
    for (const concept of DEDUCTION_CONCEPTS) {
      expect(letters, `${concept.code} · ${concept.column}`).toContain(concept.column);
    }
  });

  it("los agrupadores caen sobre columnas que existen", () => {
    for (const group of OVERTIME_GROUP_LABELS) {
      expect(letters).toContain(group.letter);
    }
  });
});
