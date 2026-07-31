/**
 * Typed parse failures. Separate from parse.ts so UI code can catch/inspect them
 * without pulling SheetJS into the initial bundle.
 *
 * `message` is optional per-call: most codes carry a fixed Spanish message, but a few
 * (a duplicate month, a mixed batch, no strategy matching) need to name the actual values
 * involved, so the call site passes its own text and the code stays the stable, matchable
 * part of the error.
 */

export type PygParseErrorCode =
  | "invalid-file"
  | "no-accounts"
  | "no-header"
  | "invalid-filename"
  | "month-out-of-range"
  | "general-missing"
  | "duplicate-month"
  | "unrecognized-format"
  | "missing-date-range"
  | "invalid-date-range"
  | "mixed-identity";

const MESSAGES: Record<PygParseErrorCode, string> = {
  "invalid-file": "No se pudo leer el archivo. Verifica que sea un Excel (.xls o .xlsx) válido.",
  "no-accounts": "El archivo no contiene filas de cuentas contables reconocibles.",
  "no-header": "No se encontró la fila de cabecera con los períodos del reporte.",
  "invalid-filename":
    "El nombre del archivo debe llevar PyG con el año y el mes (ej. PyG-2026-01-darwolf.xlsx) " +
    "y terminar en .xlsx o .xls. El archivo no trae el mes en su contenido, así que tiene que " +
    "salir del nombre.",
  "month-out-of-range": "El mes en el nombre del archivo debe estar entre 01 y 12.",
  "general-missing": "No se encontró la columna GENERAL en la fila de cabecera.",
  "duplicate-month": "La carga incluye más de un archivo para el mismo mes.",
  "unrecognized-format": "El archivo no corresponde a ningún formato aceptado.",
  "missing-date-range":
    'El estado único debe declarar su rango de fechas ("Desde el … hasta el …"); no se encontró esa línea.',
  "invalid-date-range": "El rango de fechas del archivo no corresponde a un mes calendario.",
  // El año salió de la identidad con `pyg-multi-year`: mezclar años en una carga es válido.
  "mixed-identity": "La carga mezcla archivos de empresas, sistemas o modos distintos.",
};

export class PygParseError extends Error {
  readonly code: PygParseErrorCode;

  constructor(code: PygParseErrorCode, message?: string) {
    super(message ?? MESSAGES[code]);
    this.name = "PygParseError";
    this.code = code;
  }
}
