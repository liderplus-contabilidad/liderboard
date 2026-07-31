/**
 * Reads the year and month out of the monthly-by-centers filename — the export never carries a
 * date line (see the `pyg-monthly-cost-centers` spec's "Contrato del formato"), so the period
 * has to come from outside the file.
 *
 * The rule is deliberately TOLERANT, because this runs only after `monthly-centers.detect`
 * already confirmed the sheet's shape: the file is identified by then, and the name is asked
 * one question only — QUÉ MES —, never "qué es esto". A stricter name check buys nothing there
 * and costs a lot, since the name is the part of a file nobody controls: downloading twice
 * turns `PyG-2026-01.xlsx` into `PyG-2026-01 (1).xlsx` (a SPACE, not a hyphen), duplicating it
 * on macOS/iOS appends ` 2`, mail and Drive prepend `Copia de `, and a rename typed on a phone
 * leaves a typographic dash. Every one of those used to fail — which is how the same file
 * loaded on one laptop and was rejected on another.
 *
 * What stays strict is the only thing that can be read WRONG rather than not at all: a third
 * digit right after the month (`PyG-2026-012`) is ambiguous, so it is rejected instead of
 * silently taken as january; and the extension still has to be the last thing in the name.
 */
import { PygParseError } from "../errors";

/** Hyphen, non-breaking hyphen, figure/en/em/horizontal dash and minus sign — what a phone
 * keyboard, a word processor or a copy-paste leaves in place of a plain `-`. */
const TYPOGRAPHIC_DASHES = /[‐‑‒–—―−]/g;

/**
 * `PyG` as its own token (not glued inside a word), then the year and the month with any
 * separator — or none —, then anything that doesn't start with a digit, then the extension.
 */
const FILENAME_PATTERN = /(?:^|[^a-z0-9])pyg[-_.\s]*(\d{4})[-_.\s]*(\d{2})(?!\d).*\.(?:xlsx|xls)$/i;

export interface FilenamePeriod {
  year: number;
  /** 0–11. */
  month: number;
}

/** Surrounding whitespace (`trim` covers the non-breaking space too) and typographic dashes
 * are noise the transfer added, not part of the name the user chose. */
function normalizeFilename(fileName: string): string {
  return fileName.trim().replace(TYPOGRAPHIC_DASHES, "-");
}

export function parseMonthlyFilename(fileName: string): FilenamePeriod {
  const normalized = normalizeFilename(fileName);
  const match = FILENAME_PATTERN.exec(normalized);
  if (!match) {
    // Naming the file received is the whole diagnosis: the modal's list truncates long names,
    // so on a narrow screen the ` (1)` or the missing extension is exactly what you can't see.
    throw new PygParseError(
      "invalid-filename",
      `«${fileName}» no dice de qué mes es. El nombre debe llevar PyG con el año y el mes ` +
        `(ej. PyG-2026-01-darwolf.xlsx) y terminar en .xlsx o .xls. Este formato no trae el mes ` +
        `en su contenido, así que tiene que salir del nombre.`,
    );
  }
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) {
    throw new PygParseError(
      "month-out-of-range",
      `El mes en «${fileName}» debe estar entre 01 y 12.`,
    );
  }
  return { year: Number(match[1]), month: monthNumber - 1 };
}
