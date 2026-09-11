import { describe, expect, it } from "vitest";
import type { Cell } from "@/lib/excel/workbook";
import {
  buildCaptureWorkbook,
  CAPTURE_COLUMNS,
  captureWorkbookFilename,
  parseCaptureGrid,
  parseCaptureWorkbook,
  type CaptureYearRows,
} from "./capture-workbook";
import { MONTHS_IN_YEAR, type RevenueExternalAmounts } from "./types";

const HEADER = { clientName: "Cultura Manor" };

function month(
  manualRevenue: number | null,
  cardRevenue: number | null,
  cardFees: number | null,
  adSpend: number | null,
): RevenueExternalAmounts {
  return { manualRevenue, cardRevenue, cardFees, adSpend };
}

const EMPTY = month(null, null, null, null);

/** Two years the way a real capture looks: a full one and a half-filled one, with gaps and zeros. */
const YEARS: CaptureYearRows[] = [
  {
    year: 2023,
    months: Array.from({ length: MONTHS_IN_YEAR }, (_, index) =>
      month(10000 + index * 1000.25, 4000.5 + index, 120.75, index === 5 ? 0 : 300),
    ),
  },
  {
    year: 2024,
    months: [
      month(56042.18, 20000, 600.6, null),
      month(47609, null, null, 0),
      month(null, 100.01, null, null),
      ...Array.from({ length: 9 }, () => EMPTY),
    ],
  },
];

async function roundTrip(years: CaptureYearRows[]) {
  const buffer = await buildCaptureWorkbook(years, HEADER).xlsx.writeBuffer();
  return parseCaptureWorkbook(buffer as unknown as ArrayBuffer);
}

describe("ida y vuelta", () => {
  it("devuelve exactamente los años escritos, `null` y ceros incluidos", async () => {
    const result = await roundTrip(YEARS);
    expect(result).toEqual({ ok: true, years: YEARS });
  });

  it("escribe los años en orden ascendente aunque lleguen en desorden", async () => {
    const result = await roundTrip([YEARS[1], YEARS[0]]);
    expect(result.ok && result.years.map((entry) => entry.year)).toEqual([2023, 2024]);
  });

  it("un mes sin ninguna cifra sale con cuatro celdas vacías, nunca `0`", async () => {
    const result = await roundTrip([{ year: 2024, months: YEARS[1].months }]);
    expect(result.ok && result.years[0].months[11]).toEqual(EMPTY);
  });

  it("el nombre del archivo nombra al cliente y es seguro para el sistema de archivos", () => {
    expect(captureWorkbookFilename({ clientName: "Hotel/Manor: Galápagos" })).toBe(
      "Datos registrados Hotel Manor  Galápagos.xlsx",
    );
    expect(captureWorkbookFilename({ clientName: "" })).toBe("Datos registrados LiderPlus.xlsx");
  });
});

function grid(rows: Cell[][], preamble: Cell[][] = [["Cultura Manor"], [], []]): Cell[][] {
  return [...preamble, [...CAPTURE_COLUMNS], ...rows];
}

describe("la lectura por etiqueta", () => {
  it("localiza la cabecera donde esté y lee el mes por nombre o por número", () => {
    const result = parseCaptureGrid(
      grid(
        [
          [2024, "Enero", 100, 50, 5, null],
          [2024, 3, 300, null, null, 0],
          ["2024", "diciembre", null, null, null, 12],
        ],
        [["nota de alguien"], [null, "otra"], [], [], []],
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.years).toHaveLength(1);
    const { months } = result.years[0];
    expect(months[0]).toEqual(month(100, 50, 5, null));
    expect(months[1]).toEqual(EMPTY);
    expect(months[2]).toEqual(month(300, null, null, 0));
    expect(months[11]).toEqual(month(null, null, null, 12));
  });

  it("acepta columnas en otro orden y una cifra escrita como texto con símbolo", () => {
    const result = parseCaptureGrid([
      ["Mes", "Publicidad", "Año", "Comis. TC", "Ventas", "Cobros TC"],
      ["Febrero", "$1,234.50", 2022, "", "17,338.85", null],
    ]);
    expect(result.ok && result.years[0].months[1]).toEqual(month(17338.85, null, null, 1234.5));
  });

  it("una fila vacía termina la tabla", () => {
    const result = parseCaptureGrid(
      grid([
        [2024, "Enero", 1, null, null, null],
        [null, null, null, null, null, null],
        [2024, "Febrero", "basura", null, null, null],
      ]),
    );
    expect(result.ok && result.years[0].months[1]).toEqual(EMPTY);
  });
});

describe("los rechazos", () => {
  it("un libro sin la cabecera se rechaza nombrando la cabecera", () => {
    const result = parseCaptureGrid([["CODIGO", "NOMBRE", "CANTIDAD", "VENTA TOTAL"]]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("Año · Mes · Ventas · Cobros TC · Comis. TC · Publicidad");
  });

  it("una cifra ilegible rechaza el archivo nombrando el mes y la columna", () => {
    const result = parseCaptureGrid(
      grid([
        [2024, "Enero", 1, 2, 3, 4],
        [2024, "Marzo", 1, 2, 3, "pendiente"],
      ]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("marzo 2024");
    expect(result.message).toContain("Publicidad");
  });

  it("un mes repetido rechaza el archivo", () => {
    const result = parseCaptureGrid(
      grid([
        [2024, "Marzo", 1, null, null, null],
        [2024, 3, 2, null, null, null],
      ]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("Marzo 2024");
  });

  it("un año o un mes ilegible rechazan el archivo nombrando la fila", () => {
    const badYear = parseCaptureGrid(grid([["24", "Enero", 1, null, null, null]]));
    expect(!badYear.ok && badYear.message).toContain("fila 5");
    const badMonth = parseCaptureGrid(grid([[2024, "Brumario", 1, null, null, null]]));
    expect(!badMonth.ok && badMonth.message).toContain("Brumario");
  });

  it("un buffer que no es un Excel se rechaza sin lanzar", () => {
    const result = parseCaptureWorkbook(new TextEncoder().encode("hola").buffer as ArrayBuffer);
    expect(result.ok).toBe(false);
  });
});
