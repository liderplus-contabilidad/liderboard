/**
 * El nombre del archivo y la descarga. Delgado a propósito, igual que `payslip/download.ts`:
 * `downloadBlob` ya es la única forma en que esta app baja un archivo, y aquí solo se decide cómo se
 * llama y quién lo genera.
 */
import { downloadBlob } from "@/lib/download";
import type { EntityLogo } from "@/lib/logos";
import type { RolExportInput } from "./rol-grid";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Un trozo de nombre apto para un sistema de archivos: sin tildes, sin espacios, sin signos. */
function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

/**
 * `ROL_DE_PAGOS_03-2026_CULTURA_MANOR.xlsx` — el patrón con el que la firma nombra sus propios
 * archivos, para que el descargado caiga en la misma carpeta sin desentonar.
 *
 * Es `.xlsx` y no el `.xls` del original porque exceljs no escribe BIFF; SheetJS lee las dos, así
 * que el archivo vuelve a entrar a la app igual.
 */
export function rolFilename(year: number, monthIndex: number, clientName: string): string {
  const period = `${String(monthIndex + 1).padStart(2, "0")}-${year}`;
  const client = slug(clientName);
  return `ROL_DE_PAGOS_${period}${client ? `_${client}` : ""}.xlsx`;
}

/** Genera y baja el rol. `exceljs` entra por el import dinámico de `workbook.ts`. */
export async function downloadRolWorkbook(
  input: RolExportInput,
  logo?: EntityLogo | null,
): Promise<void> {
  const { buildRolWorkbook } = await import("./workbook");
  const buffer = await buildRolWorkbook(input, logo);
  downloadBlob(
    new Blob([buffer], { type: XLSX_MIME }),
    rolFilename(input.year, input.monthIndex, input.clientName),
  );
}
