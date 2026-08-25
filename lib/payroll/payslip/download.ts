/**
 * El nombre del archivo y la descarga. Delgado a propósito: `downloadBlob` (`lib/download.ts`) ya
 * es la única forma en que esta app baja un archivo, y aquí solo se decide cómo se llama.
 */
import { downloadBlob } from "@/lib/download";
import { zipStore, type ZipEntry } from "@/lib/zip";
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

/**
 * El rótulo del control que baja el .zip. Vive aquí y no en cada componente porque lo dicen DOS
 * pantallas —el encabezado del período y la fila del historial—, y un botón que promete un PDF
 * donde el otro promete un .zip haría dudar de si bajan lo mismo.
 */
export const PAYSLIP_ZIP_LABEL = "Descargar roles (ZIP)";

/** `Rol-2026-03-comprobantes.zip` — el sobre con un PDF por empleado. */
export function payslipBatchFilename(year: number, monthIndex: number): string {
  return `Rol-${periodPart(year, monthIndex)}-comprobantes.zip`;
}

/**
 * CÓMO SE LLAMA CADA PDF DENTRO DEL .ZIP — puro, y la única regla de eso.
 *
 * Es `payslipFilename` en el orden de la nómina, con un desempate: dos personas del mismo nombre
 * darían el mismo archivo, y un extractor no avisa de eso — pisa el primero en silencio y una de
 * las dos se queda sin comprobante. Se desempata con la POSICIÓN en la nómina, que es lo que el
 * propio comprobante imprime en su `Codigo:`; un correlativo `-2` diría que hay dos versiones del
 * mismo papel en vez de decir de quién es cada uno.
 */
export function payslipZipEntryNames(
  employeeNames: readonly string[],
  year: number,
  monthIndex: number,
): string[] {
  const used = new Set<string>();

  return employeeNames.map((name, index) => {
    const base = payslipFilename(year, monthIndex, name);
    let candidate = base;
    let position = index + 1;
    while (used.has(candidate)) {
      candidate = base.replace(/\.pdf$/, `-${position}.pdf`);
      position += 1;
    }
    used.add(candidate);
    return candidate;
  });
}

/**
 * Genera y baja los comprobantes en UN PDF, uno por página. `pdf-lib` entra por el import dinámico
 * de `render.ts`, así que el módulo no se carga hasta que alguien pulsa el botón.
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

/**
 * LOS COMPROBANTES DE UN PERÍODO: **un PDF por empleado**, dentro de un .zip.
 *
 * Un solo PDF de treinta páginas es un archivo que hay que partir a mano antes de repartirlo, y
 * repartirlo es para lo que existe: cada empleado firma el suyo. Por eso el papel de la nómina
 * entera no es un documento más largo sino treinta documentos, y el .zip es solo el sobre en el que
 * el navegador puede bajarlos de un gesto.
 *
 * Cada comprobante pasa por `renderPayslips` con UNA sola entrada — el caso `N = 1` que la ficha de
 * un empleado ya usaba —, así que no hay una segunda forma de dibujar un comprobante capaz de
 * separarse de la primera.
 */
export async function downloadPayslipZip(
  documents: readonly PayslipDocument[],
  period: { year: number; monthIndex: number },
): Promise<void> {
  const { renderPayslips } = await import("./render");
  const names = payslipZipEntryNames(
    documents.map((document) => document.employeeName),
    period.year,
    period.monthIndex,
  );

  const entries: ZipEntry[] = [];
  for (const [index, document] of documents.entries()) {
    entries.push({ name: names[index] as string, data: await renderPayslips([document]) });
  }

  const archive = zipStore(entries, new Date());
  downloadBlob(
    new Blob([archive.slice().buffer], { type: "application/zip" }),
    payslipBatchFilename(period.year, period.monthIndex),
  );
}
