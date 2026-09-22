/**
 * The `CARGAS CASH` sheet, read by label — the contador's own (title · FECHA · DETALLE · HA · HC ·
 * HK · HA-HC · HC-HA · OBSERVACION · rows · TOTAL, three blocks stacked) and the one this module
 * exports (`export/cash-entries-workbook.ts`), which is the same shape on purpose so the download
 * re-enters through this door. Only the two HAND-WRITTEN blocks are read (MOVIMIENTO INICIAL ·
 * VARIOS); PROVEEDORES is derived from the cartera and whatever the sheet says of it is ignored.
 *
 * A block is found by its TITLE (a row whose first text is the block's name), its header is the
 * next row holding FECHA and DETALLE, and its rows run until TOTAL, the next title or the end. The
 * columns between DETALLE and OBSERVACION are the matrix's and stay LABELS here («HC», «HA-HC»):
 * which of them is a center, which a loan between two centers and which nothing the empresa knows
 * is decided at the door (`db.replaceCashSections`), once the upload has proposed the missing
 * centers — the parser has no owner to ask.
 */
import {
  compactLabel,
  normalizeLabel,
  readGrid,
  readWorkbook,
  type Cell,
} from "@/lib/excel/workbook";
import { toISODate } from "../dates";
import type { CashSectionId } from "../types";
import { cellAmount, cellText, type Grid } from "./grid";

const TITLES: Record<string, CashSectionId> = {
  [compactLabel("MOVIMIENTO INICIAL")]: "initial",
  [compactLabel("VARIOS")]: "misc",
};
/** The derived block: its title ends the block before it, and nothing of it is read. */
const IGNORED_TITLES = new Set([compactLabel("PROVEEDORES")]);
const DATE = compactLabel("FECHA");
const DETAIL = compactLabel("DETALLE");
const OBSERVATION = compactLabel("OBSERVACION");
const TOTAL = compactLabel("TOTAL");

/** One row as the sheet wrote it: a figure per column LABEL, nothing resolved yet. */
export interface ParsedCashRow {
  date: string | null;
  detail: string;
  /** Column label → amount, only the non-zero cells. */
  amounts: Record<string, number>;
  observation: string;
}

export interface ParsedCashSection {
  id: CashSectionId;
  /** The matrix's column labels, in the sheet's order. */
  columns: string[];
  rows: ParsedCashRow[];
}

export interface ParsedCashSheet {
  sections: ParsedCashSection[];
  /** Rows with no detail and no figure, skipped. */
  skipped: number;
}

function firstText(row: readonly Cell[]): string {
  for (const cell of row) {
    const text = cellText(cell);
    if (text) {
      return text;
    }
  }
  return "";
}

function isTitle(row: readonly Cell[]): boolean {
  const key = compactLabel(firstText(row));
  return key in TITLES || IGNORED_TITLES.has(key);
}

/** A sheet is `CARGAS CASH` when at least one hand-written block's title is followed by a header. */
export function matchesCashSheet(grid: Grid): boolean {
  return parseCashSheet(grid).sections.length > 0;
}

export function parseCashSheet(grid: Grid): ParsedCashSheet {
  const sections: ParsedCashSection[] = [];
  let skipped = 0;
  let at = 0;
  while (at < grid.length) {
    const row = grid[at] ?? [];
    const id = TITLES[compactLabel(firstText(row))];
    if (!id) {
      at += 1;
      continue;
    }
    // The header: the next row with FECHA and DETALLE, within a few lines of the title.
    let headerAt = -1;
    for (let probe = at + 1; probe < Math.min(at + 4, grid.length); probe += 1) {
      const labels = (grid[probe] ?? []).map(compactLabel);
      if (labels.includes(DATE) && labels.includes(DETAIL)) {
        headerAt = probe;
        break;
      }
    }
    if (headerAt < 0) {
      at += 1;
      continue;
    }
    const header = grid[headerAt] ?? [];
    const labels = header.map(compactLabel);
    const dateCol = labels.indexOf(DATE);
    const detailCol = labels.indexOf(DETAIL);
    const observationCol = labels.indexOf(OBSERVATION);
    const end = observationCol >= 0 ? observationCol : header.length;
    const matrixCols: { col: number; label: string }[] = [];
    for (let col = detailCol + 1; col < end; col += 1) {
      const label = cellText(header[col]);
      if (label) {
        matrixCols.push({ col, label });
      }
    }

    const rows: ParsedCashRow[] = [];
    at = headerAt + 1;
    for (; at < grid.length; at += 1) {
      const line = grid[at] ?? [];
      const lead = compactLabel(firstText(line));
      if (lead === TOTAL || isTitle(line)) {
        break;
      }
      const detail = cellText(line[detailCol]);
      const amounts: Record<string, number> = {};
      for (const { col, label } of matrixCols) {
        const amount = cellAmount(line[col]);
        if (amount) {
          amounts[label] = amount;
        }
      }
      if (!detail && Object.keys(amounts).length === 0) {
        skipped += 1;
        continue;
      }
      rows.push({
        date: toISODate(line[dateCol]),
        detail,
        amounts,
        observation: observationCol >= 0 ? cellText(line[observationCol]) : "",
      });
    }
    sections.push({ id, columns: matrixCols.map((column) => column.label), rows });
    if (at < grid.length && compactLabel(firstText(grid[at] ?? [])) === TOTAL) {
      at += 1;
    }
  }
  return { sections, skipped };
}

/** The column of an empresa without centers, as the export writes it. */
export const AMOUNT_COLUMN = "MONTO";

/** «HA-HC» → `["HA", "HC"]`; a label with no dash, or more than one, is not a loan pair. */
export function splitLoanLabel(label: string): [string, string] | null {
  const parts = label.split("-").map((part) => part.trim());
  return parts.length === 2 && parts[0] && parts[1] ? [parts[0], parts[1]] : null;
}

export type CashColumnRole =
  | { kind: "center"; centerId: string }
  | { kind: "amount" }
  | { kind: "loan"; fromCenterId: string; toCenterId: string }
  | { kind: "unknown" };

/**
 * What a column label MEANS for an empresa: one of its centers, «Monto», a loan between two of its
 * centers, or nothing it knows. The one rule the upload's proposal and `db.replaceCashSections`
 * share, so what the preview says will be created is what the door resolves.
 */
export function cashColumnRole(
  label: string,
  centers: readonly { id: string; name: string }[],
): CashColumnRole {
  const byName = new Map(centers.map((center) => [normalizeLabel(center.name), center.id]));
  const own = byName.get(normalizeLabel(label));
  if (own) {
    return { kind: "center", centerId: own };
  }
  if (normalizeLabel(label) === normalizeLabel(AMOUNT_COLUMN)) {
    return { kind: "amount" };
  }
  const pair = splitLoanLabel(label);
  if (pair) {
    const from = byName.get(normalizeLabel(pair[0]));
    const to = byName.get(normalizeLabel(pair[1]));
    if (from && to && from !== to) {
      return { kind: "loan", fromCenterId: from, toCenterId: to };
    }
  }
  return { kind: "unknown" };
}

/**
 * The center labels the sheet names that the empresa does not have — what the upload proposes to
 * create: a plain column that is no center, and each end of a loan pair that is not one either.
 * Deduplicated by `normalizeLabel`, in the sheet's order.
 */
export function unknownCenterLabels(
  sheet: ParsedCashSheet,
  centers: readonly { id: string; name: string }[],
): string[] {
  const known = new Set(centers.map((center) => normalizeLabel(center.name)));
  const seen = new Set<string>();
  const labels: string[] = [];
  const propose = (label: string) => {
    const key = normalizeLabel(label);
    if (key && !known.has(key) && !seen.has(key)) {
      seen.add(key);
      labels.push(label);
    }
  };
  for (const section of sheet.sections) {
    for (const label of section.columns) {
      if (cashColumnRole(label, centers).kind !== "unknown") {
        continue;
      }
      if (normalizeLabel(label) === normalizeLabel(AMOUNT_COLUMN)) {
        continue;
      }
      const pair = splitLoanLabel(label);
      if (pair) {
        propose(pair[0]);
        propose(pair[1]);
      } else {
        propose(label);
      }
    }
  }
  return labels;
}

export type CashSheetReadResult =
  | { ok: true; sheet: ParsedCashSheet; sheetName: string }
  | { ok: false; message: string };

export const CASH_REJECTION =
  "Este archivo no es una hoja de Cargas cash. Se acepta la hoja «CARGAS CASH» del libro (bloques MOVIMIENTO INICIAL y VARIOS con FECHA · DETALLE · un centro por columna · OBSERVACION) y el Excel «Cargas cash» que exporta este módulo.";

/** The first sheet of the workbook that holds a hand-written block, parsed. */
export function readCashSheet(data: ArrayBuffer): CashSheetReadResult {
  const workbook = readWorkbook(data);
  if (!workbook) {
    return {
      ok: false,
      message: "No se pudo leer el archivo. Verifica que sea un Excel (.xls o .xlsx) válido.",
    };
  }
  for (const sheetName of workbook.SheetNames) {
    const grid = readGrid(workbook, sheetName);
    if (!grid) {
      continue;
    }
    const sheet = parseCashSheet(grid);
    if (sheet.sections.length > 0) {
      return { ok: true, sheet, sheetName };
    }
  }
  return { ok: false, message: CASH_REJECTION };
}
