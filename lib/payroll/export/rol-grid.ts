/**
 * THE `GENERAL` SHEET'S GRID — pure, and that is why it is the only layer where this can be tested.
 *
 * It takes the período, its nómina and `columns.ts`'s catalogue, and returns the sheet as rows of
 * cells: the preamble (company and period), the two label rows, and then the body, which is the shape
 * the accountant's book has always had — one header per area, its employees, a `SUBTOTAL`, and a
 * `SUMAN` at the end.
 *
 * No figure is computed here. They all go through `computeLinePayroll`, which is the app's ONLY
 * composition record + capture → engine: a second one here could drift from the one that paints the
 * screen, and then the downloaded Excel and the table would say different figures with nothing giving
 * it away.
 *
 * `workbook.ts` walks this grid and draws it without deciding anything — the same separation as the
 * payslip in PDF (`document.ts` → `layout.ts` → `render.ts`).
 */
import { letterheadLines, type CompanyProfile } from "@/lib/company-profile";
import { costCenterHeading, type CostCenter } from "@/lib/cost-center";
import { MONTHS_FULL_ES } from "@/lib/date";
import { areaKey } from "../areas";
import { computeLinePayroll } from "../employee-input";
import { emptyCapture } from "../employee-input";
import type { PayrollParameters } from "../engine/parameters";
import { sumExtraIncome } from "../extra-income";
import type { ParsedPayrollEmployeeLine } from "../types";
import {
  columnIndexOf,
  EXTRA_INCOME_COLUMN,
  OVERTIME_GROUP_LABELS,
  ROL_EXPORT_COLUMNS,
  sheetWidth,
  type RolExportCell,
  type RolExportColumn,
} from "./columns";

/** What each row IS, so `workbook.ts` knows how to paint it without deducing it again. */
export type RolRowKind =
  | "company"
  | "letterhead"
  | "labels"
  | "area"
  | "employee"
  | "subtotal"
  | "suman";

export interface RolExportRow {
  kind: RolRowKind;
  cells: readonly RolExportCell[];
}

export interface RolExportGrid {
  /** Those of `columns.ts`, plus the extra-concepts one when the período declares any. */
  columns: readonly RolExportColumn[];
  rows: readonly RolExportRow[];
}

export interface RolExportInput {
  /** The name the user gave the client. It goes where the book puts its razón social. */
  clientName: string;
  /** The company data, if the client declared it: they are the letterhead's rows, under the name.
   *  Without them the preamble stays as it was. */
  company?: CompanyProfile;
  /** The declared cost center, if there is one. It composes the second half of `B`'s label —the same
   *  string that heads the payslip in PDF— and contributes the letterhead's right-hand logo. */
  costCenter?: CostCenter;
  year: number;
  monthIndex: number;
  /** In the order the nómina is read on screen. */
  lines: readonly ParsedPayrollEmployeeLine[];
  parameters: PayrollParameters;
}

/** `MARZO 2026` — the shape the reader recognises. */
export function periodText(year: number, monthIndex: number): string {
  return `${(MONTHS_FULL_ES[monthIndex] ?? "").toUpperCase()} ${year}`;
}

function blankRow(width: number): RolExportCell[] {
  return Array.from({ length: width }, () => null);
}

function put(cells: RolExportCell[], letter: string, value: RolExportCell): void {
  cells[columnIndexOf(letter)] = value;
}

/**
 * The employees grouped by area, in the order the nómina declares them.
 *
 * Those with no area go FIRST and with no header, not under an empty header: on re-reading the file,
 * a blank area row would not be recognised as such and those employees would inherit the previous
 * block's area — they would end up filed under an area that is not theirs, which is worse than being
 * left with none.
 */
function groupByArea(
  lines: readonly ParsedPayrollEmployeeLine[],
): { area: string | null; lines: ParsedPayrollEmployeeLine[] }[] {
  const orphans: ParsedPayrollEmployeeLine[] = [];
  const groups = new Map<string, { area: string; lines: ParsedPayrollEmployeeLine[] }>();

  for (const line of lines) {
    const area = line.area.trim();
    if (area === "") {
      orphans.push(line);
      continue;
    }
    const key = areaKey(area);
    const group = groups.get(key);
    if (group) {
      group.lines.push(line);
    } else {
      // The first spelling that appears is the one that heads the block, just as in `areaOptions`.
      groups.set(key, { area, lines: [line] });
    }
  }

  return [
    ...(orphans.length > 0 ? [{ area: null, lines: orphans }] : []),
    ...[...groups.values()].map((group) => ({
      area: group.area as string | null,
      lines: group.lines,
    })),
  ];
}

/**
 * A block's closing row: the sum, column by column, of the employee rows that make it up.
 *
 * It sums the CELLS already written and does not go back to the engine, which is what guarantees the
 * `SUBTOTAL` squares with what is above it even if a column changes source. A column in which no row
 * put a number is left EMPTY instead of at zero: that is `PAGADO`'s case when nobody declared
 * anything, and a zero there would claim zero was paid.
 */
function totalRow(
  kind: "subtotal" | "suman",
  label: string,
  employees: readonly RolExportCell[][],
  columns: readonly RolExportColumn[],
  width: number,
): RolExportRow {
  const cells = blankRow(width);
  // The label goes in `CARGO`, which is where the book puts it: the name's column is left empty, and
  // that is what stops the reader confusing a subtotal with an employee.
  put(cells, "C", label);

  for (const column of columns) {
    if (!column.totalled) {
      continue;
    }
    const index = columnIndexOf(column.letter);
    let sum = 0;
    let seen = false;
    for (const row of employees) {
      const value = row[index];
      if (typeof value === "number") {
        sum += value;
        seen = true;
      }
    }
    cells[index] = seen ? sum : null;
  }
  return { kind, cells };
}

export function buildRolGrid(input: RolExportInput): RolExportGrid {
  // The aggregated column only exists if SOMEBODY declares bonus rows. It is judged over the captures
  // and not over a período declaration, which no longer exists: it is the rows that bring the dollars
  // `W TOTAL INGRESO` would otherwise have to explain.
  const hasExtras = input.lines.some((line) => (line.capture?.extras?.length ?? 0) > 0);
  const columns = hasExtras ? [...ROL_EXPORT_COLUMNS, EXTRA_INCOME_COLUMN] : ROL_EXPORT_COLUMNS;
  const width = sheetWidth(columns);
  const rows: RolExportRow[] = [];

  // ── Preamble ────────────────────────────────────────────────────────────────────────────────
  // The period shares a row with the FIRST row of labels, exactly as in the book: `B` declares it and
  // the labels start at `G`. That they share a row is what makes the reader, who looks for the period
  // by its shape among the rows above, find it before the header.
  const company = blankRow(width);
  // The label is composed by `costCenterHeading`, the same function that writes the payslip in PDF:
  // «Delicmar · Planta Ambato» has to be said the same on both papers. With no center it is the bare
  // name, so the round trip of every client that declares none does not change.
  put(company, "B", costCenterHeading(input.clientName, input.costCenter));
  rows.push({ kind: "company", cells: company });

  // The letterhead goes BELOW the name and above the labels, in the same column `B`. The lines arrive
  // composed by `letterheadLines`, the same function the screen and the payslip in PDF write with:
  // no address is joined together here.
  //
  // Adding rows to the preamble is safe for the round trip and not by accident: the reader locates
  // the period by its SHAPE among the rows before the header, and the company by being this column's
  // first one with text. No line of the letterhead can match a period.
  for (const line of letterheadLines(input.company)) {
    const row = blankRow(width);
    put(row, "B", line);
    rows.push({ kind: "letterhead", cells: row });
  }

  const labelsTop = blankRow(width);
  put(labelsTop, "B", periodText(input.year, input.monthIndex));
  for (const group of OVERTIME_GROUP_LABELS) {
    put(labelsTop, group.letter, group.label);
  }
  const labelsBottom = blankRow(width);
  for (const column of columns) {
    if (column.label === null) {
      continue;
    }
    put(column.labelRow === 1 ? labelsTop : labelsBottom, column.letter, column.label);
  }
  rows.push({ kind: "labels", cells: labelsTop });
  rows.push({ kind: "labels", cells: labelsBottom });

  // ── Cuerpo ──────────────────────────────────────────────────────────────────────────────────
  const everyEmployee: RolExportCell[][] = [];
  let ordinal = 0;

  for (const group of groupByArea(input.lines)) {
    if (group.area !== null) {
      const header = blankRow(width);
      put(header, "B", group.area);
      rows.push({ kind: "area", cells: header });
    }

    const block: RolExportCell[][] = [];
    for (const line of group.lines) {
      ordinal++;
      const capture = line.capture ?? emptyCapture();
      const extras = sumExtraIncome(capture.extras);
      const ctx = {
        line,
        capture,
        computed: computeLinePayroll(line, input.parameters),
        // Both classes go together in the aggregated column: what separates them is which bases they
        // enter, and the engine already resolved that before getting here.
        extras: extras.contributory + extras.nonContributory,
        ordinal,
      };
      const cells = blankRow(width);
      for (const column of columns) {
        cells[columnIndexOf(column.letter)] = column.read(ctx);
      }
      block.push(cells);
      everyEmployee.push(cells);
      rows.push({ kind: "employee", cells });
    }

    rows.push(totalRow("subtotal", "SUBTOTAL", block, columns, width));
  }

  rows.push(totalRow("suman", "SUMAN", everyEmployee, columns, width));

  return { columns, rows };
}
