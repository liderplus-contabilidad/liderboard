/**
 * The check register's book (`CHEQUES INICIO`, sheet «PAGO A PROVEEDORES»), read by label: N° EGRESO
 * · BANCO · NOMBRE · CHEQUE · VALOR · FECHA DE EMISION · REALIZADO · FIRMADO · ENTREGADO · LUGAR ·
 * DEPOSITADO · ESTADO · FECHA DE COBRO · CORREO. Twelve thousand rows since 2017, the last thousand
 * of them just a pre-numbered EGRESO with nothing else — those are skipped, as is any row with no
 * voucher, or with neither an amount nor a check number.
 *
 * The book's four X and its free-text ESTADO become a STEP and a VOIDED flag:
 *   - voided: ESTADO says ANULADO · ANULADA · CRUCE · REVERSO, or BANCO says CRUCE · ANULADO;
 *   - step `cashed`: ESTADO says COBRADO · PAGADO · DEPOSITADO · DEPOSITO, or DEPOSITADO is marked;
 *   - otherwise the LAST of REALIZADO · FIRMADO · ENTREGADO that is marked; `made` with none.
 * A cashed check with no FECHA DE COBRO takes its issue date — it came back, and the flow needs a day.
 *
 * The bank stays a LABEL here; `db.importChecks` resolves it against the empresa's accounts.
 */
import { normalizeLabel, type Cell } from "@/lib/excel/workbook";
import { toISODate } from "../dates";
import type { CheckStep, ParsedCheck } from "../types";
import { cellAmount, cellText, findHeaderRow, locate, type Grid } from "./grid";

const REQUIRED = ["N° EGRESO", "BANCO", "NOMBRE", "CHEQUE", "VALOR", "FECHA DE EMISION"] as const;
const OPTIONAL = [
  "REALIZADO",
  "FIRMADO",
  "ENTREGADO",
  "LUGAR",
  "DEPOSITADO",
  "ESTADO",
  "FECHA DE COBRO",
] as const;

const VOIDED_STATES = new Set(["anulado", "anulada", "cruce", "reverso"]);
const VOIDED_BANKS = new Set(["cruce", "anulado"]);
const CASHED_STATES = new Set(["cobrado", "pagado", "depositado", "deposito"]);

export interface ParsedChecksLog {
  checks: ParsedCheck[];
  skipped: number;
}

export function matchesChecksLog(grid: Grid): boolean {
  return findHeaderRow(grid, REQUIRED) >= 0;
}

function marked(cell: Cell): boolean {
  return cellText(cell).length > 0;
}

export function parseChecksLog(grid: Grid): ParsedChecksLog {
  const headerRow = findHeaderRow(grid, REQUIRED);
  const header = grid[headerRow] ?? [];
  const [voucherCol, bankCol, payeeCol, numberCol, amountCol, issuedCol] = locate(header, REQUIRED);
  const [madeCol, signedCol, deliveredCol, placeCol, depositedCol, stateCol, cashedCol] = locate(
    header,
    OPTIONAL,
  );
  const read = (row: readonly Cell[], col: number): Cell => (col >= 0 ? (row[col] ?? null) : null);

  const checks: ParsedCheck[] = [];
  let skipped = 0;
  for (let index = headerRow + 1; index < grid.length; index += 1) {
    const row: readonly Cell[] = grid[index] ?? [];
    const voucher = cellText(row[voucherCol]);
    if (!voucher) {
      continue;
    }
    const amount = cellAmount(row[amountCol]);
    const number = cellText(row[numberCol]);
    if (!number && amount === 0) {
      skipped += 1;
      continue;
    }
    const bank = cellText(row[bankCol]);
    const state = normalizeLabel(read(row, stateCol));
    const voided = VOIDED_STATES.has(state) || VOIDED_BANKS.has(normalizeLabel(bank));
    let step: CheckStep = "made";
    if (CASHED_STATES.has(state) || marked(read(row, depositedCol))) {
      step = "cashed";
    } else if (marked(read(row, deliveredCol))) {
      step = "delivered";
    } else if (marked(read(row, signedCol))) {
      step = "signed";
    } else if (marked(read(row, madeCol))) {
      step = "made";
    }
    const issuedOn = toISODate(row[issuedCol]);
    const collectionDate = toISODate(read(row, cashedCol));
    const cashedOn = step === "cashed" ? (collectionDate ?? issuedOn) : null;
    checks.push({
      voucher,
      bank,
      payee: cellText(row[payeeCol]),
      number,
      amount,
      issuedOn,
      step,
      voided,
      cashedOn,
      ...(step !== "cashed" && collectionDate ? { expectedCashOn: collectionDate } : {}),
      place: cellText(read(row, placeCol)),
    });
  }
  return { checks, skipped };
}
