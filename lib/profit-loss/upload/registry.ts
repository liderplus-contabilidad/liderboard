/**
 * The single entry point for every PyG Excel upload. `resolveCandidate` evaluates strategies
 * in the order given and keeps the FIRST that detects a match — order is an explicit part of
 * the contract, not incidental (see the spec's "Resolución ordenada, primer acierto").
 *
 * Fixed order below: `app-workbook` first because its hidden metadata sheet is the one cheap,
 * exclusive signal that must be checked before anything shape-based. `monthly-centers` and
 * `monthly-single` don't collide (several free-text columns vs. exactly one `Total` column), so
 * their relative order doesn't matter, but it is still explicit rather than incidental.
 * `microplus` comes last and collides with nothing either way: it puts its code and name in
 * columns the other two never read (they need col A + col B), and its `CODIGO` + `NOMBRE DE LA
 * CUENTA` header is a signature none of them produces.
 */
import { PygParseError } from "../errors";
import { appWorkbookStrategy } from "./app-workbook";
import { readWorkbook } from "./grid";
import { microplusStrategy } from "./microplus";
import { monthlyCentersStrategy } from "./monthly-centers";
import { monthlySingleStrategy } from "./monthly-single";
import type { StagedUpload, UploadCandidate, UploadStrategy } from "./types";

export const STRATEGIES: readonly UploadStrategy[] = [
  appWorkbookStrategy,
  monthlyCentersStrategy,
  monthlySingleStrategy,
  microplusStrategy,
];

/** Reads the workbook exactly once; every strategy's `detect`/`parse` shares this candidate. */
export function buildCandidate(fileName: string, buffer: ArrayBuffer): UploadCandidate {
  return { fileName, buffer, workbook: readWorkbook(buffer) };
}

export function acceptedFormats(
  strategies: readonly UploadStrategy[],
): { id: string; label: string }[] {
  return strategies.map(({ id, label }) => ({ id, label }));
}

/**
 * A strategy's `detect` SHALL never throw, but the registry does not trust that: a `detect`
 * that fails to read its sheet counts as "no acierta", not as an exception that stops the
 * search for the strategies still to come.
 */
function detects(strategy: UploadStrategy, candidate: UploadCandidate): boolean {
  try {
    return strategy.detect(candidate);
  } catch {
    return false;
  }
}

export function resolveCandidate(
  candidate: UploadCandidate,
  strategies: readonly UploadStrategy[],
): StagedUpload {
  for (const strategy of strategies) {
    if (detects(strategy, candidate)) {
      return strategy.parse(candidate);
    }
  }
  const labels = acceptedFormats(strategies)
    .map((format) => format.label)
    .join(", ");
  throw new PygParseError(
    "unrecognized-format",
    `El archivo no corresponde a ningún formato aceptado. Formatos aceptados: ${labels}.`,
  );
}

/** Resolves a file against the fixed, ordered strategy list — the entry point every caller
 * outside this module (the upload modal, its tests) should use. */
export function resolveUpload(fileName: string, buffer: ArrayBuffer): StagedUpload {
  return resolveCandidate(buildCandidate(fileName, buffer), STRATEGIES);
}

/** The fixed strategy list's accepted formats — what the info tip and error messages read. */
export function acceptedFileFormats(): { id: string; label: string }[] {
  return acceptedFormats(STRATEGIES);
}

/**
 * Whether the app can WRITE the format of the given system (the strategy's `id`) — what decides
 * if a workspace offers the "Un mes en crudo" download. An unknown system, or one whose strategy
 * doesn't declare `writesOwnFormat`, is read-only: returning a file in a format nobody wrote is
 * never the safe default.
 */
export function writesOwnFormat(
  systemId: string,
  strategies: readonly UploadStrategy[] = STRATEGIES,
): boolean {
  return strategies.some(
    (strategy) => strategy.id === systemId && strategy.writesOwnFormat === true,
  );
}

/** The ids of every system the app can write back — the one call the download UI needs, so it
 * doesn't have to hold the registry itself just to answer `writesOwnFormat`. */
export function writableSystemIds(): string[] {
  return STRATEGIES.filter((strategy) => strategy.writesOwnFormat).map((strategy) => strategy.id);
}
