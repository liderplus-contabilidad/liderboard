/**
 * Contífico's «Cartera por Pagar (Detallado)», read by label. What the sheet says about itself:
 * the razón social on the first line, «Fecha de Corte: dd/mm/aaaa» a couple of rows under it, and a
 * header row with Proveedor · Razón Social · Tipo Documento · # Documento · F. Emisión · F.
 * Vencimiento · … · Total · Descripción · Valor documento · Retenciones · Pagos. The `FORMATO IDEAL`
 * pastes the same export with Provincia/Cantón in between, and the VENCIDA sheet renames the first
 * bucket «Por vencer» while POR VENCER calls it «Vencido» — none of which matters, because the
 * buckets are NOT read: `aging.ts` derives them at the cut date, which is the whole point.
 *
 * Two kinds of rows share the table: a SUBTOTAL per supplier (name in the first column, no Tipo
 * Documento, the buckets summed) and a DOCUMENT. Only the second becomes a payable; the first is
 * counted as skipped so the dialog can say so.
 */
import { normalizeLabel, type Cell } from "@/lib/excel/workbook";
import { toISODate } from "../dates";
import type { ParsedCartera, ParsedPayable } from "../types";
import { cellAmount, cellText, findHeaderRow, firstTextLine, locate, type Grid } from "./grid";

const REQUIRED = [
  "Proveedor",
  "Tipo Documento",
  "# Documento",
  "F. Emisión",
  "F. Vencimiento",
  "Total",
  "Valor documento",
  "Retenciones",
  "Pagos",
] as const;

const OPTIONAL = ["Razón Social", "Centro de Costo", "Descripción"] as const;

const CUT_PREFIX = "fecha de corte:";

export function matchesContifico(grid: Grid): boolean {
  return findHeaderRow(grid, REQUIRED) >= 0;
}

/** The «Fecha de Corte: 15/09/2026» line above the header, as ISO; `null` when it is not there. */
export function findCutDate(grid: Grid, headerRow: number): string | null {
  for (let index = 0; index < headerRow; index += 1) {
    for (const cell of grid[index] ?? []) {
      const text = normalizeLabel(cell);
      if (text.startsWith(CUT_PREFIX)) {
        return toISODate(text.slice(CUT_PREFIX.length).trim());
      }
    }
  }
  return null;
}

export function parseContifico(grid: Grid): ParsedCartera {
  const headerRow = findHeaderRow(grid, REQUIRED);
  const header = grid[headerRow] ?? [];
  const [
    supplierCol,
    typeCol,
    numberCol,
    issuedCol,
    dueCol,
    totalCol,
    amountCol,
    withCol,
    paidCol,
  ] = locate(header, REQUIRED);
  const [legalCol, centerCol, descCol] = locate(header, OPTIONAL);

  const payables: ParsedPayable[] = [];
  let skipped = 0;
  for (let index = headerRow + 1; index < grid.length; index += 1) {
    const row: readonly Cell[] = grid[index] ?? [];
    const supplier = cellText(row[supplierCol]);
    const docType = cellText(row[typeCol]);
    if (!supplier && !docType) {
      continue;
    }
    // A subtotal row names the supplier and nothing else worth reading.
    if (!docType || !cellText(row[numberCol])) {
      skipped += 1;
      continue;
    }
    const legal = legalCol >= 0 ? cellText(row[legalCol]) : "";
    payables.push({
      supplier: supplier || legal,
      supplierTaxId: null,
      docType,
      docNumber: cellText(row[numberCol]),
      description: descCol >= 0 ? cellText(row[descCol]) : "",
      issuedOn: toISODate(row[issuedCol]),
      dueOn: toISODate(row[dueCol]),
      amount: cellAmount(row[amountCol]),
      withholdings: cellAmount(row[withCol]),
      payments: cellAmount(row[paidCol]),
      balance: cellAmount(row[totalCol]),
      centerName: centerCol >= 0 ? cellText(row[centerCol]) || null : null,
    });
  }

  return {
    source: "contifico",
    companyName: firstTextLine(grid),
    cutDate: findCutDate(grid, headerRow),
    payables,
    skipped,
  };
}
