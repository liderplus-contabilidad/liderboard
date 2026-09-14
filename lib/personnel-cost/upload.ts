/**
 * From the module's own «Excel con tus datos» back to what it stores.
 *
 * The file this reads is the one `./export.ts` writes, and nothing else: a sheet per typed exercise
 * and one sheet for the nómina de familia. Everything is located BY LABEL —the title under the client
 * name, the month header, the four lines' own labels— and never by coordinate, the rule every reader
 * in the repo holds up (`microplus-grid.ts`, `dingoo-grid.ts`, `sales/upload/`): a row inserted above
 * the table must not move the reading onto the wrong cell in silence.
 *
 * **The «Ventas» row is written but never read.** It is the divisor `resolveMonthlyRevenue` resolves
 * —raíz 4 where there is one, «Reportería de ingresos» where there is not— and this module does not
 * store it; reading it back would be a second answer to «cuánto se vendió en marzo».
 *
 * **Which years may be written is NOT decided here.** A typed exercise of a year the estado de
 * resultados answers is rejected by the provider, which is what knows PyG's years; the reader only
 * says what the file carries. Sheets it does not recognise are skipped —a note somebody added does
 * not bring the backup down— but a workbook with NOTHING recognisable is refused naming what was
 * expected, so a wrong file never «loads» as an empty success.
 *
 * It returns a result and does not throw, like the sales reader, so the modal can list the failure
 * beside the file.
 */
import { MONTHS_SHORT_ES } from "@/lib/date";
import {
  FAMILY_HEADER_LABEL,
  FAMILY_SHEET_TITLE,
  LEGACY_HEADER_LABEL,
  LEGACY_SHEET_TITLE,
} from "./backup-shape";
import { compactLabel, readGrid, readWorkbook, type Cell } from "@/lib/excel/workbook";
import {
  emptyLegacySeries,
  PERSONNEL_LEGACY_COST_ROWS,
  type PersonnelLegacySeries,
} from "./legacy";
import { MONTHS_IN_YEAR } from "./types";

const LEGACY_TITLE = new RegExp(`^${compactLabel(LEGACY_SHEET_TITLE)} (\\d{4})$`);
const FAMILY_TITLE = compactLabel(FAMILY_SHEET_TITLE);
const MONTH_LABELS = MONTHS_SHORT_ES.map((label) => compactLabel(label));

export interface ParsedLegacyYear {
  year: number;
  series: PersonnelLegacySeries;
}

export interface ParsedFamilyYear {
  year: number;
  /** Twelve slots, `null` where the cell was empty. */
  amounts: (number | null)[];
}

export interface ParsedPersonnelCostBackup {
  legacy: ParsedLegacyYear[];
  family: ParsedFamilyYear[];
}

export type PersonnelCostParseResult =
  | ({ ok: true } & ParsedPersonnelCostBackup)
  | { ok: false; message: string };

const NOTHING_RECOGNISED =
  "No parece el «Excel con tus datos» de Análisis costo personal: no tiene ninguna hoja " +
  `«${LEGACY_SHEET_TITLE} <año>» ni «${FAMILY_SHEET_TITLE}».`;

/**
 * A cell as an amount: a number, or numeric TEXT as Excel sometimes hands a formatted cell back
 * (`"1,234.50"`). Anything else is `null` — an empty cell and a word both mean «nothing written», and
 * turning a word into `0` would claim a cost of nothing.
 */
export function toAmount(cell: Cell): number | null {
  if (typeof cell === "number") {
    return Number.isFinite(cell) ? cell : null;
  }
  if (typeof cell !== "string") {
    return null;
  }
  const raw = cell.replace(/\$/g, "").replace(/,/g, "").trim();
  if (raw === "") {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The header row and the column of each month: the row whose first cell is `label` followed by the
 * twelve month abbreviations, in order. The columns are read off the header rather than assumed
 * contiguous, so a column somebody inserted does not shift January onto February.
 */
function findMonthHeader(
  grid: readonly Cell[][],
  label: string,
): { row: number; columns: number[] } | null {
  const wanted = compactLabel(label);
  for (let row = 0; row < grid.length; row += 1) {
    const cells = grid[row];
    if (compactLabel(cells[0] ?? null) !== wanted) {
      continue;
    }
    const columns = MONTH_LABELS.map((month) =>
      cells.findIndex((cell, column) => column > 0 && compactLabel(cell) === month),
    );
    if (columns.every((column) => column > 0)) {
      return { row, columns };
    }
  }
  return null;
}

function findTitle(grid: readonly Cell[][], matches: (label: string) => boolean): boolean {
  return grid.some((cells) => cells.some((cell) => matches(compactLabel(cell))));
}

/** A typed exercise's sheet, or `null` when the grid is not one. */
export function readLegacySheet(grid: readonly Cell[][]): ParsedLegacyYear | null {
  let year: number | null = null;
  for (const cells of grid) {
    for (const cell of cells) {
      const match = LEGACY_TITLE.exec(compactLabel(cell));
      if (match) {
        year = Number(match[1]);
        break;
      }
    }
    if (year !== null) {
      break;
    }
  }
  if (year === null) {
    return null;
  }
  const header = findMonthHeader(grid, LEGACY_HEADER_LABEL);
  if (!header) {
    return null;
  }
  const series = emptyLegacySeries();
  for (const row of PERSONNEL_LEGACY_COST_ROWS) {
    const wanted = compactLabel(row.label);
    const cells = grid
      .slice(header.row + 1)
      .find((candidate) => compactLabel(candidate[0] ?? null) === wanted);
    if (!cells) {
      // All four or nothing: a sheet missing a line is not this sheet, and reading the three found
      // would blank the fourth on the year it replaces.
      return null;
    }
    for (let month = 0; month < MONTHS_IN_YEAR; month += 1) {
      series[row.id][month] = toAmount(cells[header.columns[month]] ?? null);
    }
  }
  return { year, series };
}

/** The nómina de familia's sheet, or `null` when the grid is not one. */
export function readFamilySheet(grid: readonly Cell[][]): ParsedFamilyYear[] | null {
  if (!findTitle(grid, (label) => label === FAMILY_TITLE)) {
    return null;
  }
  const header = findMonthHeader(grid, FAMILY_HEADER_LABEL);
  if (!header) {
    return null;
  }
  const rows: ParsedFamilyYear[] = [];
  for (const cells of grid.slice(header.row + 1)) {
    const year = toAmount(cells[0] ?? null);
    // A row without a four-digit year is not a year: the sheet may close on a blank or a note.
    if (year === null || !Number.isInteger(year) || year < 1000 || year > 9999) {
      continue;
    }
    rows.push({
      year,
      amounts: header.columns.map((column) => toAmount(cells[column] ?? null)),
    });
  }
  return rows;
}

/**
 * Every sheet of a workbook, already as grids — the half the tests exercise without a file in the
 * way. Sheet names play NO part in the reading; they are only used to name a repeated exercise.
 */
export function parsePersonnelCostGrids(
  sheets: readonly { name: string; grid: readonly Cell[][] }[],
): PersonnelCostParseResult {
  const legacy: ParsedLegacyYear[] = [];
  const family: ParsedFamilyYear[] = [];
  const sheetByYear = new Map<number, string>();
  for (const sheet of sheets) {
    const exercise = readLegacySheet(sheet.grid);
    if (exercise) {
      const previous = sheetByYear.get(exercise.year);
      if (previous !== undefined) {
        return {
          ok: false,
          message:
            `Las hojas «${previous}» y «${sheet.name}» declaran el mismo ejercicio ` +
            `(${exercise.year}). Cada hoja tiene que ser un año distinto.`,
        };
      }
      sheetByYear.set(exercise.year, sheet.name);
      legacy.push(exercise);
      continue;
    }
    const rows = readFamilySheet(sheet.grid);
    if (rows) {
      family.push(...rows);
    }
  }
  if (legacy.length === 0 && family.length === 0) {
    return { ok: false, message: NOTHING_RECOGNISED };
  }
  legacy.sort((a, b) => a.year - b.year);
  family.sort((a, b) => a.year - b.year);
  return { ok: true, legacy, family };
}

export function parsePersonnelCostWorkbook(data: ArrayBuffer): PersonnelCostParseResult {
  const workbook = readWorkbook(data);
  if (!workbook) {
    return { ok: false, message: "El archivo no es un Excel que se pueda leer." };
  }
  const sheets: { name: string; grid: Cell[][] }[] = [];
  for (const name of workbook.SheetNames) {
    const grid = readGrid(workbook, name);
    if (grid) {
      sheets.push({ name, grid });
    }
  }
  return parsePersonnelCostGrids(sheets);
}
