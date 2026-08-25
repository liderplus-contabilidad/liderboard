/**
 * LA REJILLA, DIBUJADA. El único archivo de la descarga que toca `exceljs`, y el que no decide nada:
 * qué celda lleva qué ya está resuelto en `rol-grid.ts`, y aquí solo se pone ancho, formato y color.
 * Es la misma separación que el comprobante en PDF, donde `render.ts` recorre cajas.
 *
 * La librería entra por import DINÁMICO, como `lib/profit-loss/export.ts` y `payslip/render.ts`:
 * quien no descargue el rol no paga sus bytes.
 */
import type ExcelJS from "exceljs";
import { letterheadLogos } from "@/lib/cost-center";
import { writeLetterhead, type LetterheadLine } from "@/lib/excel-logo";
import type { EntityLogo } from "@/lib/logos";
import { columnIndexOf, type RolCellFormat, type RolExportColumn } from "./columns";
import { buildRolGrid, type RolExportInput, type RolExportRow } from "./rol-grid";

const SHEET = "GENERAL";

/** Las máscaras de Excel. El dinero va sin símbolo, como en el libro del contador: la hoja entera
 *  es de dólares y repetirlo ochenta veces por fila solo estorba. */
const NUMBER_FORMATS: Record<RolCellFormat, string | null> = {
  money: "#,##0.00",
  hours: "#,##0.00",
  integer: "0",
  date: "dd/mm/yyyy",
  text: null,
};

/** Gris de cabecera y gris de bloque — los mismos tonos que las descargas de PyG. */
const HEADER_FILL = "FFF1F5F9";
const AREA_FILL = "FFE2E8F0";
const RULE_COLOR = "FF94A3B8";
/** La tinta del membrete: el gris con el que la app escribe un dato secundario. */
const LETTERHEAD_INK = "FF64748B";

/** Ancho de una columna que el catálogo no declara (los huecos del libro). */
const GAP_WIDTH = 6;

/** La columna en la que vive el bloque de título: la **B**, que es donde `findCompany` lo busca. */
const COMPANY_COLUMN = 2;

/**
 * Una fila de membrete de la rejilla, en la línea que `writeLetterhead` centra. El nombre manda y
 * las líneas del membrete son su pie de identidad —cuerpo pequeño, tinta suave—, el mismo escalón
 * que en el comprobante en PDF.
 */
function letterheadLineOf(row: RolExportRow): LetterheadLine {
  const text = String(row.cells[COMPANY_COLUMN - 1] ?? "");
  return row.kind === "company"
    ? { text, font: { bold: true, size: 13 } }
    : { text, font: { size: 9, color: { argb: LETTERHEAD_INK } } };
}

function paintRow(
  row: ExcelJS.Row,
  kind: RolExportRow["kind"],
  columns: readonly RolExportColumn[],
): void {
  if (kind === "labels") {
    row.font = { bold: true, size: 9 };
    row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    row.eachCell({ includeEmpty: false }, (cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    });
    row.height = 30;
    return;
  }
  if (kind === "area") {
    row.font = { bold: true };
    row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AREA_FILL } };
    return;
  }
  if (kind === "subtotal" || kind === "suman") {
    row.font = { bold: true };
    // La raya superior es lo que cierra el bloque, igual que en el estado de resultados de PyG.
    for (const column of columns) {
      row.getCell(columnIndexOf(column.letter) + 1).border = {
        top: { style: kind === "suman" ? "double" : "thin", color: { argb: RULE_COLOR } },
      };
    }
  }
}

/**
 * El libro entero, listo para bajar.
 *
 * Los ANCHOS se ponen antes que ninguna fila, porque `writeLogoHeader` los necesita para anclar el
 * membrete y porque abrir el hueco del logo escribe filas: hacerlo después obligaría a mover las que
 * ya estuvieran.
 */
export async function buildRolWorkbook(
  input: RolExportInput,
  logo?: EntityLogo | null,
): Promise<ArrayBuffer> {
  const { Workbook } = await import("exceljs");
  const grid = buildRolGrid(input);

  const wb = new Workbook();
  const ws = wb.addWorksheet(SHEET);

  const widths: number[] = [];
  for (const column of grid.columns) {
    widths[columnIndexOf(column.letter)] = column.width;
  }
  const lastColumn = widths.length;
  ws.columns = Array.from({ length: lastColumn }, (_, index) => ({
    width: widths[index] ?? GAP_WIDTH,
  }));

  // El del cliente a la izquierda y el de su centro a la derecha, la misma regla —y la misma
  // función— que coloca los del comprobante en PDF. Sin centro con logo, uno solo a la izquierda,
  // exactamente como antes.
  // El del cliente a la izquierda y el de su centro a la derecha, la misma regla —y la misma
  // función— que coloca los del comprobante en PDF. Sin centro con logo, uno solo a la izquierda,
  // exactamente como antes.
  //
  // El bloque de título se combina desde la **columna B**, no desde la A: `findCompany` busca ahí
  // la empresa al releer el archivo, y el valor de una celda combinada vive en su esquina superior
  // izquierda. Combinar desde la A dejaría el rótulo compuesto en una columna que ese lector no
  // mira, y un rol descargado volvería a entrar sin empresa.
  const logos = letterheadLogos(logo, input.costCenter);
  const head = grid.rows.filter((row) => row.kind === "company" || row.kind === "letterhead");
  writeLetterhead(wb, ws, {
    leftLogo: logos.left,
    rightLogo: logos.right,
    columns: lastColumn,
    firstColumn: COMPANY_COLUMN,
    lines: head.map(letterheadLineOf),
  });

  /** La última fila de rótulos, contada sobre lo que se ESCRIBE y no sobre la rejilla: el membrete
   *  ya no viaja en ella, así que un índice de la rejilla ya no es un número de fila. */
  let lastLabelRow = 0;
  for (const row of grid.rows) {
    if (row.kind === "company" || row.kind === "letterhead") {
      continue;
    }
    const written = ws.addRow([...row.cells]);
    if (row.kind === "labels") {
      lastLabelRow = written.number;
    }
    if (row.kind === "employee" || row.kind === "subtotal" || row.kind === "suman") {
      for (const column of grid.columns) {
        const format = NUMBER_FORMATS[column.format];
        if (format) {
          written.getCell(columnIndexOf(column.letter) + 1).numFmt = format;
        }
      }
    }
    paintRow(written, row.kind, grid.columns);
  }

  // Ochenta columnas se leen desplazándose a la derecha, así que el nombre tiene que quedarse a la
  // vista; y por debajo de los rótulos, para saber qué se está mirando. Dónde acaban los rótulos se
  // CUENTA mientras se escribe y no se estima: el membrete mide distinto según cuántas líneas
  // traiga el cliente, y una fila congelada de más taparía la primera área.
  ws.views = [{ state: "frozen", xSplit: 3, ySplit: lastLabelRow }];

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
