import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildSalesWorkbook, salesExportFilename, type SalesExportMonth } from "./export";
import { parseSalesWorkbook } from "./upload/parse";
import type { SalesLine } from "./types";

function line(overrides: Partial<SalesLine> = {}): SalesLine {
  return {
    seguro: "PARTICULAR",
    tipo: "MEDICINAS",
    articleCode: "000156",
    articleName: "CLARITROMICINA SOLIDO ORAL 250MG",
    vendor: "",
    amount: 35.5,
    ...overrides,
  };
}

function month(
  year: number,
  monthIndex: number,
  lines: SalesLine[],
  firstDay = 1,
): SalesExportMonth {
  return {
    id: `c:${year}-${monthIndex}`,
    clientId: "c",
    year,
    monthIndex,
    lines,
    firstDay,
    companyCode: "01",
  };
}

const MONTHS: SalesExportMonth[] = [
  month(
    2026,
    2,
    [
      line({
        seguro: "HUMANA",
        tipo: "HONORARIOS MEDICOS",
        articleCode: "99204CARD",
        articleName: "Visita en la oficina",
        vendor: "CASTELLANOS LOPEZ RAUL FABRICI",
        amount: 120,
      }),
      line({ amount: 0 }),
    ],
    2,
  ),
  month(
    2025,
    10,
    [
      line({
        seguro: "CONFIAMED",
        tipo: "EXAMENES DE LABORATORIO",
        articleCode: "360193",
        articleName: "SODIO",
        amount: 12,
      }),
    ],
    10,
  ),
];

/** The workbook as an `ArrayBuffer`, which is what the upload receives. */
function roundTrip(months: readonly SalesExportMonth[]): ArrayBuffer {
  return XLSX.write(buildSalesWorkbook(months), { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("buildSalesWorkbook", () => {
  it("escribe UNA sola hoja, no una por mes: el periodo ya lo decide cada línea", () => {
    expect(buildSalesWorkbook(MONTHS).SheetNames).toEqual(["Ventas"]);
  });

  it("la cabecera es la que el lector exige, con el código de empresa delante", () => {
    const sheet = buildSalesWorkbook(MONTHS).Sheets["Ventas"];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    expect(rows[0]).toEqual([
      "COD. EMPRESA",
      "FECHA",
      "SEGURO",
      "TIPO DE SERVICIO.",
      "COD. ARTICULO",
      "NOMBRE DEL ARTICULO",
      "VENDEDOR",
      "NETO",
    ]);
  });

  it("la FECHA se escribe como TEXTO, nunca como celda de fecha", () => {
    const sheet = buildSalesWorkbook(MONTHS).Sheets["Ventas"];
    // La primera línea de datos es la de 2025-11 (el libro ordena cronológicamente).
    const cell = sheet["B2"] as XLSX.CellObject;
    expect(cell.t).toBe("s");
    expect(cell.v).toBe("2025-11-10 00:00:00.000");
  });

  it("ordena los meses cronológicamente llegue como llegue", () => {
    const sheet = buildSalesWorkbook(MONTHS).Sheets["Ventas"];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    expect(String(rows[1][1]).slice(0, 7)).toBe("2025-11");
    expect(String(rows[2][1]).slice(0, 7)).toBe("2026-03");
  });

  it("no escribe nada derivado: ni totales, ni porcentajes, ni recuentos", () => {
    const sheet = buildSalesWorkbook(MONTHS).Sheets["Ventas"];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    // Cabecera + tres líneas, y ni una fila más.
    expect(rows).toHaveLength(4);
    expect(JSON.stringify(rows)).not.toContain("TOTAL");
  });
});

describe("la ida y la vuelta", () => {
  it("lo que sale vuelve a entrar y deja los mismos meses, con sus mismas líneas", () => {
    const result = parseSalesWorkbook(roundTrip(MONTHS));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const back = result.reading.months;
    expect(back).toHaveLength(2);
    expect(back[0]).toMatchObject({ year: 2025, monthIndex: 10, lineCount: 1, companyCode: "01" });
    expect(back[1]).toMatchObject({ year: 2026, monthIndex: 2, lineCount: 2, companyCode: "01" });
    // Las líneas, campo por campo.
    expect(back[1].lines).toEqual(MONTHS[0].lines);
    expect(back[0].lines).toEqual(MONTHS[1].lines);
  });

  it("vuelve sin ningún aviso: una hoja exportada cuadra siempre consigo misma", () => {
    const result = parseSalesWorkbook(roundTrip(MONTHS));
    expect(result.ok && result.reading.warnings).toEqual([]);
  });

  it("el primer día de la cobertura sobrevive al viaje", () => {
    const result = parseSalesWorkbook(roundTrip(MONTHS));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reading.months[1].firstDay).toBe(2);
  });

  it("una línea en $0 y un vendedor vacío vuelven como salieron", () => {
    const result = parseSalesWorkbook(roundTrip(MONTHS));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cero = result.reading.months[1].lines.find((entry) => entry.amount === 0);
    expect(cero).toBeDefined();
    expect(cero?.vendor).toBe("");
  });
});

describe("salesExportFilename", () => {
  it("nombra la empresa y el tramo de años", () => {
    expect(salesExportFilename("01", [2025, 2026])).toBe("VENTAS_01_2025-2026.xlsx");
  });

  it("quita lo que un sistema de archivos no admite", () => {
    expect(salesExportFilename('A/B:C*?"<>|', [2026])).toBe("VENTAS_ABC_2026.xlsx");
  });
});
