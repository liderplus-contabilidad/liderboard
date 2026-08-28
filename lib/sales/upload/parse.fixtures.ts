/**
 * The SHAPE of the «Venta de Servicios por FACTURA» report, with INVENTED figures and names.
 *
 * Transcribed from the real April 2026 file of the Hospital General Privado Durán, and what is
 * transcribed is the STRUCTURE:
 *
 *   - the preamble spread across loose cells, with the pagination twenty columns from the company;
 *   - `Desde:` / `Hasta:` with their date in a cell SEPARATE from the label, and both on the same row;
 *   - the four-label header **misaligned from its own data**, because it goes centred over merged
 *     cells: `CANTIDAD` falls one column to the right of the quantities and `VENTA TOTAL` one to the
 *     right of the amounts. It is the detail that made the real file be recognised and bring «no line
 *     at all», so the fixture cannot align them;
 *   - FLAT rows: each one is a complete line and repeats its service's code, with no grouping, no
 *     subtotals and no reprinted header;
 *   - the close in two rows — `TOTAL ITEMS` with the line COUNT, and below it the real total with NO
 *     LABEL AT ALL, aligned under the quantity and amount columns.
 *
 * What is NOT transcribed is a single datum: neither the razón social, nor the patients' names, nor
 * the amounts. A versioned test is no place for a patient's name, which is exactly what this module
 * exists not to show. And it lives here and not in `.context/`, which is not in the repository.
 *
 * **What the real file gives when passed through this parser**, so nobody has to derive it again:
 * 2,774 lines, 956 payers and $229,616.226 —squaring to the cent against the closing row— split into
 * HONORARIOS 107,231.22 (46.7 %), MEDICINAS 33,231.32 (14.5 %), EXAMENES DE LABORATORIO 30,984.06
 * (13.5 %), INSUMOS 29,148.11 (12.7 %) and IMAGENES 29,021.51 (12.6 %); the ten largest payers are
 * 57.5 % of the month and the remaining 946 add up to 97,540.32. They are the figures the firm
 * recognises from its own report, and the only external evidence that this reading means what it says.
 */
import type { Cell } from "@/lib/excel/workbook";

/** The real file's columns, so the fixture inherits its misalignment. */
const CODE_COL = 1;
const SERVICE_COL = 7;
const PAYER_COL = 14;
const QUANTITY_COL = 18;
const AMOUNT_COL = 24;

function row(cells: Record<number, Cell>, width = 27): Cell[] {
  return Array.from({ length: width }, (_unused, index) => cells[index] ?? null);
}

function line(
  code: string,
  service: string,
  payer: string,
  quantity: number,
  amount: Cell,
): Cell[] {
  return row({
    [CODE_COL]: code,
    [SERVICE_COL]: service,
    [PAYER_COL]: payer,
    [QUANTITY_COL]: quantity,
    [AMOUNT_COL]: amount,
  });
}

/** A minimal and COMPLETE grid: preamble, header, five lines of three services and the close. */
export function salesGrid(): Cell[][] {
  return [
    row({ 3: "CLINICA DE PRUEBA S.A.", 23: "Página:", 26: "1 de 2" }),
    row({ 23: "Fecha:", 26: 46259 }),
    // The title arrives with the spare space the report writes.
    row({ 3: "Venta de Servicios por FACTURA " }),
    row({}),
    row({ 8: "Desde:", 11: "01/04/2026", 15: "Hasta:", 16: "30/04/2026" }),
    row({}),
    // The four labels, each in the column the report CENTRES them in — none coincides with that of
    // its values.
    row({ 2: "CODIGO", 10: "NOMBRE", 19: "CANTIDAD", 25: "VENTA TOTAL" }),
    line("\\01", "HONORARIOS", "ASEGURADORA UNO S.A.", 1, 1200.5),
    line("\\02", "MEDICINAS", "ASEGURADORA UNO S.A.", 5, 250),
    line("\\01", "HONORARIOS", "MENDOZA PARRA LUIS ALBERTO", 3, 300),
    line("\\03", "INSUMOS", "CONFIASALUD", 2, 100),
    line("\\02", "MEDICINAS", "MENDOZA PARRA LUIS ALBERTO", 1, 49.5),
    // The count of LINES, which are not dollars.
    row({ 0: "TOTAL ITEMS", 5: 5 }),
    // And the real total, with no label, under its columns.
    row({ [QUANTITY_COL]: 12, [AMOUNT_COL]: 1900 }),
  ];
}

/** The same shape with a range that is NOT a calendar month. */
export function salesGridWithRange(from: string, to: string): Cell[][] {
  const grid = salesGrid();
  grid[4] = row({ 8: "Desde:", 11: from, 15: "Hasta:", 16: to });
  return grid;
}

/** The same shape with the amounts as TEXT with a thousands separator, which is how the variant where
 *  the report comes out already formatted writes them. */
export function salesGridWithTextAmounts(): Cell[][] {
  const grid = salesGrid();
  grid[7] = line("\\01", "HONORARIOS", "ASEGURADORA UNO S.A.", 1, "1,200.50");
  grid[8] = line("\\02", "MEDICINAS", "ASEGURADORA UNO S.A.", 5, "250.00");
  return grid;
}

/**
 * The same shape with EVERYTHING shifted three columns to the right — a change in the template's
 * margins. The reading has to give exactly the same, because nothing is located by coordinate.
 */
export function salesGridShifted(): Cell[][] {
  return salesGrid().map((cells) => [null, null, null, ...cells]);
}

/** A MicroPlus balance: it shares the `CODIGO` and `NOMBRE…` labels and is NOT this report. */
export function foreignGrid(): Cell[][] {
  return [
    row({ 3: "CLINICA DE PRUEBA S.A." }),
    row({ 3: "BALANCE DE PERDIDAS Y GANANCIAS" }),
    row({ 8: "Desde:", 11: "01/04/2026", 15: "Hasta:", 16: "30/04/2026" }),
    row({ 2: "CODIGO", 10: "NOMBRE DE LA CUENTA", 25: "SALDO" }),
    row({ 1: "4.", 7: "INGRESOS", 24: 1900 }),
  ];
}
