/**
 * Builds a downloadable occupancy workbook in the SAME layout the parser reads — stacked
 * month blocks on one sheet — so a downloaded file re-uploads and re-parses cleanly. What is
 * written per row is the grid's EFFECTIVE value: an untouched month exports the figures it
 * showed verbatim; an edited month exports its recomputed ones. Either way re-importing shows
 * exactly what the user last saw.
 *
 * Imported statically here; UI code must load this via dynamic `import()` so exceljs stays
 * out of the initial bundle.
 */
import ExcelJS from "exceljs";
import { MONTHS_FULL_ES } from "@/lib/date";
import { toOccupancyGrid, type OccupancyGrid } from "./derive";
import { DEFAULT_CENTER_ID, type OccupancyDataset } from "./types";

/** Column of the "Total / prom." cell — column AG, as in the real exports. */
const TOTAL_COL = 33;
const SHEET_NAME = "Hoja1";

/** Row labels the parser matches. Must stay in sync with the matchers in `parse.ts`. */
const ROW_LABELS: Record<string, string> = {
  available: "Num de Habitaciones que tiene el hotel para la venta/día",
  revenue: "Total de Ingresos ($$) en Habitaciones",
  sold: "Numero de Habitaciones vendidas y cobradas*",
  complimentary: "Número de Habitaciones Complementarias**",
  cancellations: "Cancelaciones (noches en el mes)***",
  noShows: "No Shows  (Habitaciones)",
  noShowsOta: "No Shows OTAS",
  adr: "ADR (Tarifa Promedio)",
  occupancy: "Ocupacion %",
  revpar: "RevPAR",
  cumulativeOccupancy: "%  ACUMULADO DIARIO",
  simples: "Simples",
  dobles: "Dobles",
  triples: "Triples",
  pax: "PAX TOTALES",
  cumulativePax: "PAX ACUMULADOS",
};

/** Rows the parser reads back as inputs / snapshot, in display order within a block. */
const METRIC_ORDER = [
  "available",
  "revenue",
  "sold",
  "complimentary",
  "cancellations",
  "noShows",
  "noShowsOta",
  "adr",
  "occupancy",
  "revpar",
  "cumulativeOccupancy",
];

/** Builds the whole year as one sheet of stacked month blocks. */
export function buildOccupancyWorkbook(year: OccupancyDataset): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LiderPlus";
  const ws = wb.addWorksheet(SHEET_NAME);

  ws.addRow([`Ocupación  - ${year.year}`]).getCell(1).font = { bold: true, size: 14 };
  // The two name lines the parser reads BY POSITION. The cost-center line is omitted for
  // `principal`: writing it would turn a hotel with no sucursales into one named after itself.
  ws.addRow([year.hotelName]).getCell(1).font = { bold: true };
  if (year.centerId !== DEFAULT_CENTER_ID) {
    ws.addRow([year.centerName]).getCell(1).font = { bold: true };
  }
  ws.addRow([]);

  for (let index = 0; index < 12; index++) {
    writeMonthBlock(ws, year, index);
    ws.addRow([]); // blank separator between blocks, as the source files have
  }

  ws.getColumn(1).width = 40;
  return wb;
}

/** Writes one month: header → day row → metrics → channels → room types → PAX. */
function writeMonthBlock(ws: ExcelJS.Worksheet, year: OccupancyDataset, index: number): void {
  const month = year.months[index];
  const grid = toOccupancyGrid(year, index);
  const days = grid.columns;
  const cell = (id: string) => grid.rows.find((r) => r.id === id);

  // "MES:  ENERO" · "NUMERO DE NOCHES:" · <nights> in column E, as the parser expects.
  const header = ws.addRow([`MES:  ${MONTHS_FULL_ES[index].toUpperCase()}`, "NUMERO DE NOCHES:"]);
  if (month.nights != null) {
    header.getCell(5).value = month.nights;
  }

  // "Dias en el mes" with 1..N, then TOTAL at column AG.
  const dayRow = ws.addRow(["Dias en el mes", ...Array.from({ length: days }, (_, d) => d + 1)]);
  dayRow.getCell(TOTAL_COL).value = "TOTAL";
  dayRow.getCell(TOTAL_COL + 1).value = "Porcentaje";
  dayRow.getCell(TOTAL_COL + 2).value = "Promedio";

  for (const id of METRIC_ORDER) {
    writeSeriesRow(ws, ROW_LABELS[id], cell(id), days);
  }

  ws.addRow(["Cantidades por día"]);
  for (const row of grid.rows.filter((r) => r.kind === "channel")) {
    writeSeriesRow(ws, row.label, row, days);
  }
  writeSeriesRow(ws, "TOTAL", cell("totalChannels"), days);

  ws.addRow(["Habitaciones"]);
  for (const id of ["simples", "dobles", "triples"]) {
    writeSeriesRow(ws, ROW_LABELS[id], cell(id), days);
  }
  writeSeriesRow(ws, "TOTAL", cell("totalRooms"), days);
  writeSeriesRow(ws, ROW_LABELS.pax, cell("pax"), days);
  writeSeriesRow(ws, ROW_LABELS.cumulativePax, cell("cumulativePax"), days);
}

/** One data row: label, one cell per day, and the aggregate in the TOTAL column. */
function writeSeriesRow(
  ws: ExcelJS.Worksheet,
  label: string,
  row: OccupancyGrid["rows"][number] | undefined,
  days: number,
): void {
  const cells: (number | null)[] = row
    ? Array.from({ length: days }, (_, d) => row.cells[d] ?? 0)
    : new Array<number>(days).fill(0);
  const written = ws.addRow([label, ...cells]);
  if (row) {
    written.getCell(TOTAL_COL).value = row.agg;
  }
}

/** Serializes a workbook to a Blob for `downloadBlob`. */
export async function workbookToBlob(wb: ExcelJS.Workbook): Promise<Blob> {
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** `OCUPACION_<HOTEL>_<SUCURSAL>_<YEAR>.xlsx`, so a folder of downloads reads on its own. */
export function occupancyExportFilename(year: OccupancyDataset): string {
  const word = (value: string) => sanitize(value).replace(/\s+/g, "_");
  const hotel = year.hotelName && year.hotelName !== "—" ? word(year.hotelName) : "";
  const center = year.centerId !== DEFAULT_CENTER_ID ? word(year.centerName) : "";
  const parts = ["OCUPACION", hotel, center, String(year.year)].filter(Boolean);
  return `${parts.join("_")}.xlsx`;
}

function sanitize(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
