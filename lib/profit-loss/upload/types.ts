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
import type { AccountRow, ImportedComment, PygDataset, WorkspaceMeta } from "../types";

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
      datasets: PygDataset[];
      meta: WorkspaceMeta;
      commentsByDataset: { datasetId: string; comments: ImportedComment[] }[];
    };

/** The members a strategy exposes — see this file's header for what each owns. */
export interface UploadStrategy {
  /** Identificador estable, usado en errores y telemetría. También es el id del SISTEMA
   * contable que la estrategia lee (ver `upload/systems.ts`). */
  id: string;
  /** Etiqueta en español para el badge del modal y el catálogo de formatos. */
  label: string;
  /** Prueba de forma, pura y barata. Nunca lee el nombre del archivo; nunca lanza. */
  detect(candidate: UploadCandidate): boolean;
  /** Parseo completo. Lanza `PygParseError` con mensaje en español al fallar. */
  parse(candidate: UploadCandidate): StagedUpload;
  /**
   * Declara que la app sabe ESCRIBIR este formato, no solo leerlo. Sin este miembro la
   * estrategia es de solo lectura, y un workspace originado en ella no ofrece la descarga «Un
   * mes en crudo» — reproducir la plantilla de un sistema ajeno es trabajo real que se hace
   * cuando hace falta, y la pregunta se repite con cada sistema nuevo, así que vive en el
   * contrato y no en un `if` por proveedor en el componente de descargas.
   */
  writesOwnFormat?: true;
}
