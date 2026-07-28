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
import type {
  AccountRow,
  ImportedComment,
  PygDataset,
  PygParseResult,
  WorkspaceMeta,
} from "../types";

/** One file, read once: every strategy's `detect`/`parse` call shares this same instance. */
export interface UploadCandidate {
  fileName: string;
  buffer: ArrayBuffer;
  workbook: XLSX.WorkBook;
}

/** One cost center's accounts for exactly one month (see `StagedUpload`'s "month-slice"). */
export interface CenterSlice {
  name: string;
  accounts: AccountRow[];
}

export type StagedUpload =
  | {
      kind: "month-slice";
      year: number;
      month: number;
      companyName: string;
      centers: CenterSlice[];
      general: AccountRow[];
      warnings: string[];
    }
  | { kind: "single-statement"; result: PygParseResult }
  | {
      kind: "workspace";
      datasets: PygDataset[];
      meta: WorkspaceMeta;
      commentsByDataset: { datasetId: string; comments: ImportedComment[] }[];
    };

/** The four members a strategy exposes — see this file's header for what each owns. */
export interface UploadStrategy {
  /** Identificador estable, usado en errores y telemetría. */
  id: string;
  /** Etiqueta en español para el badge del modal y el catálogo de formatos. */
  label: string;
  /** Prueba de forma, pura y barata. Nunca lee el nombre del archivo; nunca lanza. */
  detect(candidate: UploadCandidate): boolean;
  /** Parseo completo. Lanza `PygParseError` con mensaje en español al fallar. */
  parse(candidate: UploadCandidate): StagedUpload;
}
