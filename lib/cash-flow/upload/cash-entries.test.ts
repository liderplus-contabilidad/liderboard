import { describe, expect, it } from "vitest";
import type { CashFlowCenter } from "../types";
import {
  cashColumnRole,
  matchesCashSheet,
  parseCashSheet,
  splitLoanLabel,
  unknownCenterLabels,
} from "./cash-entries";
import { CASH_GRID, CONTIFICO_GRID } from "./fixtures";

const CENTERS: CashFlowCenter[] = [
  { id: "ha", clientId: "c", name: "HA" },
  { id: "hc", clientId: "c", name: "HC" },
];

describe("parseCashSheet · the CARGAS CASH sheet of Comisersa", () => {
  it("reads the two hand-written blocks by label and ignores PROVEEDORES", () => {
    expect(matchesCashSheet(CASH_GRID)).toBe(true);
    expect(matchesCashSheet(CONTIFICO_GRID)).toBe(false);
    const sheet = parseCashSheet(CASH_GRID);
    expect(sheet.sections.map((section) => section.id)).toEqual(["initial", "misc"]);
    const [initial, misc] = sheet.sections;
    expect(initial.columns).toEqual(["HA", "HC", "HK", "HA-HC", "HC-HA"]);
    expect(initial.rows).toEqual([
      {
        date: "2026-08-11",
        detail: "PRESTAMO HK A HC",
        amounts: { HK: 1000 },
        observation: "PAGO SR OBIOL-SONIA-CHINO",
      },
    ]);
    expect(misc.rows).toHaveLength(3);
    expect(misc.rows[2]).toEqual({
      date: "2026-08-11",
      detail: "SUELDO 07-2026 DON JOSE",
      amounts: { HC: 154.74, "HA-HC": 200 },
      observation: "CHINO MESERO",
    });
    // The blank lines inside a block and the TOTAL rows are not rows.
    expect(sheet.skipped).toBe(4);
  });

  it("reads a sheet that brings only one block", () => {
    const sheet = parseCashSheet([
      ["VARIOS"],
      ["FECHA", "DETALLE", "MONTO", "OBSERVACION"],
      ["11/08/2026", "BONO", 50, ""],
      ["TOTAL", null, 50],
    ]);
    expect(sheet.sections.map((section) => section.id)).toEqual(["misc"]);
    expect(sheet.sections[0].rows[0].amounts).toEqual({ MONTO: 50 });
  });
});

describe("cashColumnRole · what a column label means for the empresa", () => {
  it("tells a center, «Monto», a loan pair and the unknown apart", () => {
    expect(cashColumnRole("hc", CENTERS)).toEqual({ kind: "center", centerId: "hc" });
    expect(cashColumnRole("Monto", CENTERS)).toEqual({ kind: "amount" });
    expect(cashColumnRole("HA-HC", CENTERS)).toEqual({
      kind: "loan",
      fromCenterId: "ha",
      toCenterId: "hc",
    });
    expect(cashColumnRole("HA-HA", CENTERS)).toEqual({ kind: "unknown" });
    expect(cashColumnRole("HK", CENTERS)).toEqual({ kind: "unknown" });
    expect(cashColumnRole("HA-HK", CENTERS)).toEqual({ kind: "unknown" });
    expect(splitLoanLabel("A-B-C")).toBeNull();
  });

  it("proposes every center the sheet names and the empresa lacks, once", () => {
    expect(unknownCenterLabels(parseCashSheet(CASH_GRID), CENTERS)).toEqual(["HK"]);
    expect(unknownCenterLabels(parseCashSheet(CASH_GRID), [])).toEqual(["HA", "HC", "HK"]);
  });
});
