/**
 * The contract every upload strategy meets, and the domain payload it produces. A strategy
 * OWNS, for its own format: which sheet(s) to read, how to read the preamble, how to
 * classify the header row, the shape of its account code, its value-sign convention, and
 * where its period comes from (filename, an internal line, or elsewhere). Only grid-reading
 * utilities with none of those conventions baked in are shared, in `upload/grid.ts`.
 *
 * `StagedUpload` speaks only in domain terms — company, year, month, centers, accounts —
 * so two strategies that produce the same `kind` are indistinguishable to whatever consumes
 * them (the merge, `replaceWorkspace`), and adding a strategy never touches that consumer.
 */
import type * as XLSX from "xlsx";
import type { AccountRow, ImportedComment, ParsedDataset, WorkspaceMeta } from "../types";

/** One file, read once: every strategy's `detect`/`parse` call shares this same instance. */
export interface UploadCandidate {
  fileName: string;
  buffer: ArrayBuffer;
  workbook: XLSX.WorkBook;
}

/** One cost center's accounts for exactly one month (see `StagedUpload`'s "month-slice"). */
export interface CenterSlice {
  name: string;
  /** `slugifyCenter(name)` in "centers" mode; `null` in "single" mode's one nameless slice —
   * the merge keys by this instead of by name, so a single-mode workspace never needs a real
   * center identity. */
  centerId: string | null;
  accounts: AccountRow[];
}

export type StagedUpload =
  | {
      kind: "month-slice";
      /** "centers": the by-cost-centers grid (GENERAL + a column per center). "single": a
       * state-with-no-centers file, reduced to one nameless slice (`centerId: null`). */
      mode: "single" | "centers";
      /** The accounting system this month came from — the `id` of the strategy that read it.
       * Part of the workspace's identity `(sistema, empresa, año, modo)`, because two systems'
       * charts of accounts are structurally incompatible and merging them would build one
       * meaningless tree out of two (see `workspace-identity.ts`). */
      system: string;
      year: number;
      month: number;
      companyName: string;
      centers: CenterSlice[];
      /** GENERAL row values — present in "centers" mode only; "single" has no such column. */
      general?: AccountRow[];
      warnings: string[];
    }
  | {
      kind: "workspace";
      datasets: ParsedDataset[];
      meta: WorkspaceMeta;
      commentsByDataset: { datasetId: string; comments: ImportedComment[] }[];
    };

/** The members a strategy exposes — see this file's header for what each owns. */
export interface UploadStrategy {
  /** A stable identifier, used in errors and telemetry. It is also the id of the accounting SYSTEM
   * the strategy reads (see `upload/systems.ts`). */
  id: string;
  /** Spanish label for the modal's badge and the format catalogue. */
  label: string;
  /** A shape test, pure and cheap. It never reads the file name; it never throws. */
  detect(candidate: UploadCandidate): boolean;
  /** Full parse. Throws `PygParseError` with a Spanish message on failure. */
  parse(candidate: UploadCandidate): StagedUpload;
  /**
   * Declares that the app knows how to WRITE this format, not only read it. Without this member the
   * strategy is read-only, and a workspace originated by it does not offer the «Un mes en crudo»
   * download — reproducing another system's template is real work that gets done when it is needed,
   * and the question comes up with every new system, so it lives in the contract and not in a
   * per-vendor `if` in the downloads component.
   */
  writesOwnFormat?: true;
}
