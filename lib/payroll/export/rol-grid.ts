/**
 * LA REJILLA DE LA HOJA `GENERAL` — puro, y por eso la única capa donde esto se puede probar.
 *
 * Toma el período, su nómina y el catálogo de `columns.ts`, y devuelve la hoja como filas de celdas:
 * el preámbulo (empresa y período), las dos filas de rótulos, y luego el cuerpo, que es la forma que
 * el libro del contador tiene desde siempre — una cabecera por área, sus empleados, un `SUBTOTAL`, y
 * un `SUMAN` al final.
 *
 * Ninguna cifra se calcula aquí. Todas pasan por `computeLinePayroll`, que es la ÚNICA composición
 * ficha + captura → motor de la app: una segunda aquí podría separarse de la que pinta la pantalla,
 * y entonces el Excel descargado y la tabla dirían cifras distintas sin que nada lo delatara.
 *
 * `workbook.ts` recorre esta rejilla y la dibuja sin decidir nada — la misma separación que el
 * comprobante en PDF (`document.ts` → `layout.ts` → `render.ts`).
 */
import { letterheadLines, type CompanyProfile } from "@/lib/company-profile";
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

/** Qué ES cada fila, para que `workbook.ts` sepa cómo pintarla sin volver a deducirlo. */
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
  /** Las de `columns.ts`, más la de conceptos extra cuando el período declara alguno. */
  columns: readonly RolExportColumn[];
  rows: readonly RolExportRow[];
}

export interface RolExportInput {
  /** El nombre que el usuario le dio al cliente. Va donde el libro pone su razón social. */
  clientName: string;
  /** Los datos de la empresa, si el cliente los declaró: son las filas del membrete, bajo el
   *  nombre. Sin ellos el preámbulo queda como estaba. */
  company?: CompanyProfile;
  year: number;
  monthIndex: number;
  /** En el orden en que la nómina se lee en pantalla. */
  lines: readonly ParsedPayrollEmployeeLine[];
  parameters: PayrollParameters;
}

/** `MARZO 2026` — la forma que el lector reconoce. */
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
 * Los empleados agrupados por área, en el orden en que la nómina las declara.
 *
 * Los que no tienen área van PRIMEROS y sin cabecera, no bajo una cabecera vacía: al releer el
 * archivo, una fila de área en blanco no se reconocería como tal y esos empleados heredarían el área
 * del bloque anterior — quedarían archivados bajo un área que no es la suya, que es peor que quedar
 * sin ninguna.
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
      // La primera grafía que aparece es la que encabeza el bloque, igual que en `areaOptions`.
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
 * La fila de cierre de un bloque: la suma, columna a columna, de las filas de empleado que lo
 * componen.
 *
 * Suma las CELDAS ya escritas y no vuelve al motor, que es lo que garantiza que el `SUBTOTAL` cuadre
 * con lo que hay encima aunque una columna cambie de origen. Una columna en la que ninguna fila puso
 * un número queda VACÍA en vez de en cero: es el caso de `PAGADO` cuando nadie declaró nada, y un
 * cero ahí afirmaría que se pagó cero.
 */
function totalRow(
  kind: "subtotal" | "suman",
  label: string,
  employees: readonly RolExportCell[][],
  columns: readonly RolExportColumn[],
  width: number,
): RolExportRow {
  const cells = blankRow(width);
  // El rótulo va en `CARGO`, que es donde el libro lo pone: la columna del nombre queda vacía, y eso
  // es lo que impide que el lector confunda un subtotal con un empleado.
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
  // La columna agregada solo existe si ALGUIEN declara filas de bono. Se juzga sobre las capturas
  // y no sobre una declaración de período, que ya no hay: son las filas las que traen los dólares
  // que `W TOTAL INGRESO` tendría si no que explicar.
  const hasExtras = input.lines.some((line) => (line.capture?.extras?.length ?? 0) > 0);
  const columns = hasExtras ? [...ROL_EXPORT_COLUMNS, EXTRA_INCOME_COLUMN] : ROL_EXPORT_COLUMNS;
  const width = sheetWidth(columns);
  const rows: RolExportRow[] = [];

  // ── Preámbulo ───────────────────────────────────────────────────────────────────────────────
  // El período comparte fila con la PRIMERA hilera de rótulos, exactamente como en el libro: `B` lo
  // declara y los rótulos empiezan en `G`. Que compartan fila es lo que hace que el lector, que
  // busca el período por su forma entre las filas de arriba, lo encuentre antes de la cabecera.
  const company = blankRow(width);
  put(company, "B", input.clientName);
  rows.push({ kind: "company", cells: company });

  // El membrete va DEBAJO del nombre y encima de los rótulos, en la misma columna `B`. Las líneas
  // llegan compuestas por `letterheadLines`, la misma función que escriben la pantalla y el
  // comprobante en PDF: aquí no se junta ninguna dirección.
  //
  // Añadir filas al preámbulo es seguro para el viaje de vuelta y no por casualidad: el lector
  // localiza el período por su FORMA entre las filas anteriores a la cabecera, y la empresa por ser
  // la primera con texto de esta columna. Ninguna línea del membrete puede casar con un período.
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
        // Las dos clases van juntas en la columna agregada: lo que las separa es en qué bases
        // entran, y eso ya lo resolvió el motor antes de llegar aquí.
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
