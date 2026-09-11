import { describe, expect, it } from "vitest";
import type { Cell } from "@/lib/excel/workbook";
import { MONTHS_SHORT_ES } from "@/lib/date";
import { parsePersonnelCostGrids, readFamilySheet, readLegacySheet } from "./upload";
import { emptyLegacySeries } from "./legacy";

const MONTH_HEADER = [...MONTHS_SHORT_ES];

function legacyGrid(year: number, rows: Record<string, Cell[]>, extra: Cell[][] = []): Cell[][] {
  return [
    ["Cliente de prueba"],
    [`Ejercicio ${year}`],
    ["Cuatro líneas, un mes por columna."],
    [],
    ["Concepto", ...MONTH_HEADER, "Total"],
    ...Object.entries(rows).map(([label, values]) => [label, ...values]),
    ...extra,
  ];
}

const twelve = (fill: (month: number) => Cell): Cell[] =>
  Array.from({ length: 12 }, (_, month) => fill(month));

describe("readLegacySheet", () => {
  it("reads the four lines by label and the year from the title", () => {
    const grid = legacyGrid(2023, {
      "Afiliado personal": twelve((m) => (m + 1) * 100),
      "Afiliado familia": twelve(() => null),
      "Factura familia": twelve((m) => (m === 2 ? 50 : null)),
      Externos: twelve((m) => (m < 6 ? 10 : null)),
    });
    const result = readLegacySheet(grid);
    expect(result).not.toBeNull();
    expect(result?.year).toBe(2023);
    expect(result?.series["afiliado-personal"][11]).toBe(1200);
    expect(result?.series["afiliado-familia"]).toEqual(emptyLegacySeries()["afiliado-familia"]);
    expect(result?.series["factura-familia"][2]).toBe(50);
    expect(result?.series.externos[6]).toBeNull();
  });

  it("accepts numeric text and reads anything else as empty", () => {
    const grid = legacyGrid(2022, {
      "AFILIADO PERSONAL": twelve((m) => (m === 0 ? "1,234.50" : m === 1 ? "abc" : null)),
      "afiliado familia": twelve(() => null),
      "Factura  familia": twelve(() => null),
      Externos: twelve(() => null),
    });
    const result = readLegacySheet(grid);
    expect(result?.series["afiliado-personal"][0]).toBe(1234.5);
    expect(result?.series["afiliado-personal"][1]).toBeNull();
  });

  it("ignores the reference «Ventas» row and the Total column", () => {
    const grid = legacyGrid(
      2021,
      {
        "Afiliado personal": twelve(() => 1),
        "Afiliado familia": twelve(() => null),
        "Factura familia": twelve(() => null),
        Externos: twelve(() => null),
      },
      [["Ventas (referencia)", ...twelve(() => 999)]],
    );
    const result = readLegacySheet(grid);
    expect(result?.series["afiliado-personal"]).toEqual(twelve(() => 1));
  });

  it("is null without an «Ejercicio» title or a month header", () => {
    expect(readLegacySheet([["Otra cosa"], ["Concepto", ...MONTH_HEADER]])).toBeNull();
    expect(readLegacySheet([["Ejercicio 2020"], ["Concepto", "x"]])).toBeNull();
  });

  it("is null when a line is missing, so a half sheet cannot blank the rest", () => {
    const grid = legacyGrid(2020, { "Afiliado personal": twelve(() => 1) });
    expect(readLegacySheet(grid)).toBeNull();
  });
});

describe("readFamilySheet", () => {
  it("reads one year per row under the month header", () => {
    const grid: Cell[][] = [
      ["Cliente"],
      ["Nómina de familia"],
      [],
      ["Año", ...MONTH_HEADER],
      [2025, ...twelve((m) => (m < 3 ? 500 : null))],
      ["2026", ...twelve(() => null)],
      [null, ...twelve(() => 1)],
    ];
    const result = readFamilySheet(grid);
    expect(result?.map((row) => row.year)).toEqual([2025, 2026]);
    expect(result?.[0].amounts[2]).toBe(500);
    expect(result?.[0].amounts[3]).toBeNull();
    expect(result?.[1].amounts).toEqual(twelve(() => null));
  });

  it("is null without its title", () => {
    expect(readFamilySheet([["Ejercicio 2023"], ["Año", ...MONTH_HEADER]])).toBeNull();
  });
});

describe("parsePersonnelCostGrids", () => {
  const legacy = legacyGrid(2023, {
    "Afiliado personal": twelve(() => 1),
    "Afiliado familia": twelve(() => null),
    "Factura familia": twelve(() => null),
    Externos: twelve(() => null),
  });
  const family: Cell[][] = [
    ["Nómina de familia"],
    ["Año", ...MONTH_HEADER],
    [2026, ...twelve(() => 7)],
  ];

  it("collects every recognised sheet and ignores the rest", () => {
    const result = parsePersonnelCostGrids([
      { name: "Ejercicio 2023", grid: legacy },
      { name: "Notas", grid: [["cualquier cosa"]] },
      { name: "Nómina de familia", grid: family },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.legacy.map((entry) => entry.year)).toEqual([2023]);
    expect(result.family.map((entry) => entry.year)).toEqual([2026]);
  });

  it("rejects a workbook with nothing it recognises, naming what it expected", () => {
    const result = parsePersonnelCostGrids([{ name: "Hoja1", grid: [["x"]] }]);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.message).toMatch(/Ejercicio/);
  });

  it("rejects two sheets declaring the same exercise", () => {
    const result = parsePersonnelCostGrids([
      { name: "A", grid: legacy },
      { name: "B", grid: legacy },
    ]);
    expect(result.ok).toBe(false);
  });
});
