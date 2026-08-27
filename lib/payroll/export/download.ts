/**
 * The file's name and the download. Deliberately thin, just like `payslip/download.ts`:
 * `downloadBlob` is already the only way this app downloads a file, and all that is decided here is
 * what it is called and who generates it.
 */
import { downloadBlob } from "@/lib/download";
import type { EntityLogo } from "@/lib/logos";
import type { RolExportInput } from "./rol-grid";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** A piece of a name fit for a file system: no accents, no spaces, no punctuation. */
function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

/**
 * `ROL_DE_PAGOS_03-2026_CULTURA_MANOR.xlsx` — the pattern the firm names its own files with, so the
 * downloaded one lands in the same folder without standing out.
 *
 * It is `.xlsx` and not the original's `.xls` because exceljs does not write BIFF; SheetJS reads
 * both, so the file comes back into the app all the same.
 */
export function rolFilename(year: number, monthIndex: number, clientName: string): string {
  const period = `${String(monthIndex + 1).padStart(2, "0")}-${year}`;
  const client = slug(clientName);
  return `ROL_DE_PAGOS_${period}${client ? `_${client}` : ""}.xlsx`;
}

/** Generates and downloads the rol. `exceljs` comes in through `workbook.ts`'s dynamic import. */
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
