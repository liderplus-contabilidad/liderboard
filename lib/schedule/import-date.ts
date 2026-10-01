import * as XLSX from "xlsx";
import { validDate } from "./model";

/** Workbook-only reader, so normal agenda rendering never loads SheetJS. */
export function dateFromCell(value: string | number | null): string | null {
  if (value === null || value === "") return null;
  let result: string;
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    result = `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  } else {
    const text = value.trim();
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    result = match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : text;
  }
  return validDate(result) ? result : null;
}
