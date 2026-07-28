/**
 * Typed parse failures. Separate from parse.ts so UI code can catch/inspect them
 * without pulling SheetJS into the initial bundle.
 *
 * `message` is optional per-call: most codes carry a fixed Spanish message, but a few
 * (mixed years, a duplicate month, no strategy matching) need to name the actual values
 * involved, so the call site passes its own text and the code stays the stable, matchable
 * part of the error.
 */

export type PygParseErrorCode =
  | "invalid-file"
  | "no-accounts"
  | "no-header"
  | "consolidated-unsupported"
  | "invalid-filename"
  | "month-out-of-range"
  | "general-missing"
  | "mixed-years"
  | "duplicate-month"
  | "unrecognized-format";

const MESSAGES: Record<PygParseErrorCode, string> = {
  "invalid-file": "No se pudo leer el archivo. Verifica que sea un Excel (.xls o .xlsx) válido.",
  "no-accounts": "El archivo no contiene filas de cuentas contables reconocibles.",
  "no-header": "No se encontró la fila de cabecera con los períodos del reporte.",
  "consolidated-unsupported":
    "Este archivo trae columnas de centros de costo; usa la carga mensual por centros en vez del estado único.",
  "invalid-filename":
    "El nombre del archivo debe seguir el patrón PyG-YYYY-MM-… (ej. PyG-2026-01-darwolf.xlsx). " +
    "El archivo no trae el mes en su contenido, así que tiene que salir del nombre.",
  "month-out-of-range": "El mes en el nombre del archivo debe estar entre 01 y 12.",
  "general-missing": "No se encontró la columna GENERAL en la fila de cabecera.",
  "mixed-years": "La carga mezcla archivos de años distintos.",
  "duplicate-month": "La carga incluye más de un archivo para el mismo mes.",
  "unrecognized-format": "El archivo no corresponde a ningún formato aceptado.",
};

export class PygParseError extends Error {
  readonly code: PygParseErrorCode;

  constructor(code: PygParseErrorCode, message?: string) {
    super(message ?? MESSAGES[code]);
    this.name = "PygParseError";
    this.code = code;
  }
}
