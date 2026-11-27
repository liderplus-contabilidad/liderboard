/**
 * The bridge to the Worker, and the only place that knows one exists. One Worker, created on first
 * use; without `Worker` (a test runner) it falls back to the same pure functions on this thread.
 */
import { buildSalesWorkbook, workbookToBlob, type SalesExportMonth } from "../export";
import { parseSalesWorkbook, type SalesFileReading } from "./parse";
import type { SalesWorkerRequest, SalesWorkerResponse } from "./worker";

/** Above this size the modal advises splitting the file by year BEFORE reading it — the read is
 *  the expensive part. A monthly cut is far below it. */
export const LARGE_FILE_BYTES = 12 * 1024 * 1024;

/** A distributive `Omit`: the plain one collapses the union and loses the payload fields. */
type RequestBody = SalesWorkerRequest extends infer T
  ? T extends { id: number }
    ? Omit<T, "id">
    : never
  : never;

let worker: Worker | null = null;
let nextId = 1;

function ensureWorker(): Worker | null {
  if (typeof Worker === "undefined") {
    return null;
  }
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  }
  return worker;
}

function ask<T extends SalesWorkerResponse["kind"]>(
  request: RequestBody,
  expected: T,
  transfer: Transferable[] = [],
): Promise<Extract<SalesWorkerResponse, { kind: T }>> {
  const instance = ensureWorker();
  if (!instance) {
    return Promise.reject(new Error("no-worker"));
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<SalesWorkerResponse>) => {
      if (event.data.id !== id) {
        return;
      }
      instance.removeEventListener("message", onMessage);
      instance.removeEventListener("error", onError);
      if (event.data.kind === "failed") {
        reject(new Error(event.data.message));
        return;
      }
      if (event.data.kind !== expected) {
        reject(new Error("Respuesta inesperada del lector."));
        return;
      }
      resolve(event.data as Extract<SalesWorkerResponse, { kind: T }>);
    };
    const onError = () => {
      instance.removeEventListener("message", onMessage);
      instance.removeEventListener("error", onError);
      reject(new Error("El lector se detuvo. Si el archivo es muy grande, pártelo por año."));
    };
    instance.addEventListener("message", onMessage);
    instance.addEventListener("error", onError);
    instance.postMessage({ ...request, id } as SalesWorkerRequest, transfer);
  });
}

/** One file's reading. Rejects with the message the user should see. */
export async function readSalesFile(file: File): Promise<SalesFileReading> {
  const data = await file.arrayBuffer();
  try {
    // Transferred, not copied.
    const reply = await ask({ kind: "parse", data }, "parsed", [data]);
    return reply.reading;
  } catch (error) {
    if (error instanceof Error && error.message === "no-worker") {
      const result = parseSalesWorkbook(await file.arrayBuffer());
      if (!result.ok) {
        throw new Error(result.message);
      }
      return result.reading;
    }
    throw error;
  }
}

/** The download, built off the main thread. */
export async function buildSalesBlob(months: readonly SalesExportMonth[]): Promise<Blob> {
  try {
    const reply = await ask({ kind: "build", months: [...months] }, "built");
    return reply.blob;
  } catch (error) {
    if (error instanceof Error && error.message === "no-worker") {
      return workbookToBlob(buildSalesWorkbook(months));
    }
    throw error;
  }
}
