import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { PygParseError } from "../errors";
import { buildCandidate, resolveCandidate } from "./registry";
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
    parse: () => result ?? { kind: "single-statement", result: null as never },
  };
}

describe("resolveCandidate — primer acierto", () => {
  it("returns the payload of the FIRST strategy that detects a match", () => {
    const candidate = buildCandidate("x.xlsx", fakeBuffer());
    const first: StagedUpload = { kind: "single-statement", result: "first" as never };
    const second: StagedUpload = { kind: "single-statement", result: "second" as never };
    const strategies = [
      fakeStrategy("a", () => true, first),
      fakeStrategy("b", () => true, second),
    ];
    expect(resolveCandidate(candidate, strategies)).toBe(first);
  });

  it("skips a strategy that does not detect and falls through to the next", () => {
    const candidate = buildCandidate("x.xlsx", fakeBuffer());
    const second: StagedUpload = { kind: "single-statement", result: "second" as never };
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
    const matched: StagedUpload = { kind: "single-statement", result: "ok" as never };
    const strategies = [
      fakeStrategy("broken", () => {
        throw new Error("hoja ausente");
      }),
      fakeStrategy("b", () => true, matched),
    ];
    expect(resolveCandidate(candidate, strategies)).toBe(matched);
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
