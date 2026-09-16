/**
 * Dingoo's «REPORTE · CUENTAS POR PAGAR», which is not a table but an OUTLINE: a header row
 * (Documento · Fecha · Concepto · Deuda · Abono · Saldo), then per supplier a row with its RUC and
 * name, one row per invoice («Factura 001-019-000000363» in Concepto, Deuda/Abono/Saldo), one row per
 * instalment («Vencida» / «Por vencer» / «Pagada» in Documento, its due date in Fecha, «Cuota #n» in
 * Concepto) and a «Total:» row; «Total General:» closes the report. Figures come as text in the
 * local format («1.234,56»), dates as `dd-mm-aaaa`.
 *
 * Which row is which is decided by its SHAPE and its labels, never by position: the RUC row has
 * digits in Documento and a name in Fecha; the document row has digits in Documento and a DATE in
 * Fecha («Factura 001-…», but also «Documento no autorizado 001-…»); the instalment row says one of
 * the three states. The document's type is read off the concept's words (`DOC_TYPES`), so the same
 * document wears the same code Contífico gives it. The due date of a document is that of its earliest UNPAID instalment;
 * with none, the invoice date. Dingoo declares no cut date: the dialog asks for one.
 */
import { normalizeLabel, type Cell } from "@/lib/excel/workbook";
import { toISODate } from "../dates";
import type { ParsedCartera, ParsedPayable } from "../types";
import { cellAmount, cellText, findHeaderRow, locate, type Grid } from "./grid";

const REQUIRED = ["Documento", "Fecha", "Concepto", "Deuda", "Abono", "Saldo"] as const;
const TITLE_LINES = ["reporte", "cuentas por pagar"];
const UNPAID_STATES = new Set(["vencida", "por vencer"]);
const STATES = new Set([...UNPAID_STATES, "pagada"]);
/** The concept's leading words → the code Contífico uses for the same document. */
const DOC_TYPES: readonly { prefix: string; code: string }[] = [
  { prefix: "factura", code: "FAC" },
  { prefix: "nota de venta", code: "NVE" },
  { prefix: "documento no autorizado", code: "DNA" },
  { prefix: "liquidacion", code: "LIQ" },
];
/** «Factura 001-019-000000363» → type «FAC», number «001-019-000000363». */
export function splitConcept(concept: string): { docType: string; docNumber: string } {
  const normalized = normalizeLabel(concept);
  const match = /(\d{3}-\d{3}-\d+)\s*$/.exec(concept);
  const docNumber = match ? match[1] : "";
  const known = DOC_TYPES.find((entry) => normalized.startsWith(entry.prefix));
  const docType = known
    ? known.code
    : concept
        .slice(0, match ? match.index : concept.length)
        .trim()
        .toUpperCase() || "DOC";
  return { docType, docNumber };
}

export function matchesDingoo(grid: Grid): boolean {
  const headerRow = findHeaderRow(grid, REQUIRED);
  if (headerRow < 0) {
    return false;
  }
  const preamble = new Set(
    grid.slice(0, headerRow).flatMap((row) => row.map((cell) => normalizeLabel(cell))),
  );
  return TITLE_LINES.every((line) => preamble.has(line));
}

/** The razón social: the first text line after «CUENTAS POR PAGAR» and before the header. */
function findCompany(grid: Grid, headerRow: number): string | null {
  let seenTitle = false;
  for (let index = 0; index < headerRow; index += 1) {
    for (const cell of grid[index] ?? []) {
      const text = cellText(cell);
      if (!text) {
        continue;
      }
      if (normalizeLabel(text) === "cuentas por pagar") {
        seenTitle = true;
      } else if (seenTitle) {
        return text;
      }
    }
  }
  return null;
}

export function parseDingoo(grid: Grid): ParsedCartera {
  const headerRow = findHeaderRow(grid, REQUIRED);
  const [docCol, dateCol, conceptCol, debtCol, paidCol, balanceCol] = locate(
    grid[headerRow] ?? [],
    REQUIRED,
  );

  const payables: ParsedPayable[] = [];
  let skipped = 0;
  let supplier: { name: string; taxId: string } | null = null;
  let current: ParsedPayable | null = null;
  let currentDue: string | null = null;

  const flush = () => {
    if (current) {
      current.dueOn = currentDue ?? current.issuedOn;
      payables.push(current);
    }
    current = null;
    currentDue = null;
  };

  for (let index = headerRow + 1; index < grid.length; index += 1) {
    const row: readonly Cell[] = grid[index] ?? [];
    const doc = cellText(row[docCol]);
    const concept = cellText(row[conceptCol]);
    const state = normalizeLabel(doc);

    if (STATES.has(state)) {
      // An instalment of the open invoice.
      if (current && UNPAID_STATES.has(state)) {
        const due = toISODate(row[dateCol]);
        if (due && (!currentDue || due < currentDue)) {
          currentDue = due;
        }
      }
      continue;
    }
    if (/^total/i.test(normalizeLabel(concept))) {
      flush();
      continue;
    }
    const issuedOn = toISODate(row[dateCol]);
    if (/^\d+$/.test(doc) && issuedOn && concept) {
      flush();
      if (!supplier) {
        skipped += 1;
        continue;
      }
      const { docType, docNumber } = splitConcept(concept);
      current = {
        supplier: supplier.name,
        supplierTaxId: supplier.taxId,
        docType,
        docNumber: docNumber || doc,
        description: concept,
        issuedOn,
        dueOn: null,
        amount: cellAmount(row[debtCol]),
        withholdings: 0,
        payments: cellAmount(row[paidCol]),
        balance: cellAmount(row[balanceCol]),
        centerName: null,
      };
      continue;
    }
    // A supplier row: digits in Documento, a name in Fecha.
    const name = cellText(row[dateCol]);
    if (/^\d{6,}$/.test(doc) && name && !toISODate(name)) {
      flush();
      supplier = { name, taxId: doc };
      continue;
    }
    if (doc || concept) {
      skipped += 1;
    }
  }
  flush();

  return {
    source: "dingoo",
    companyName: findCompany(grid, headerRow),
    cutDate: null,
    payables,
    skipped,
  };
}
