import { describe, expect, it } from "vitest";
import { buildSalesWorkbook, salesExportFilename } from "./export";
import type { ParsedSalesMonth, SalesMonth } from "./types";
import { parseSalesGrid, parseSalesWorkbook } from "./upload/parse";
import { salesGrid } from "./upload/parse.fixtures";

/** The fixture's month, exactly as the parser hands it over — the real report's shape. */
function fixtureMonth(): ParsedSalesMonth {
  const result = parseSalesGrid(salesGrid());
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.month;
}

function stored(month: ParsedSalesMonth, clientId = "c1"): SalesMonth {
  return { ...month, id: `${clientId}:${month.year}-${month.monthIndex + 1}`, clientId };
}

/** A month that exercises what the fixture does not: no payer, no declared total, a NEGATIVE amount
 *  and cents that do not round. */
function bareMonth(): ParsedSalesMonth {
  return {
    year: 2025,
    monthIndex: 11,
    companyName: "CLINICA DE PRUEBA S.A.",
    lines: [
      { serviceCode: "\\01", serviceName: "HONORARIOS", payer: "", quantity: 2, amount: 333.33 },
      {
        serviceCode: "\\04",
        serviceName: "IMAGENES",
        payer: "PEREZ ANA",
        quantity: 1,
        amount: -12.5,
      },
    ],
    declaredTotal: null,
    warnings: [],
  };
}

async function roundTrip(months: SalesMonth[]): Promise<ParsedSalesMonth[]> {
  const buffer = await buildSalesWorkbook(months).xlsx.writeBuffer();
  const result = parseSalesWorkbook(buffer as ArrayBuffer);
  if (!result.ok) {
    throw new Error(`el libro descargado no se pudo volver a leer: ${result.message}`);
  }
  return result.months;
}

describe("ida y vuelta", () => {
  it("lo escrito vuelve EXACTAMENTE igual, avisos y total declarado incluidos", async () => {
    const months = [fixtureMonth(), bareMonth()];
    expect(await roundTrip(months.map((month) => stored(month)))).toEqual(
      // Sorted chronologically on the way out, whatever order they were handed over in.
      [bareMonth(), fixtureMonth()],
    );
  });

  it("un aviso de cuadre sobrevive el viaje: el total declarado se escribe, no la suma", async () => {
    const month = { ...fixtureMonth(), declaredTotal: 2000 };
    month.warnings = ["La suma no coincide"];
    const [back] = await roundTrip([stored(month)]);
    expect(back.declaredTotal).toBe(2000);
    expect(back.warnings).toHaveLength(1);
  });

  it("una razón social vacía vuelve vacía, sin sustituto", async () => {
    const [back] = await roundTrip([stored({ ...bareMonth(), companyName: "" })]);
    expect(back.companyName).toBe("");
  });

  it("cada hoja se llama por su mes", () => {
    const wb = buildSalesWorkbook([stored(fixtureMonth()), stored(bareMonth())]);
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(["Diciembre 2025", "Abril 2026"]);
  });

  it("sin total declarado no hay fila de total; con él, el cierre del reporte", () => {
    const cells = (month: ParsedSalesMonth) =>
      buildSalesWorkbook([stored(month)])
        .worksheets[0].getSheetValues()
        .flat()
        .filter((cell) => cell !== undefined);
    expect(cells(bareMonth())).not.toContain("TOTAL ITEMS");
    expect(cells(fixtureMonth())).toContain("TOTAL ITEMS");
  });
});

describe("el nombre del archivo", () => {
  it("lleva la empresa y el tramo de años", () => {
    expect(salesExportFilename("Clínica de Prueba S.A.", [2026, 2025])).toBe(
      "VENTAS_Clínica_de_Prueba_S.A._2025-2026.xlsx",
    );
    expect(salesExportFilename("", [2026])).toBe("VENTAS_2026.xlsx");
  });
});
