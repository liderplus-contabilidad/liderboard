/**
 * WHERE each thing is in the «Venta de Servicios por FACTURA» report, and how a cell is read.
 *
 * Everything is located by the LABEL the report itself writes —the title, `Desde:` / `Hasta:`, and the
 * header `CODIGO` · `NOMBRE` · `CANTIDAD` · `VENTA TOTAL`— and never by a fixed row or column: it is
 * the same family of report `microplus-grid.ts` and `dingoo-grid.ts` already read, and it spreads its
 * preamble across loose cells, so a coordinate would start reading the wrong cell the day the
 * template's margins change — and it would do it silently.
 *
 * Split from the strategy for the same reason as in PyG: the delicate half —locating labels and
 * deciding which row is a datum— is tested over bare grids, with no workbook in the way.
 */
import { compactLabel, type Cell } from "@/lib/excel/workbook";

/** The title that identifies the report. It is compared already compacted (no accents, no double
 *  spaces), so it does not matter how the template writes it. */
export const REPORT_TITLE = "venta de servicios por factura";

const CODE_LABEL = "codigo";
const NAME_LABEL = "nombre";
const QUANTITY_LABEL = "cantidad";
const AMOUNT_LABEL = "venta total";
const FROM_LABEL = "desde:";
const TO_LABEL = "hasta:";

/** The FOOTER's labels, which describe the print job and not the report. */
const PRINT_LABELS = new Set(["pagina:", "página:", "fecha:", "hora:", "usuario:"]);

const DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/**
 * A SERVICE's code exactly as the report writes it: a backslash and two digits (`\01`). It is kept
 * verbatim in the datum —it is what the accountant checks—, but to recognise it it is also accepted
 * without the backslash, because SheetJS may return the cell already cleaned depending on how it is
 * formatted.
 */
const SERVICE_CODE = /^\\?\d{2}$/;

export function salesLabel(cell: Cell): string {
  return compactLabel(cell);
}

function text(cell: Cell): string {
  return typeof cell === "string" ? cell.trim() : typeof cell === "number" ? String(cell) : "";
}

/**
 * The amounts arrive as TEXT with a thousands separator (`"107,231.22"`). Converting them with a bare
 * `Number` would give `NaN`, and a `NaN` rounded to `0` would leave the whole report at zero with not
 * a single visible error — which is exactly why this lives here with its own tests.
 *
 * `null` when the cell is not a number: it is what separates a data row from a label row.
 */
export function toSalesNumber(cell: Cell): number | null {
  if (typeof cell === "number") {
    return Number.isFinite(cell) ? cell : null;
  }
  const raw = text(cell).replace(/\$/g, "").replace(/\s/g, "");
  if (raw === "") {
    return null;
  }
  // The accountant's parentheses are the negative sign.
  const negative = /^\(.*\)$/.test(raw);
  const parsed = Number(raw.replace(/[()]/g, "").replace(/,/g, ""));
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return negative ? -parsed : parsed;
}

/** Is this the sales-by-service report? The title is searched for by its label, in any cell of the
 *  preamble — never in the file's name, which is renamed without consequence. */
export function hasSalesTitle(grid: readonly Cell[][]): boolean {
  return grid.some((row) => row.some((cell) => salesLabel(cell).includes(REPORT_TITLE)));
}

export interface SalesHeader {
  row: number;
  codeCol: number;
  nameCol: number;
  quantityCol: number;
  amountCol: number;
}

/**
 * The header row is the one carrying all FOUR labels at once. All four are required and not just two
 * because a `CODIGO`+`NOMBRE` header is also written by MicroPlus' balances, and with two this parser
 * would have claimed their files — the same error MicroPlus once made with Dingoo's.
 *
 * **Its columns identify the FORMAT, they do not locate the data**, and that distinction cost the
 * first reading of this report. The labels go CENTRED over merged cells, so they fall in different
 * columns from those of their own values: in the real file `CANTIDAD` is in column 19 and the
 * quantities in 18, `VENTA TOTAL` in 25 and the amounts in 24. Reading the data by the label's column
 * returns an empty cell in EVERY row, which is exactly how the failure looked: the file was
 * recognised, the period was read, and the report «brought no line at all». What locates a line is
 * `readSalesRow`, by RELATIVE position.
 */
export function findSalesHeader(grid: readonly Cell[][]): SalesHeader | null {
  for (let row = 0; row < grid.length; row++) {
    const cells = grid[row] ?? [];
    const found = { code: -1, name: -1, quantity: -1, amount: -1 };
    for (let col = 0; col < cells.length; col++) {
      const label = salesLabel(cells[col]);
      if (label === CODE_LABEL && found.code === -1) {
        found.code = col;
      } else if (label === NAME_LABEL && found.name === -1) {
        found.name = col;
      } else if (label === QUANTITY_LABEL && found.quantity === -1) {
        found.quantity = col;
      } else if (label === AMOUNT_LABEL && found.amount === -1) {
        found.amount = col;
      }
    }
    if (found.code !== -1 && found.name !== -1 && found.quantity !== -1 && found.amount !== -1) {
      return {
        row,
        codeCol: found.code,
        nameCol: found.name,
        quantityCol: found.quantity,
        amountCol: found.amount,
      };
    }
  }
  return null;
}

/** Is this row a printed footer (`Pagina:`, `Fecha:`)? */
export function isPrintRow(row: readonly Cell[]): boolean {
  return row.some((cell) => PRINT_LABELS.has(salesLabel(cell)));
}

/** The indices of a row's NON-empty cells, left to right. */
function filledColumns(row: readonly Cell[]): number[] {
  const columns: number[] = [];
  for (let col = 0; col < row.length; col++) {
    if (row[col] !== null && row[col] !== "") {
      columns.push(col);
    }
  }
  return columns;
}

export interface SalesRow {
  /** Verbatim, with its backslash (`\\01`) — it is what the accountant checks. */
  serviceCode: string;
  serviceName: string;
  payer: string;
  quantity: number;
  amount: number;
  /** Where the amount was. It is needed by the CLOSING row, which has no code to hang off. */
  amountCol: number;
}

/**
 * An invoice LINE, read by RELATIVE position: the service's code, and behind it the four non-empty
 * cells that follow it —service name, payer, quantity and amount—.
 *
 * Every row of the report is a COMPLETE line; there is no grouping by service and no subtotals, and
 * the code is repeated on each one. They are read by relative position and not by a fixed column
 * because the values live in columns no label names (see `findSalesHeader`), and because it is the
 * rule `microplus-grid.ts` already applies in this same family of reports: the value is the next cell
 * with something in it, not cell number N.
 *
 * `null` when the row is not a line — the preamble, the header, the close —, and it is `null` with no
 * exceptions: all FIVE cells are required and the last two must be numbers, so a row of labels cannot
 * slip in as a payer called «NOMBRE».
 */
export function readSalesRow(row: readonly Cell[]): SalesRow | null {
  const columns = filledColumns(row);
  const at = columns.findIndex((col) => SERVICE_CODE.test(text(row[col])));
  if (at === -1 || columns.length - at < 5) {
    return null;
  }
  const [codeCol, nameCol, payerCol, quantityCol, amountCol] = columns.slice(at, at + 5);
  const serviceName = text(row[nameCol]);
  const payer = text(row[payerCol]);
  const quantity = toSalesNumber(row[quantityCol]);
  const amount = toSalesNumber(row[amountCol]);
  if (serviceName === "" || payer === "" || quantity === null || amount === null) {
    return null;
  }
  return { serviceCode: text(row[codeCol]), serviceName, payer, quantity, amount, amountCol };
}

/**
 * The total the report declares at the close, read in the SAME column the lines write their amount in.
 *
 * That row carries no label at all —it is the quantity and the amount, bare, aligned under their
 * columns—, so there is no word to look for it by; what identifies it is where it writes its figure.
 * Looking for it by a `TOTAL` label would have found instead the `TOTAL ITEMS` row, which counts LINES
 * and not dollars, and the balance would have compared the month's amount against a count.
 *
 * `null` if it does not write one: then there is nothing to square against, and that is better than
 * squaring against a figure that means something else.
 */
export function findDeclaredTotal(
  grid: readonly Cell[][],
  fromRow: number,
  amountCol: number,
): number | null {
  let total: number | null = null;
  for (let row = fromRow; row < grid.length; row++) {
    const value = toSalesNumber(grid[row]?.[amountCol] ?? null);
    if (value !== null) {
      total = value;
    }
  }
  return total;
}

export interface SalesRange {
  fromDay: number;
  /** 0–11. */
  fromMonth: number;
  fromYear: number;
  toDay: number;
  toMonth: number;
  toYear: number;
}

function parseDate(cell: Cell): { day: number; month: number; year: number } | null {
  const match = DATE.exec(text(cell));
  return match
    ? { day: Number(match[1]), month: Number(match[2]) - 1, year: Number(match[3]) }
    : null;
}

/** The index of the first non-empty cell strictly after `from`, or `-1`. */
function nextFilledCol(row: readonly Cell[], from: number): number {
  for (let col = from + 1; col < row.length; col++) {
    if (row[col] !== null && row[col] !== "") {
      return col;
    }
  }
  return -1;
}

/**
 * The period, read from `Desde:` / `Hasta:` — label and date in SEPARATE cells, as in MicroPlus, and
 * not in the running `Desde el … hasta el …` line of the single statement. Both labels may be on the
 * same row or on different rows, so each one is looked for on its own.
 *
 * `null` if either of the two is missing: with no declared period there is NO upload, because deducing
 * it from somewhere else —the file's name, the printing date— is how a month ends up landing on
 * another.
 */
export function findSalesRange(grid: readonly Cell[][]): SalesRange | null {
  const from = findLabelledDate(grid, FROM_LABEL);
  const to = findLabelledDate(grid, TO_LABEL);
  if (!from || !to) {
    return null;
  }
  return {
    fromDay: from.day,
    fromMonth: from.month,
    fromYear: from.year,
    toDay: to.day,
    toMonth: to.month,
    toYear: to.year,
  };
}

function findLabelledDate(
  grid: readonly Cell[][],
  label: string,
): { day: number; month: number; year: number } | null {
  for (const row of grid) {
    // `startsWith` and not `===`: the report writes the date in its own cell («Desde:» ·
    // «01/04/2026») some times and stuck to the label («Desde: 01/04/2026») others, and with strict
    // equality the second form did not find the label and the file was rejected for not declaring a
    // period.
    const col = row.findIndex((cell) => salesLabel(cell).startsWith(label));
    if (col === -1) {
      continue;
    }
    // The date may come stuck to the label in the same cell («Desde: 01/04/2026») or in the next cell
    // with something in it — both forms have been seen in this family of reports.
    const inline = DATE.exec(text(row[col]).replace(/^[^:]*:\s*/, ""));
    if (inline) {
      return { day: Number(inline[1]), month: Number(inline[2]) - 1, year: Number(inline[3]) };
    }
    const valueCol = nextFilledCol(row, col);
    const parsed = valueCol === -1 ? null : parseDate(row[valueCol]);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

/**
 * The razón social: the first TEXT line of the preamble that is neither the report's own title nor a
 * printing label. It is the same rule `dingoo-grid.ts` applies by skipping `REPORTE` and `ESTADO DE
 * RESULTADOS` — without it, «the first non-empty line» returns the report's name instead of the
 * company's.
 */
export function findSalesCompany(grid: readonly Cell[][], headerRow: number): string {
  for (let row = 0; row < headerRow; row++) {
    // The row is NOT skipped whole even if it carries a footer: the report writes the razón social on
    // the left and the pagination twenty columns to its right, on the SAME row. What is filtered is
    // each cell.
    for (const cell of grid[row] ?? []) {
      // TEXT only: a razón social never arrives as a number, and a loose number of the preamble (the
      // page, a running number) does.
      if (typeof cell !== "string") {
        continue;
      }
      const raw = cell.trim();
      if (raw === "" || !/\p{L}/u.test(raw) || DATE.test(raw)) {
        continue;
      }
      const label = salesLabel(cell);
      if (label.includes(REPORT_TITLE) || PRINT_LABELS.has(label) || label.endsWith(":")) {
        continue;
      }
      return raw;
    }
  }
  return "";
}
