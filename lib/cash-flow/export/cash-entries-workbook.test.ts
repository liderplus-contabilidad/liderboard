import { describe, expect, it } from "vitest";
import { deriveCashMatrix } from "../cash-entries";
import type { CashEntry, CashFlowCenter } from "../types";
import {
  buildCashEntriesWorkbook,
  sectionHeader,
  sectionRows,
  sectionTotals,
} from "./cash-entries-workbook";

const CENTERS: CashFlowCenter[] = [
  { id: "ha", clientId: "c", name: "HA" },
  { id: "hc", clientId: "c", name: "HC" },
  { id: "hk", clientId: "c", name: "HK" },
];

const ENTRIES: CashEntry[] = [
  {
    id: "m1",
    clientId: "c",
    section: "initial",
    date: "2026-08-11",
    detail: "PRESTAMO HK A HC",
    amounts: { hk: 1000 },
    loan: null,
    observation: "PAGO SR OBIOL-SONIA-CHINO",
  },
  {
    id: "v1",
    clientId: "c",
    section: "misc",
    date: "2026-08-11",
    detail: "SR OBIOL BONO HC",
    amounts: { hc: 850 },
    loan: { fromCenterId: "ha", toCenterId: "hc", amount: 200 },
    observation: "BONO HC",
  },
];

describe("Cargas cash workbook", () => {
  const matrix = deriveCashMatrix(ENTRIES, CENTERS, []);

  it("writes the book's header, rows and TOTAL per block", () => {
    const [initial, misc] = matrix.sections;
    expect(sectionHeader(initial)).toEqual(["FECHA", "DETALLE", "HA", "HC", "HK", "OBSERVACION"]);
    expect(sectionHeader(misc)).toEqual([
      "FECHA",
      "DETALLE",
      "HA",
      "HC",
      "HK",
      "HA-HC",
      "OBSERVACION",
    ]);
    expect(sectionRows(initial)).toEqual([
      ["11/08/2026", "PRESTAMO HK A HC", "", "", 1000, "PAGO SR OBIOL-SONIA-CHINO"],
    ]);
    expect(sectionTotals(misc)).toEqual(["TOTAL", "", 0, 850, 0, 200, ""]);
  });

  it("stacks the three blocks on one sheet", () => {
    const wb = buildCashEntriesWorkbook(matrix, "COMISERSA");
    const ws = wb.getWorksheet("CARGAS CASH");
    expect(ws).toBeDefined();
    const titles: string[] = [];
    ws?.eachRow((row) => {
      const first = row.getCell(1).value;
      if (typeof first === "string" && /^[A-Z ]+$/.test(first) && first !== "TOTAL") {
        titles.push(first);
      }
    });
    expect(titles).toEqual(expect.arrayContaining(["MOVIMIENTO INICIAL", "VARIOS", "PROVEEDORES"]));
    expect(titles.filter((title) => title === "FECHA")).toHaveLength(3);
  });
});
