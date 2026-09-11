import { describe, expect, it } from "vitest";
import { buildPersonnelCostWorkbook, personnelCostExportFilename } from "./export";
import { emptyLegacySeries } from "./legacy";
import { parsePersonnelCostWorkbook } from "./upload";

const twelve = (fill: (month: number) => number | null) =>
  Array.from({ length: 12 }, (_, month) => fill(month));

describe("buildPersonnelCostWorkbook", () => {
  it("round-trips through the reader unchanged", async () => {
    const series = emptyLegacySeries();
    series["afiliado-personal"] = twelve((m) => (m + 1) * 1000.25);
    series["factura-familia"] = twelve((m) => (m === 5 ? 320 : null));
    const wb = buildPersonnelCostWorkbook({
      clientName: "Manor Galápagos",
      legacy: [{ year: 2023, series, revenue: twelve(() => 50000) }],
      family: [
        { year: 2026, amounts: twelve((m) => (m < 2 ? 800 : null)) },
        { year: 2025, amounts: twelve(() => null) },
      ],
    });
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(["Ejercicio 2023", "Nómina de familia"]);

    const buffer = await wb.xlsx.writeBuffer();
    const result = parsePersonnelCostWorkbook(buffer as ArrayBuffer);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.legacy).toEqual([{ year: 2023, series }]);
    expect(result.family).toEqual([
      { year: 2025, amounts: twelve(() => null) },
      { year: 2026, amounts: twelve((m) => (m < 2 ? 800 : null)) },
    ]);
  });

  it("writes no family sheet when there is nothing captured", () => {
    const wb = buildPersonnelCostWorkbook({
      clientName: "X",
      legacy: [{ year: 2020, series: emptyLegacySeries(), revenue: twelve(() => null) }],
      family: [],
    });
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(["Ejercicio 2020"]);
  });
});

describe("personnelCostExportFilename", () => {
  it("names the client and the span", () => {
    expect(personnelCostExportFilename("Manor Galápagos", [2026, 2023])).toBe(
      "COSTO_PERSONAL_Manor_Galápagos_2023-2026.xlsx",
    );
    expect(personnelCostExportFilename("", [])).toBe("COSTO_PERSONAL.xlsx");
  });
});
