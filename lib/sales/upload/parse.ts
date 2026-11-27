/**
 * From a flat sales report `.xlsx` to the months ready to store.
 *
 *   1. The format is recognised by its LABELS; a file lacking one is rejected naming it.
 *   2. The period is decided by each LINE (its `FECHA`): a file may cover any range.
 *   3. The reading is squared against the sheet's own declared row count — the report writes no
 *      total, so it is rows that are squared, not dollars.
 *   4. The warnings belong to the FILE, never to the months it wrote.
 *
 * It returns a result and does not throw, and it never materialises the grid: rows are walked one
 * at a time.
 */
import {
  declaredRowCount,
  readDenseRows,
  readWorkbookDense,
  type Cell,
} from "@/lib/excel/workbook";
import { MONTHS_FULL_ES } from "@/lib/date";
import type { ParsedSalesMonth, SalesLine } from "../types";
import {
  findSalesHeader,
  missingSalesLabels,
  readSalesRow,
  REQUIRED_LABELS,
  type SalesHeader,
} from "./grid";

/** What one FILE brought: its months, and what the reading had to warn about. */
export interface SalesFileReading {
  months: ParsedSalesMonth[];
  /** Shown by the modal, never stored. */
  warnings: string[];
}

export type SalesParseResult =
  | { ok: true; reading: SalesFileReading }
  | { ok: false; message: string };

function wrongFormat(missing: readonly string[]): string {
  const named = missing.length === REQUIRED_LABELS.length ? REQUIRED_LABELS : missing;
  return (
    `No parece el reporte de ventas: no se encontró su cabecera. Faltan las columnas ` +
    `${named.join(" · ")}. Sube el reporte plano del sistema, que trae una fila por línea de ` +
    `factura.`
  );
}

export function parseSalesWorkbook(data: ArrayBuffer): SalesParseResult {
  const workbook = readWorkbookDense(data);
  if (!workbook) {
    return { ok: false, message: "El archivo no es un Excel que se pueda leer." };
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { ok: false, message: "El archivo no tiene ninguna hoja legible." };
  }
  const rows = readDenseRows(workbook, sheetName);
  if (!rows) {
    return { ok: false, message: `La hoja «${sheetName}» no se puede leer.` };
  }
  return parseSalesRows(rows, declaredRowCount(workbook, sheetName));
}

/**
 * The walk. `declaredRows` is what the sheet says about its own size, header included; `null`
 * when it says nothing.
 */
export function parseSalesRows(
  rows: Iterable<Cell[]>,
  declaredRows: number | null,
): SalesParseResult {
  // The header is looked for while walking; everything before it is preamble.
  let header: SalesHeader | null = null;
  let headerRow = -1;
  const preamble: Cell[][] = [];

  const months = new Map<string, ParsedSalesMonth>();
  let read = 0;
  let undated = 0;
  let unreadable = 0;
  let rowIndex = -1;

  for (const row of rows) {
    rowIndex++;
    if (!header) {
      const found = findSalesHeader([row]);
      if (found) {
        header = { ...found, row: rowIndex };
        headerRow = rowIndex;
        continue;
      }
      // Kept (bounded) only so the rejection can name what was missing.
      if (preamble.length < 50) {
        preamble.push(row);
      }
      continue;
    }
    const parsed = readSalesRow(row, header);
    if (parsed === null) {
      continue;
    }
    if ("undated" in parsed) {
      undated++;
      continue;
    }
    if ("unreadable" in parsed) {
      unreadable++;
      continue;
    }
    read++;
    const key = `${parsed.year}-${parsed.monthIndex}`;
    const line: SalesLine = {
      seguro: parsed.seguro,
      tipo: parsed.tipo,
      articleCode: parsed.articleCode,
      articleName: parsed.articleName,
      vendor: parsed.vendor,
      amount: parsed.amount,
    };
    const month = months.get(key);
    if (month) {
      month.lines.push(line);
      month.lineCount++;
      month.firstDay = Math.min(month.firstDay, parsed.day);
      month.lastDay = Math.max(month.lastDay, parsed.day);
      if (month.companyCode === "" && parsed.companyCode !== "") {
        month.companyCode = parsed.companyCode;
      }
      continue;
    }
    months.set(key, {
      year: parsed.year,
      monthIndex: parsed.monthIndex,
      lineCount: 1,
      firstDay: parsed.day,
      lastDay: parsed.day,
      companyCode: parsed.companyCode,
      lines: [line],
    });
  }

  if (!header) {
    return { ok: false, message: wrongFormat(missingSalesLabels(preamble)) };
  }
  if (months.size === 0) {
    return {
      ok: false,
      message:
        undated > 0
          ? `El reporte trae ${undated} ${undated === 1 ? "línea" : "líneas"} pero ninguna con ` +
            "una fecha que se pueda leer, así que no hay mes al que pertenezcan."
          : "El reporte no trae ninguna línea de factura. Comprueba que lo exportado tiene " +
            "movimiento antes de subirlo.",
    };
  }

  const ordered = [...months.values()].sort(
    (a, b) => a.year - b.year || a.monthIndex - b.monthIndex,
  );
  return {
    ok: true,
    reading: {
      months: ordered,
      warnings: fileWarnings(read, undated, unreadable, declaredRows, headerRow),
    },
  };
}

/**
 * The file's warnings. The declared count includes the header and its preamble, so they are
 * subtracted; undated rows were read, so they count towards the balance and are named apart.
 */
function fileWarnings(
  read: number,
  undated: number,
  unreadable: number,
  declaredRows: number | null,
  headerRow: number,
): string[] {
  const warnings: string[] = [];
  if (unreadable > 0) {
    warnings.push(
      `${unreadable} ${unreadable === 1 ? "fila trae" : "filas traen"} un NETO que no se puede ` +
        `leer como importe (se espera 1,234.56) y no ${unreadable === 1 ? "entró" : "entraron"}. ` +
        "Revisa el separador decimal del archivo.",
    );
  }
  if (undated > 0) {
    warnings.push(
      `${undated} ${undated === 1 ? "fila no tiene" : "filas no tienen"} una fecha que se pueda ` +
        `leer, así que ${undated === 1 ? "no entró" : "no entraron"} en ningún mes.`,
    );
  }
  if (declaredRows !== null) {
    const expected = declaredRows - headerRow - 1;
    const difference = expected - (read + undated + unreadable);
    if (difference !== 0) {
      warnings.push(
        `La hoja declara ${expected} ${expected === 1 ? "fila" : "filas"} de datos y se ` +
          `leyeron ${read + undated + unreadable}: ${Math.abs(difference)} de diferencia.`,
      );
    }
  }
  return warnings;
}

/** A month named as the modal and the messages say it. */
export function salesMonthLabel(month: { year: number; monthIndex: number }): string {
  return `${MONTHS_FULL_ES[month.monthIndex].toLowerCase()} ${month.year}`;
}

/**
 * The months two files of a batch SHARE. The batch is blocked on these: merging contradicts
 * «each month is replaced whole», and last-one-wins loses a file in silence.
 */
export function sharedMonths(
  files: readonly { fileName: string; months: readonly ParsedSalesMonth[] }[],
): { months: string[]; fileNames: string[] }[] {
  const owners = new Map<string, { label: string; fileNames: string[] }>();
  for (const file of files) {
    for (const month of file.months) {
      const key = `${month.year}-${month.monthIndex}`;
      const entry = owners.get(key) ?? { label: salesMonthLabel(month), fileNames: [] };
      if (!entry.fileNames.includes(file.fileName)) {
        entry.fileNames.push(file.fileName);
      }
      owners.set(key, entry);
    }
  }
  // Grouped by the PAIR of files, so two files sharing three months are one message and not three.
  const byPair = new Map<string, { months: string[]; fileNames: string[] }>();
  for (const entry of owners.values()) {
    if (entry.fileNames.length < 2) {
      continue;
    }
    const key = entry.fileNames.join(" · ");
    const group = byPair.get(key) ?? { months: [], fileNames: entry.fileNames };
    group.months.push(entry.label);
    byPair.set(key, group);
  }
  return [...byPair.values()];
}
