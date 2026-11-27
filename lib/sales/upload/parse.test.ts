import { describe, expect, it } from "vitest";
import type { Cell } from "@/lib/excel/workbook";
import {
  flatGrid,
  flatGridMinimal,
  flatGridWithLetterhead,
  flatWorkbook,
  oldFormatGrid,
  FIXTURE_LINES,
  type FixtureLine,
} from "./parse.fixtures";
import { parseSalesRows, parseSalesWorkbook, salesMonthLabel, sharedMonths } from "./parse";
import type { ParsedSalesMonth } from "../types";

/** The grid as the walker consumes it, with the declared size the sheet would carry. */
function read(grid: Cell[][]) {
  return parseSalesRows(grid, grid.length);
}

function monthsOf(result: ReturnType<typeof read>): ParsedSalesMonth[] {
  if (!result.ok) {
    throw new Error(`esperaba una lectura válida, llegó: ${result.message}`);
  }
  return result.reading.months;
}

describe("reconocimiento del formato", () => {
  it("lo lee igual con la cabecera bajo un membrete — el propio Excel del módulo", () => {
    expect(monthsOf(read(flatGridWithLetterhead()))).toEqual(monthsOf(read(flatGrid())));
  });

  it("lo lee igual trayendo SOLO las siete columnas obligatorias", () => {
    const full = monthsOf(read(flatGrid()));
    const minimal = monthsOf(read(flatGridMinimal()));
    expect(minimal.map((m) => m.lines)).toEqual(full.map((m) => m.lines));
    // Sin `COD. EMPRESA` no hay código que adoptar, y eso no rompe la lectura.
    expect(minimal.every((m) => m.companyCode === "")).toBe(true);
  });

  it("rechaza el reporte del formato viejo NOMBRANDO lo que faltó", () => {
    const result = read(oldFormatGrid());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("FECHA");
    expect(result.message).toContain("NETO");
  });

  it("rechaza un archivo que no es un Excel", () => {
    const garbage = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]).buffer;
    const result = parseSalesWorkbook(garbage);
    expect(result.ok).toBe(false);
  });
});

describe("el periodo lo decide cada línea", () => {
  it("un archivo de tres meses y dos años se reparte en tres meses", () => {
    const months = monthsOf(read(flatGrid()));
    expect(months.map(salesMonthLabel)).toEqual(["noviembre 2025", "marzo 2026", "abril 2026"]);
  });

  it("cada mes lleva sus propias líneas y su recuento", () => {
    const [nov, mar, abr] = monthsOf(read(flatGrid()));
    expect(nov.lineCount).toBe(1);
    expect(mar.lineCount).toBe(3);
    expect(abr.lineCount).toBe(2);
    expect(mar.lines).toHaveLength(3);
  });

  it("guarda el RANGO de días que el archivo cubre de cada mes — es lo que el modal declara antes de reemplazar", () => {
    const [, marzo] = monthsOf(read(flatGrid()));
    expect(marzo.firstDay).toBe(2);
    expect(marzo.lastDay).toBe(31);
  });

  it("adopta el código de empresa que el archivo declara", () => {
    expect(monthsOf(read(flatGrid())).every((m) => m.companyCode === "01")).toBe(true);
  });

  it("lee una fecha escrita dd/mm/aaaa igual que la del sistema", () => {
    const lines: FixtureLine[] = [{ ...FIXTURE_LINES[0], date: "02/03/2026" }];
    expect(monthsOf(read(flatGrid(lines)))[0]).toMatchObject({
      year: 2026,
      monthIndex: 2,
      firstDay: 2,
    });
  });
});

describe("lo que se guarda de cada línea", () => {
  it("son seis campos, y ni el paciente ni la factura ni la cantidad están entre ellos", () => {
    const [, marzo] = monthsOf(read(flatGrid()));
    expect(Object.keys(marzo.lines[0]).sort()).toEqual([
      "amount",
      "articleCode",
      "articleName",
      "seguro",
      "tipo",
      "vendor",
    ]);
  });

  it("ninguna línea guardada contiene el nombre del paciente", () => {
    const serialized = JSON.stringify(monthsOf(read(flatGrid())));
    expect(serialized).not.toContain("PACIENTE DE PRUEBA");
  });

  it("recorta el espacio final del nombre del artículo", () => {
    const [, marzo] = monthsOf(read(flatGrid()));
    expect(marzo.lines[0].articleName).toBe(
      "Visita en la oficina de un nuevo paciente, que requiere de tr",
    );
  });

  it("una línea en $0 se guarda y vale cero", () => {
    const [, marzo] = monthsOf(read(flatGrid()));
    const cero = marzo.lines.find((line) => line.articleCode === "001531");
    expect(cero?.amount).toBe(0);
  });
});

describe("el cuadre y los avisos son del ARCHIVO", () => {
  it("nombra la diferencia cuando la hoja declara más filas de las que se leyeron", () => {
    const grid = flatGrid();
    const result = parseSalesRows(grid, grid.length + 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reading.warnings[0]).toContain("3 de diferencia");
    // Es un aviso, no un rechazo: los meses se cargan igual.
    expect(result.reading.months).toHaveLength(3);
  });

  it("cuenta y declara las filas sin fecha legible, en vez de perderlas en silencio", () => {
    const lines: FixtureLine[] = [...FIXTURE_LINES, { ...FIXTURE_LINES[0], date: "" }];
    const grid = flatGrid(lines);
    const result = parseSalesRows(grid, grid.length);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reading.warnings[0]).toContain("1 fila no tiene");
    // Y no desaparece del cuadre: se leyó, solo que no se pudo archivar.
    expect(result.reading.warnings).toHaveLength(1);
  });

  it("un NETO ilegible se cuenta y se declara, y no entra como cero", () => {
    const lines: FixtureLine[] = [...FIXTURE_LINES, { ...FIXTURE_LINES[0], amount: "120,50" }];
    const grid = flatGrid(lines);
    const result = parseSalesRows(grid, grid.length);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reading.warnings).toHaveLength(1);
    expect(result.reading.warnings[0]).toContain("1 fila trae un NETO");
    const total = result.reading.months.reduce((sum, month) => sum + month.lineCount, 0);
    expect(total).toBe(FIXTURE_LINES.length);
  });

  it("los avisos NO viajan dentro de los meses — un archivo de 44 meses no los repite 44 veces", () => {
    const grid = flatGrid();
    const result = parseSalesRows(grid, grid.length + 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const month of result.reading.months) {
      expect(month).not.toHaveProperty("warnings");
    }
  });

  it("sin rango declarado no se cuadra contra nada, en vez de cuadrar contra una cifra inventada", () => {
    const result = parseSalesRows(flatGrid(), null);
    expect(result.ok && result.reading.warnings).toEqual([]);
  });

  it("rechaza un archivo cuyas líneas no tienen ninguna fecha legible", () => {
    const lines = FIXTURE_LINES.map((line) => ({ ...line, date: "" }));
    const result = read(flatGrid(lines));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("fecha");
  });
});

describe("parseSalesWorkbook", () => {
  it("lee el libro entero y cuadra contra el rango que la hoja declara", () => {
    const data = flatWorkbook([{ name: "Reporte", grid: flatGrid() }]);
    const result = parseSalesWorkbook(data);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reading.months).toHaveLength(3);
    expect(result.reading.warnings).toEqual([]);
  });
});

describe("sharedMonths", () => {
  function file(fileName: string, months: [number, number][]) {
    return {
      fileName,
      months: months.map(([year, monthIndex]) => ({
        year,
        monthIndex,
        lineCount: 1,
        firstDay: 1,
        lastDay: 1,
        companyCode: "01",
        lines: [],
      })),
    };
  }

  it("partir la historia por año es seguro: no comparten nada", () => {
    expect(
      sharedMonths([
        file("2025.xlsx", [
          [2025, 0],
          [2025, 1],
        ]),
        file("2026.xlsx", [
          [2026, 0],
          [2026, 1],
        ]),
      ]),
    ).toEqual([]);
  });

  it("dos rangos solapados se nombran, con los dos archivos y el mes", () => {
    const shared = sharedMonths([
      file("ene-mar.xlsx", [
        [2026, 0],
        [2026, 1],
        [2026, 2],
      ]),
      file("mar-abr.xlsx", [
        [2026, 2],
        [2026, 3],
      ]),
    ]);
    expect(shared).toHaveLength(1);
    expect(shared[0].fileNames).toEqual(["ene-mar.xlsx", "mar-abr.xlsx"]);
    expect(shared[0].months).toEqual(["marzo 2026"]);
  });

  it("dos archivos que comparten tres meses son UN mensaje, no tres", () => {
    const shared = sharedMonths([
      file("a.xlsx", [
        [2026, 0],
        [2026, 1],
        [2026, 2],
      ]),
      file("b.xlsx", [
        [2026, 0],
        [2026, 1],
        [2026, 2],
      ]),
    ]);
    expect(shared).toHaveLength(1);
    expect(shared[0].months).toHaveLength(3);
  });
});
