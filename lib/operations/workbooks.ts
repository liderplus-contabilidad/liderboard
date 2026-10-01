import * as XLSX from "xlsx";
import { compactLabel, readGrid } from "@/lib/excel/workbook";
import type { SourceSnapshot } from "./types";

export function tableRows(
  book: XLSX.WorkBook,
  sheet: string,
): Record<string, string | number | null>[] {
  const grid = readGrid(book, sheet);
  if (!grid?.length) return [];
  const header = grid[0].map(compactLabel);
  return grid
    .slice(1)
    .filter((row) => row.some((v) => v !== null && v !== ""))
    .map((row) => Object.fromEntries(header.map((label, c) => [label, row[c] ?? null])));
}

export function writeWorkbook(
  sheets: { name: string; rows: unknown[][]; hiddenColumns?: number[] }[],
): ArrayBuffer {
  const book = XLSX.utils.book_new();
  for (const { name, rows, hiddenColumns = [] } of sheets) {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = (rows[0] ?? []).map((_, i) => ({
      wch: i === 0 ? 35 : 24,
      hidden: hiddenColumns.includes(i),
    }));
    sheet["!autofilter"] = { ref: sheet["!ref"] ?? "A1" };
    XLSX.utils.book_append_sheet(book, sheet, name);
  }
  return XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export function workbookBlob(bytes: ArrayBuffer): Blob {
  return new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function sourceWorkbook(source: SourceSnapshot): ArrayBuffer {
  return writeWorkbook([
    {
      name: "Datos originales",
      rows: [
        ["Hoja", "Celda", "Bloque", "Campo", "Valor original"],
        ...source.cells.map((cell) => [
          source.sheet,
          cell.address,
          cell.category,
          cell.label,
          cell.original,
        ]),
      ],
    },
  ]);
}
