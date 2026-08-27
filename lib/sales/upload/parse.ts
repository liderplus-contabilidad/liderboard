/**
 * From a «Venta de Servicios por FACTURA» `.xlsx` to a month ready to store.
 *
 * Three rules govern this file, and all three are tested:
 *
 *   1. **The format is recognised by its SHAPE**, never by the file's name — the title and the
 *      four-label header. Another workbook is rejected NAMING what was expected, instead of trying
 *      to read it and returning an empty month.
 *   2. **The period is declared by the file** (`Desde:` / `Hasta:`) and has to be exactly one
 *      calendar month. The rule is `toCalendarMonth`'s, the SAME one the single statement and
 *      MicroPlus apply: there is no per-format exception, and that is why it is imported instead of
 *      rewritten.
 *   3. **The sum of the lines is SQUARED against the file's own total**, and a difference is stated
 *      by naming it. It is the only evidence that the reading did not leave rows behind, and without
 *      it a misclassified row is lost in silence among 2,774.
 *
 * It returns a result and does not throw: each file of a batch needs to be able to explain itself
 * without bringing the others down.
 */
import { readGrid, readWorkbook, type Cell } from "@/lib/excel/workbook";
import { toCalendarMonth, type DateRange } from "@/lib/profit-loss/upload/date-range";
import type { ParsedSalesMonth, SalesLine } from "../types";
import {
  findDeclaredTotal,
  findSalesCompany,
  findSalesHeader,
  findSalesRange,
  hasSalesTitle,
  readSalesRow,
  type SalesHeader,
} from "./grid";

export type SalesParseResult =
  | { ok: true; month: ParsedSalesMonth }
  | { ok: false; message: string };

/** One cent: below that, the difference against the file's total is floating-point noise and not an
 *  imbalance. */
const CENT = 0.005;

const WRONG_FORMAT =
  "No parece el reporte «Venta de Servicios por FACTURA»: falta su título o su cabecera " +
  "CODIGO · NOMBRE · CANTIDAD · VENTA TOTAL. Sube el reporte de ventas por servicio del mes.";

export function parseSalesWorkbook(data: ArrayBuffer): SalesParseResult {
  const workbook = readWorkbook(data);
  if (!workbook) {
    return { ok: false, message: "El archivo no es un Excel que se pueda leer." };
  }
  const grid = readGrid(workbook, workbook.SheetNames[0]);
  if (!grid) {
    return { ok: false, message: "El archivo no tiene ninguna hoja legible." };
  }
  return parseSalesGrid(grid);
}

export function parseSalesGrid(grid: readonly Cell[][]): SalesParseResult {
  // BOTH signs are required: only a sales report carries the title, and the four-label header is what
  // stops it claiming a balance that also writes `CODIGO` and `NOMBRE`.
  const header = findSalesHeader(grid);
  if (!hasSalesTitle(grid) || !header) {
    return { ok: false, message: WRONG_FORMAT };
  }

  const range = findSalesRange(grid);
  if (!range) {
    return {
      ok: false,
      message:
        "El archivo no declara su periodo (`Desde:` y `Hasta:`). La carga es mensual y el mes se " +
        "lee del propio reporte, nunca del nombre del archivo.",
    };
  }
  const period = toCalendarMonth(range as DateRange);
  if (!period.ok) {
    return { ok: false, message: period.message };
  }

  const { lines, declaredTotal } = readRows(grid, header);
  if (lines.length === 0) {
    return {
      ok: false,
      message:
        "El reporte no trae ninguna línea de factura. Comprueba que el mes exportado tiene " +
        "movimiento antes de subirlo.",
    };
  }

  return {
    ok: true,
    month: {
      year: period.year,
      monthIndex: period.month,
      companyName: findSalesCompany(grid, header.row),
      lines,
      declaredTotal,
      warnings: cuadre(lines, declaredTotal),
    },
  };
}

/**
 * The walk over the grid, and the only part that decides WHAT is a datum.
 *
 * Every row of the report is a COMPLETE invoice line —service, payer, quantity and amount—, and the
 * service's code is repeated in all of them: there is no grouping and there are no subtotals. What
 * separates a line from the rest is carrying that code and the four cells that follow it, which is
 * what `readSalesRow` checks; the preamble, the header and the two closing rows drop out on their own
 * for not meeting it, with no need to recognise each one by its label.
 *
 * The report's total is looked for AFTERWARDS, in the column where the lines wrote their amount: that
 * row carries no label, so the column is the only thing that identifies it.
 */
function readRows(
  grid: readonly Cell[][],
  header: SalesHeader,
): {
  lines: SalesLine[];
  declaredTotal: number | null;
} {
  const lines: SalesLine[] = [];
  let amountCol = -1;
  let lastDataRow = header.row;

  for (let index = header.row + 1; index < grid.length; index++) {
    const parsed = readSalesRow(grid[index] ?? []);
    if (!parsed) {
      continue;
    }
    amountCol = parsed.amountCol;
    lastDataRow = index;
    lines.push({
      serviceCode: parsed.serviceCode,
      serviceName: parsed.serviceName,
      payer: parsed.payer,
      quantity: parsed.quantity,
      amount: parsed.amount,
    });
  }

  return {
    lines,
    declaredTotal: amountCol === -1 ? null : findDeclaredTotal(grid, lastDataRow + 1, amountCol),
  };
}

/**
 * The balance against the file's total row. A notice and NOT a rejection: the month is loaded all the
 * same, because a difference may belong to the report and not to the reading, and being left with no
 * data does not help find out. What cannot happen is the difference not being stated.
 */
function cuadre(lines: readonly SalesLine[], declaredTotal: number | null): string[] {
  if (declaredTotal === null) {
    return [];
  }
  const sum = lines.reduce((total, line) => total + line.amount, 0);
  const difference = sum - declaredTotal;
  if (Math.abs(difference) < CENT) {
    return [];
  }
  return [
    `La suma de las ${lines.length} líneas leídas (${sum.toFixed(2)}) no coincide con el total ` +
      `que declara el archivo (${declaredTotal.toFixed(2)}): la diferencia es ${difference.toFixed(2)}.`,
  ];
}
