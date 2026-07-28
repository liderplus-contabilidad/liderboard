/**
 * Parses the `PyG-YYYY-MM[-<free text>].(xlsx|xls)` filename pattern that declares a month
 * slice's year and month — the monthly-by-centers export never carries a date line (see the
 * `pyg-monthly-cost-centers` spec's "Contrato del formato"), so the period has to come from
 * outside the file. Case-insensitive throughout; the free-text suffix is ignored.
 */
import { PygParseError } from "../errors";

const FILENAME_PATTERN = /^PyG-(\d{4})-(\d{2})(?:-.*)?\.(?:xlsx|xls)$/i;

export interface FilenamePeriod {
  year: number;
  /** 0–11. */
  month: number;
}

export function parseMonthlyFilename(fileName: string): FilenamePeriod {
  const match = FILENAME_PATTERN.exec(fileName);
  if (!match) {
    throw new PygParseError("invalid-filename");
  }
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) {
    throw new PygParseError("month-out-of-range");
  }
  return { year: Number(match[1]), month: monthNumber - 1 };
}
