/**
 * LA REJILLA, DIBUJADA. El único archivo de la descarga que toca `exceljs`, y el que no decide nada:
 * qué celda lleva qué ya está resuelto en `rol-grid.ts`, y aquí solo se pone ancho, formato y color.
 * Es la misma separación que el comprobante en PDF, donde `render.ts` recorre cajas.
 *
 * La librería entra por import DINÁMICO, como `lib/profit-loss/export.ts` y `payslip/render.ts`:
 * quien no descargue el rol no paga sus bytes.
 */
import type ExcelJS from "exceljs";
import { writeLogoHeader } from "@/lib/excel-logo";
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

function paintRow(
  row: ExcelJS.Row,
  kind: RolExportRow["kind"],
  columns: readonly RolExportColumn[],
): void {
  if (kind === "company") {
    row.getCell(2).font = { bold: true, size: 13 };
    return;
  }
  // El membrete, en cuerpo pequeño y tinta suave: es el pie de identidad del nombre de arriba, no
  // otro título. El mismo escalón que en el comprobante en PDF.
  if (kind === "letterhead") {
    row.getCell(2).font = { size: 9, color: { argb: LETTERHEAD_INK } };
    return;
  }
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

  writeLogoHeader(wb, ws, logo, null, 3);

  for (const row of grid.rows) {
    const written = ws.addRow([...row.cells]);
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
  // CUENTA sobre la rejilla y no se estima: el preámbulo mide distinto según cuántas líneas de
  // membrete traiga el cliente, y una fila congelada de más taparía la primera área.
  const lastLabelRow = grid.rows.reduce(
    (last, row, index) => (row.kind === "labels" ? index + 1 : last),
    0,
  );
  ws.views = [
    { state: "frozen", xSplit: 3, ySplit: ws.rowCount - grid.rows.length + lastLabelRow },
  ];

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
