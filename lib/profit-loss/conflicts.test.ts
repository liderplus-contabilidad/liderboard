import { describe, expect, it } from "vitest";
import { detectReloadConflicts } from "./conflicts";
import type { CellEdit, PygDataset } from "./types";

function dataset(marchValue: number): PygDataset {
  const values = Array.from({ length: 12 }, () => 0);
  values[2] = marchValue;
  return {
    id: "norte",
    fileName: "x.xlsx",
    uploadedAt: 0,
    companyName: "HOTELERA ANDES S.A.",
    periodLabel: "Ene–Dic 2026",
    year: 2026,
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
    const conflicts = detectReloadConflicts(before, after, [2], [edit()]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      centerId: "sucursal-norte",
      code: "5.2.1.2.4",
      monthIndex: 2,
      previousFileValue: 715,
      newFileValue: 165,
      adjustmentValue: 500,
    });
  });

  it("reports no conflict when the file value is unchanged", () => {
    const before = [dataset(715)];
    const after = [dataset(715)];
    expect(detectReloadConflicts(before, after, [2], [edit()])).toEqual([]);
  });

  it("reports no conflict for a comment-only edit, even if the file value changed", () => {
    const before = [dataset(715)];
    const after = [dataset(165)];
    const commentOnly = edit({ value: undefined, comment: "revisar" });
    expect(detectReloadConflicts(before, after, [2], [commentOnly])).toEqual([]);
  });

  it("ignores a value edit outside the touched months", () => {
    const before = [dataset(715)];
    const after = [dataset(165)];
    // Month 2 changed, but this batch only touched month 5 — the edit isn't examined at all.
    expect(detectReloadConflicts(before, after, [5], [edit()])).toEqual([]);
  });
});
