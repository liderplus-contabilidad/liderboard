/**
 * Reads the module's own «Cartera para recargar» back (`export/cartera-workbook.ts` is the writer;
 * `CARTERA_COLUMNS` the contract they share, located by label). What comes out carries no ids:
 * a document recomposes its identity from what it says and names its account by label, both
 * resolved at the door by `db.replaceCartera`. A cell that does not read as what it should — an
 * unknown source, an unknown class, a date that is not one — falls to the safe value rather than
 * refusing the whole sheet, because the sheet is this module's own and a hand-edited cell is the
 * likeliest reason.
 */
import type { Cell } from "@/lib/excel/workbook";
import { toISODate } from "../dates";
import { CARTERA_COLUMNS } from "../export/cartera-workbook";
import type { PayableKind, PayableSource, PayPriority } from "../types";
import { cellAmount, cellText, findHeaderRow, locate, type Grid } from "./grid";

/** A stored document as the sheet says it: everything of a `Payable` but the ids. */
export interface StoredPayableRow {
  source: PayableSource;
  supplier: string;
  supplierTaxId: string | null;
  docType: string;
  docNumber: string;
  description: string;
  issuedOn: string | null;
  dueOn: string | null;
  amount: number;
  withholdings: number;
  payments: number;
  balance: number;
  centerName: string | null;
  kind: PayableKind | null;
  priority: PayPriority | null;
  payOn: string | null;
  /** The account's label («PRODUBANCO · 80010385»), or `null`. */
  payFromAccount: string | null;
  observation: string;
  approved: number | null;
  finalReview: boolean;
  notified: boolean;
  status: "open" | "settled";
  settledOn: string | null;
  cutDate: string;
}

const SOURCES = new Set<PayableSource>(["contifico", "dingoo", "manual"]);
const KINDS = new Set<PayableKind>([
  "sri",
  "iess",
  "arriendo",
  "sueldos",
  "cuota",
  "prestamo",
  "otros",
]);

const text = (cell: Cell) => cellText(cell);
const orNull = (cell: Cell) => cellText(cell) || null;
const flag = (cell: Cell) => /^(si|sí|x|true|1)$/i.test(cellText(cell));

export function matchesLiderplus(grid: Grid): boolean {
  return findHeaderRow(grid, CARTERA_COLUMNS, 10) >= 0;
}

export function parseLiderplus(grid: Grid): StoredPayableRow[] {
  const headerRow = findHeaderRow(grid, CARTERA_COLUMNS, 10);
  const index = locate(grid[headerRow] ?? [], CARTERA_COLUMNS);
  const rows: StoredPayableRow[] = [];
  for (let at = headerRow + 1; at < grid.length; at += 1) {
    const cells = grid[at] ?? [];
    if (cells.every((cell) => cellText(cell) === "")) {
      continue;
    }
    const col = (label: (typeof CARTERA_COLUMNS)[number]): Cell =>
      cells[index[CARTERA_COLUMNS.indexOf(label)]] ?? null;
    const source = text(col("Origen")) as PayableSource;
    const kind = text(col("Clase")) as PayableKind;
    const priority = text(col("Prioridad"));
    rows.push({
      source: SOURCES.has(source) ? source : "manual",
      supplier: text(col("Proveedor")),
      supplierTaxId: orNull(col("Identificación")),
      docType: text(col("Tipo")),
      docNumber: text(col("Documento")),
      description: text(col("Descripción")),
      issuedOn: toISODate(col("Emisión")),
      dueOn: toISODate(col("Vencimiento")),
      amount: cellAmount(col("Valor documento")),
      withholdings: cellAmount(col("Retenciones")),
      payments: cellAmount(col("Pagos")),
      balance: cellAmount(col("Saldo")),
      centerName: orNull(col("Centro")),
      kind: KINDS.has(kind) ? kind : null,
      priority: priority === "urgent" || priority === "pending" ? priority : null,
      payOn: toISODate(col("Programado")),
      payFromAccount: orNull(col("Pagar desde")),
      observation: text(col("Observación")),
      approved: text(col("Aprobado")) === "" ? null : cellAmount(col("Aprobado")),
      finalReview: flag(col("Revisión final")),
      notified: flag(col("Notificación")),
      status: text(col("Estado")) === "settled" ? "settled" : "open",
      settledOn: toISODate(col("Liquidado el")),
      cutDate: toISODate(col("Corte")) ?? "",
    });
  }
  return rows;
}
