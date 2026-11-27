/// <reference lib="webworker" />
/**
 * The Worker «Ventas por servicio» reads and writes its Excel in: on the real file either
 * operation takes tens of seconds, and on the main thread the screen would not answer meanwhile.
 *
 * It only orchestrates — every rule lives in the pure layer and is tested there.
 */
import { buildSalesWorkbook, workbookToBlob, type SalesExportMonth } from "../export";
import { parseSalesWorkbook, type SalesFileReading } from "./parse";

export type SalesWorkerRequest =
  | { kind: "parse"; id: number; data: ArrayBuffer }
  | { kind: "build"; id: number; months: SalesExportMonth[] };

export type SalesWorkerResponse =
  | { kind: "parsed"; id: number; reading: SalesFileReading }
  | { kind: "built"; id: number; blob: Blob }
  | { kind: "failed"; id: number; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener("message", (event: MessageEvent<SalesWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.kind === "parse") {
      const result = parseSalesWorkbook(request.data);
      scope.postMessage(
        result.ok
          ? ({
              kind: "parsed",
              id: request.id,
              reading: result.reading,
            } satisfies SalesWorkerResponse)
          : ({
              kind: "failed",
              id: request.id,
              message: result.message,
            } satisfies SalesWorkerResponse),
      );
      return;
    }
    const blob = workbookToBlob(buildSalesWorkbook(request.months));
    scope.postMessage({ kind: "built", id: request.id, blob } satisfies SalesWorkerResponse);
  } catch (error) {
    // Almost always memory. Reported as a message so the modal can say something actionable.
    scope.postMessage({
      kind: "failed",
      id: request.id,
      message:
        error instanceof Error && error.message
          ? `No se pudo procesar el archivo: ${error.message}`
          : "No se pudo procesar el archivo. Si es muy grande, prueba a partirlo por año.",
    } satisfies SalesWorkerResponse);
  }
});
