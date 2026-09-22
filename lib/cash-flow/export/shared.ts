/**
 * What the three Excels of this module share: the blob, the file name and the amount format.
 * exceljs is imported statically in this directory; UI code reaches it through a dynamic `import()`.
 */
import type ExcelJS from "exceljs";

export const AMOUNT_FMT = "#,##0.00;-#,##0.00";

export async function workbookToBlob(wb: ExcelJS.Workbook): Promise<Blob> {
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** `<PREFIJO>_<EMPRESA>_<FECHA>.xlsx`, so a folder of downloads reads on its own. */
export function exportFilename(prefix: string, companyName: string, date: string): string {
  const company = companyName
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "_");
  return `${[prefix, company, date].filter(Boolean).join("_")}.xlsx`;
}

/** `2026-09-15` → `15/09/2026`, the way every Excel of the firm writes a date; blank for none. */
export function excelDate(iso: string | null): string {
  if (!iso) {
    return "";
  }
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}
