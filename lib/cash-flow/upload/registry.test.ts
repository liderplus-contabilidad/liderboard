import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { CHECKS_GRID, CONTIFICO_GRID, DINGOO_GRID, FORMATO_IDEAL_VENCIDA_GRID } from "./fixtures";
import type { Grid } from "./grid";
import { readCartera, REJECTION } from "./registry";

function workbook(sheets: Record<string, Grid>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, grid] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(grid), name);
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return out;
}

describe("readCartera", () => {
  it("picks Contífico's reader", () => {
    const result = readCartera(workbook({ "Control de Cartera Detallado": CONTIFICO_GRID }));
    expect(result.ok && result.kind === "system" && result.strategy.id).toBe("contifico");
    expect(result.ok && result.kind === "system" && result.cartera.payables).toHaveLength(4);
  });

  it("picks Dingoo's reader", () => {
    const result = readCartera(workbook({ RptReportePagos: DINGOO_GRID }));
    expect(result.ok && result.kind === "system" && result.strategy.id).toBe("dingoo");
  });

  it("finds the paste on a later sheet of the FORMATO IDEAL", () => {
    const result = readCartera(
      workbook({ FACTURAS: [["DETALLADO"]], VENCIDA: FORMATO_IDEAL_VENCIDA_GRID }),
    );
    expect(result.ok && result.sheetName).toBe("VENCIDA");
  });

  it("rejects another book naming the accepted formats", () => {
    const result = readCartera(workbook({ "PAGO A PROVEEDORES": CHECKS_GRID }));
    expect(result).toEqual({ ok: false, message: REJECTION });
    expect(readCartera(new ArrayBuffer(4)).ok).toBe(false);
  });
});
