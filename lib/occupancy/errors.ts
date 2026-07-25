/**
 * Typed parse failures for Ocupaciones. Kept out of parse.ts so UI code can catch and
 * inspect them without pulling SheetJS into the initial bundle.
 */

export type OccupancyParseErrorCode = "invalid-file" | "no-months";

const MESSAGES: Record<OccupancyParseErrorCode, string> = {
  "invalid-file": "No se pudo leer el archivo. Verifica que sea un Excel (.xls o .xlsx) válido.",
  "no-months":
    "El archivo no contiene bloques de mes reconocibles. Cada mes debe empezar con una fila «MES: ENERO».",
};

export class OccupancyParseError extends Error {
  readonly code: OccupancyParseErrorCode;

  constructor(code: OccupancyParseErrorCode) {
    super(MESSAGES[code]);
    this.name = "OccupancyParseError";
    this.code = code;
  }
}
