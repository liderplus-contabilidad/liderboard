/**
 * El nombre del archivo y la descarga. Delgado a propósito: `downloadBlob` (`lib/download.ts`) ya
 * es la única forma en que esta app baja un archivo, y aquí solo se decide cómo se llama.
 */
import { downloadBlob } from "@/lib/download";
import type { PayslipDocument } from "./types";

/** Un trozo de nombre apto para un sistema de archivos: sin tildes, sin espacios, sin signos. */
function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

function periodPart(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

/** `Rol-2026-03-SORIA-CHALA-MISHELL-FERNANDA.pdf` */
export function payslipFilename(year: number, monthIndex: number, employeeName: string): string {
  return `Rol-${periodPart(year, monthIndex)}-${slug(employeeName)}.pdf`;
}

/** `Rol-2026-03-comprobantes.pdf` */
export function payslipBatchFilename(year: number, monthIndex: number): string {
  return `Rol-${periodPart(year, monthIndex)}-comprobantes.pdf`;
}

/**
 * Genera y baja los comprobantes. `pdf-lib` entra por el import dinámico de `render.ts`, así que
 * el módulo no se carga hasta que alguien pulsa el botón.
 */
export async function downloadPayslips(
  documents: readonly PayslipDocument[],
  filename: string,
): Promise<void> {
  const { renderPayslips } = await import("./render");
  const bytes = await renderPayslips(documents);
  // `Uint8Array` → `ArrayBuffer` propio: el búfer que devuelve pdf-lib puede ser una vista sobre
  // uno mayor, y `Blob` copiaría de más.
  downloadBlob(new Blob([bytes.slice().buffer], { type: "application/pdf" }), filename);
}
