import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { PygParseError } from "../errors";
import { aoaToXlsxBuffer as microplusBuffer, MICROPLUS_AOA } from "./microplus.fixtures";
import { aoaToXlsxBuffer as centersBuffer, MONTHLY_CENTERS_AOA } from "./monthly-centers.fixtures";
import { aoaToXlsxBuffer as singleBuffer, MONTHLY_SINGLE_AOA } from "./monthly-single.fixtures";
import { buildCandidate, resolveCandidate, resolveUpload, writesOwnFormat } from "./registry";
import type { StagedUpload, UploadCandidate, UploadStrategy } from "./types";

function fakeBuffer(): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet([["hola"]]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Hoja1");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

function fakeStrategy(
  id: string,
  detect: (candidate: UploadCandidate) => boolean,
  result?: StagedUpload,
): UploadStrategy {
  return {
    id,
    label: `Estrategia ${id}`,
    detect,
    parse: () =>
      result ?? { kind: "workspace", datasets: [], meta: null as never, commentsByDataset: [] },
  };
}

describe("resolveCandidate — primer acierto", () => {
  it("returns the payload of the FIRST strategy that detects a match", () => {
    const candidate = buildCandidate("x.xlsx", fakeBuffer());
    const first: StagedUpload = {
      kind: "workspace",
      datasets: [],
      meta: "first" as never,
      commentsByDataset: [],
    };
    const second: StagedUpload = {
      kind: "workspace",
      datasets: [],
      meta: "second" as never,
      commentsByDataset: [],
    };
    const strategies = [
      fakeStrategy("a", () => true, first),
      fakeStrategy("b", () => true, second),
    ];
    expect(resolveCandidate(candidate, strategies)).toBe(first);
  });

  it("skips a strategy that does not detect and falls through to the next", () => {
    const candidate = buildCandidate("x.xlsx", fakeBuffer());
    const second: StagedUpload = {
      kind: "workspace",
      datasets: [],
      meta: "second" as never,
      commentsByDataset: [],
    };
    const strategies = [fakeStrategy("a", () => false), fakeStrategy("b", () => true, second)];
    expect(resolveCandidate(candidate, strategies)).toBe(second);
  });
});

describe("resolveCandidate — el workbook se lee una sola vez", () => {
  it("passes every detect the SAME candidate/workbook instance", async () => {
    const grid = await import("./grid");
    const spy = vi.spyOn(grid, "readWorkbook");
    const candidate = buildCandidate("x.xlsx", fakeBuffer());
    expect(spy).toHaveBeenCalledTimes(1);

    const seen: unknown[] = [];
    const strategies = [
      fakeStrategy("a", (c) => {
        seen.push(c.workbook);
        return false;
      }),
      fakeStrategy("b", (c) => {
        seen.push(c.workbook);
        return true;
      }),
    ];
    resolveCandidate(candidate, strategies);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(candidate.workbook);
    expect(seen[1]).toBe(candidate.workbook);
    // Building the candidate is the only place a workbook gets read — still exactly once.
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe("resolveCandidate — detect que falla al leer devuelve false", () => {
  it("treats a throwing detect as no-match and keeps evaluating the rest", () => {
    const candidate = buildCandidate("x.xlsx", fakeBuffer());
    const matched: StagedUpload = {
      kind: "workspace",
      datasets: [],
      meta: "ok" as never,
      commentsByDataset: [],
    };
    const strategies = [
      fakeStrategy("broken", () => {
        throw new Error("hoja ausente");
      }),
      fakeStrategy("b", () => true, matched),
    ];
    expect(resolveCandidate(candidate, strategies)).toBe(matched);
  });
});

describe("la lista fija — cada formato cae en su estrategia", () => {
  it("resuelve un archivo MicroPlus por la estrategia MicroPlus", () => {
    const slice = resolveUpload("mayo.xls", microplusBuffer(MICROPLUS_AOA)) as Extract<
      StagedUpload,
      { kind: "month-slice" }
    >;
    expect(slice.kind).toBe("month-slice");
    expect(slice.system).toBe("microplus");
  });

  it("MicroPlus no le quita archivos a las otras dos estrategias", () => {
    const single = resolveUpload("descarga.xlsx", singleBuffer(MONTHLY_SINGLE_AOA)) as Extract<
      StagedUpload,
      { kind: "month-slice" }
    >;
    expect(single.system).toBe("monthly-single");
    const centers = resolveUpload(
      "PyG-2026-01-darwolf.xlsx",
      centersBuffer(MONTHLY_CENTERS_AOA),
    ) as Extract<StagedUpload, { kind: "month-slice" }>;
    expect(centers.system).toBe("monthly-centers");
  });
});

describe("writesOwnFormat — una estrategia declara si sabe escribir su formato", () => {
  it("MicroPlus es de solo lectura: su workspace no ofrece «Un mes en crudo»", () => {
    expect(writesOwnFormat("microplus")).toBe(false);
  });

  it("los dos formatos que la app sí escribe lo declaran", () => {
    expect(writesOwnFormat("monthly-single")).toBe(true);
    expect(writesOwnFormat("monthly-centers")).toBe(true);
  });

  it("un sistema desconocido se trata como de solo lectura", () => {
    expect(writesOwnFormat("")).toBe(false);
    expect(writesOwnFormat("un-sistema-que-no-existe")).toBe(false);
  });

  it("una estrategia que no lo declara es de solo lectura", () => {
    expect(writesOwnFormat("a", [fakeStrategy("a", () => true)])).toBe(false);
  });
});

describe("resolveCandidate — ninguna acierta", () => {
  it("throws PygParseError enumerating every strategy's label", () => {
    const candidate = buildCandidate("x.xlsx", fakeBuffer());
    const strategies = [fakeStrategy("a", () => false), fakeStrategy("b", () => false)];
    try {
      resolveCandidate(candidate, strategies);
      throw new Error("expected resolveCandidate to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PygParseError);
      expect((error as PygParseError).code).toBe("unrecognized-format");
      expect((error as PygParseError).message).toContain("Estrategia a");
      expect((error as PygParseError).message).toContain("Estrategia b");
    }
  });
});
