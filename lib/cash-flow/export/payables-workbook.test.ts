import { describe, expect, it } from "vitest";
import type { Payable } from "../types";
import { buildPayablesWorkbook, REPORTE_CXP_COLUMNS, reporteCxpRow } from "./payables-workbook";

function payable(over: Partial<Payable>): Payable {
  return {
    id: "p",
    clientId: "c",
    source: "contifico",
    supplier: "AIGAJE TAMBI CLAUDIA JANETH",
    supplierTaxId: null,
    docType: "NVE",
    docNumber: "001-001-000000173",
    description: "AIGAJE TAMBI CLAUDIA JANETH",
    issuedOn: "2026-09-08",
    dueOn: "2026-10-08",
    amount: 175.56,
    withholdings: 0,
    payments: 0,
    balance: 175.56,
    centerName: null,
    priority: null,
    payOn: null,
    payFromAccountId: null,
    observation: "",
    approved: 175.56,
    finalReview: true,
    notified: false,
    status: "open",
    settledOn: null,
    cutDate: "2026-09-15",
    ...over,
  };
}

describe("REPORTE CXP", () => {
  it("has the FORMATO IDEAL's columns in its order", () => {
    expect(REPORTE_CXP_COLUMNS).toEqual([
      "RAZÓN SOCIAL",
      "DOCUMENTO",
      "F. EMISIÓN",
      "F. VENCIM.",
      "POR VENCER >120 DÍAS",
      "POR VENCER 120 DÍAS",
      "POR VENCER 90 DÍAS",
      "POR VENCER 60 DÍAS",
      "POR VENCER 30 DÍAS",
      "POR VENCER TOTAL",
      "VENCIDA POR 30 DÍAS",
      "VENCIDA POR 60 DÍAS",
      "VENCIDA POR 90 DÍAS",
      "VENCIDA POR 120 DÍAS",
      "VENCIDA POR >120 DÍAS",
      "VENCIDA TOTAL POR PAGAR",
      "CUENTAS POR PAGAR TOTAL",
      "VALOR DOCUM.",
      "RETENCIÓN",
      "PAGOS",
      "DESCRIPCIÓN",
      "CENTRO DE COSTOS",
      "OBSERVACIÓN DE CONTABILIDAD",
      "APROBACIÓN PRIMERA REVISIÓN",
      "APROBACIÓN REVISIÓN FINAL",
      "NOTIFICACION DE PAGO",
    ]);
  });

  it("writes a document due in 23 days under «POR VENCER 30 DÍAS» and in both totals", () => {
    const row = reporteCxpRow(payable({}), "2026-09-15");
    const at = (label: string) => row[REPORTE_CXP_COLUMNS.indexOf(label)];
    expect(at("DOCUMENTO")).toBe("NVE 001-001-000000173");
    expect(at("F. VENCIM.")).toBe("08/10/2026");
    expect(at("POR VENCER 30 DÍAS")).toBe(175.56);
    expect(at("POR VENCER TOTAL")).toBe(175.56);
    expect(at("VENCIDA TOTAL POR PAGAR")).toBe(0);
    expect(at("CUENTAS POR PAGAR TOTAL")).toBe(175.56);
    expect(at("APROBACIÓN PRIMERA REVISIÓN")).toBe(175.56);
    expect(at("APROBACIÓN REVISIÓN FINAL")).toBe("OK");
    expect(at("NOTIFICACION DE PAGO")).toBe("");
  });

  it("ages against the given date, so the same document is vencida on a later cut", () => {
    const row = reporteCxpRow(payable({}), "2026-11-20");
    const at = (label: string) => row[REPORTE_CXP_COLUMNS.indexOf(label)];
    expect(at("VENCIDA POR 60 DÍAS")).toBe(175.56);
    expect(at("POR VENCER TOTAL")).toBe(0);
  });

  it("builds a sheet headed by the columns", () => {
    const wb = buildPayablesWorkbook([payable({})], "2026-09-15", "NOMIK HOTELS S.A.S.");
    const ws = wb.getWorksheet("REPORTE CXP")!;
    const frozen = (ws.views[0] as { ySplit?: number }).ySplit ?? 0;
    const header = ws.getRow(frozen).values as unknown[];
    expect(header.slice(1)).toEqual(REPORTE_CXP_COLUMNS);
    expect(ws.rowCount).toBe(frozen + 2);
  });
});
