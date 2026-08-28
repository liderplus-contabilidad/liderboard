/**
 * The file's name and the download. Deliberately thin: `downloadBlob` (`lib/download.ts`) is already
 * the only way this app downloads a file, and all that is decided here is what it is called.
 */
import { downloadBlob } from "@/lib/download";
import { zipStore, type ZipEntry } from "@/lib/zip";
import type { PayslipDocument } from "./types";

/** A piece of a name fit for a file system: no accents, no spaces, no punctuation. */
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
 * The label of the control that downloads the .zip. It lives here and not in each component because
 * TWO screens say it —the período's header and the history's row—, and a button promising a PDF where
 * the other promises a .zip would raise doubts about whether they download the same thing.
 */
export const PAYSLIP_ZIP_LABEL = "Descargar roles (ZIP)";

/** `Rol-2026-03-comprobantes.zip` — the envelope with one PDF per employee. */
export function payslipBatchFilename(year: number, monthIndex: number): string {
  return `Rol-${periodPart(year, monthIndex)}-comprobantes.zip`;
}

/**
 * WHAT EACH PDF INSIDE THE .ZIP IS CALLED — pure, and the only rule for it.
 *
 * It is `payslipFilename` in nómina order, with a tie-break: two people with the same name would give
 * the same file, and an extractor does not warn about that — it silently overwrites the first one and
 * one of the two is left with no payslip. It is tie-broken with the POSITION in the nómina, which is
 * what the payslip itself prints in its `Codigo:`; a running `-2` would say there are two versions of
 * the same paper instead of saying whose each one is.
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
 * Generates and downloads the payslips in ONE PDF, one per page. `pdf-lib` comes in through
 * `render.ts`'s dynamic import, so the module is not loaded until someone presses the button.
 */
export async function downloadPayslips(
  documents: readonly PayslipDocument[],
  filename: string,
): Promise<void> {
  const { renderPayslips } = await import("./render");
  const bytes = await renderPayslips(documents);
  // `Uint8Array` → its own `ArrayBuffer`: the buffer pdf-lib returns may be a view over a larger one,
  // and `Blob` would copy too much.
  downloadBlob(new Blob([bytes.slice().buffer], { type: "application/pdf" }), filename);
}

/**
 * A PERÍODO'S PAYSLIPS: **one PDF per employee**, inside a .zip.
 *
 * A single thirty-page PDF is a file that has to be split by hand before handing it out, and handing
 * it out is what it exists for: each employee signs their own. That is why the paper of the whole
 * nómina is not one longer document but thirty documents, and the .zip is only the envelope in which
 * the browser can download them in one gesture.
 *
 * Each payslip goes through `renderPayslips` with ONE single input — the `N = 1` case an employee's
 * record already used —, so there is no second way of drawing a payslip that could drift from the
 * first.
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
