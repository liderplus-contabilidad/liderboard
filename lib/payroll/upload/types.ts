/**
 * What `rol-general.ts` produces from one rol de pagos workbook — the same "sin dueño todavía"
 * shape as `ParsedPayrollPeriod`/`ParsedPayrollEmployeeLine` (`@/lib/payroll/types`): which
 * cliente and período this belongs to is decided by whoever calls the parser (which período was
 * open when the file was dropped), never by the file itself.
 */
import type { ParsedPayrollEmployeeLine } from "@/lib/payroll/types";

export interface ParsedPayrollWorkbook {
  /** `GENERAL!B1` — the razón social the file declares. */
  company: string;
  /** `GENERAL!B2` — NEVER the file name, the opposite convention from PyG's monthly-by-centers
   * format: the rol declares its own period in text ("MARZO 2026"), so there is no filename
   * convention to police. */
  year: number;
  /** 0–11, read from `GENERAL!B2`. */
  monthIndex: number;
  /** Every line carries its `capture`: this is always the month the file declares, never a roster
   * copy with nothing captured yet. */
  lines: ParsedPayrollEmployeeLine[];
  /** Avisos en español, agrupados por tipo — nunca uno por empleado ni uno por columna. */
  warnings: string[];
}
