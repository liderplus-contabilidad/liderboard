import { describe, expect, it } from "vitest";
import { detectReloadConflicts } from "./conflicts";
import type { CellEdit, PygDataset } from "./types";

function dataset(marchValue: number, year = 2026): PygDataset {
  const values = Array.from({ length: 12 }, () => 0);
  values[2] = marchValue;
  return {
    id: "norte",
    fileName: "x.xlsx",
    uploadedAt: 0,
    companyName: "HOTELERA ANDES S.A.",
    periodLabel: `Ene–Dic ${year}`,
    year,
    baseFrequency: "mensual",
    role: "center",
    centerId: "sucursal-norte",
    costCenterName: "SUCURSAL NORTE",
    centerColor: "#000",
    order: 0,
    accounts: [{ code: "5.2.1.2.4", name: "Mantenimiento y Reparaciones", values }],
    resultFromFile: [],
    warnings: [],
  };
}

function edit(overrides: Partial<CellEdit> = {}): CellEdit {
  return {
    datasetId: "norte",
    code: "5.2.1.2.4",
    monthIndex: 2,
    value: 500,
    updatedAt: 1,
    ...overrides,
  };
}

describe("detectReloadConflicts", () => {
  it("reports a conflict when a value edit sits over a file value that changed", () => {
    const before = [dataset(715)];
    const after = [dataset(165)];
    const conflicts = detectReloadConflicts(before, after, [{ year: 2026, month: 2 }], [edit()]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      centerId: "sucursal-norte",
      code: "5.2.1.2.4",
      year: 2026,
      monthIndex: 2,
      previousFileValue: 715,
      newFileValue: 165,
      adjustmentValue: 500,
    });
  });

  it("reports no conflict when the file value is unchanged", () => {
    const before = [dataset(715)];
    const after = [dataset(715)];
    expect(detectReloadConflicts(before, after, [{ year: 2026, month: 2 }], [edit()])).toEqual([]);
  });

  it("reports no conflict for a comment-only edit, even if the file value changed", () => {
    const before = [dataset(715)];
    const after = [dataset(165)];
    const commentOnly = edit({ value: undefined, comment: "revisar" });
    expect(detectReloadConflicts(before, after, [{ year: 2026, month: 2 }], [commentOnly])).toEqual(
      [],
    );
  });

  it("ignores a value edit outside the touched months", () => {
    const before = [dataset(715)];
    const after = [dataset(165)];
    // Month 2 changed, but this batch only touched month 5 — the edit isn't examined at all.
    expect(detectReloadConflicts(before, after, [{ year: 2026, month: 5 }], [edit()])).toEqual([]);
  });

  it("no marca un ajuste del MISMO mes de otro año", () => {
    // El lote reescribió marzo de 2026; el ajuste vive en marzo de 2025 y no se toca. Sin el
    // año en la clave, `monthIndex` los haría indistinguibles.
    const before = [dataset(715, 2025)];
    const after = [dataset(165, 2025)];
    expect(detectReloadConflicts(before, after, [{ year: 2026, month: 2 }], [edit()])).toEqual([]);
  });
});
