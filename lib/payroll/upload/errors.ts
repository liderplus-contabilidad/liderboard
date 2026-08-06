/**
 * Typed parse failures for the rol de pagos upload, mirroring `lib/profit-loss/errors.ts`'s
 * shape: a stable `code` UI code can match on, a fixed Spanish message per code, and an optional
 * per-call override for the one case (`invalid-period`) that benefits from naming what was found.
 */

export type PayrollParseErrorCode =
  | "invalid-file"
  | "general-sheet-missing"
  | "invalid-period"
  | "no-employees";

const MESSAGES: Record<PayrollParseErrorCode, string> = {
  "invalid-file": "No se pudo leer el archivo. Verifica que sea un Excel (.xls o .xlsx) válido.",
  "general-sheet-missing": "No se encontró la hoja GENERAL en el archivo.",
  "invalid-period":
    "No se pudo leer el período del rol en la celda B2 de la hoja GENERAL (se esperaba algo " +
    'como "MARZO 2026").',
  "no-employees": "No se encontraron filas de empleado reconocibles en la hoja GENERAL.",
};

export class PayrollParseError extends Error {
  readonly code: PayrollParseErrorCode;

  constructor(code: PayrollParseErrorCode, message?: string) {
    super(message ?? MESSAGES[code]);
    this.name = "PayrollParseError";
    this.code = code;
  }
}
