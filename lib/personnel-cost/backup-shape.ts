/**
 * The LABELS the module's «Excel con tus datos» is written with and located by — shared by the
 * writer (`export.ts`) and the reader (`upload.ts`) so the two cannot drift, and kept apart from both
 * so the download does not drag SheetJS into its chunk nor the upload ExcelJS.
 */

/** The title under the client name on a typed exercise's sheet, followed by the year. */
export const LEGACY_SHEET_TITLE = "Ejercicio";
export const FAMILY_SHEET_TITLE = "Nómina de familia";
/** The first header cell of each table. */
export const LEGACY_HEADER_LABEL = "Concepto";
export const FAMILY_HEADER_LABEL = "Año";
