import { describe, expect, it } from "vitest";
import { PygParseError } from "../errors";
import { buildCandidate } from "./registry";
import {
  aoaToXlsxBuffer,
  MISSING_GENERAL_AOA,
  MONTHLY_CENTERS_AOA,
  NO_ACCOUNTS_AOA,
  TRAILING_BLANK_HEADER_AOA,
} from "./monthly-centers.fixtures";
import { monthlyCentersStrategy } from "./monthly-centers";
import type { StagedUpload } from "./types";

function candidate(aoa: Parameters<typeof aoaToXlsxBuffer>[0], fileName: string) {
  return buildCandidate(fileName, aoaToXlsxBuffer(aoa));
}

function parseOk(aoa: Parameters<typeof aoaToXlsxBuffer>[0], fileName: string) {
  const c = candidate(aoa, fileName);
  return monthlyCentersStrategy.parse(c) as Extract<StagedUpload, { kind: "month-slice" }>;
}

function errorCode(aoa: Parameters<typeof aoaToXlsxBuffer>[0], fileName: string): string {
  try {
    parseOk(aoa, fileName);
  } catch (error) {
    if (error instanceof PygParseError) {
      return error.code;
    }
    throw error;
  }
  throw new Error("expected parse to fail");
}

describe("monthlyCentersStrategy.detect", () => {
  it("matches the GENERAL + centers + sin-centro shape", () => {
    expect(monthlyCentersStrategy.detect(candidate(MONTHLY_CENTERS_AOA, "PyG-2026-06.xlsx"))).toBe(
      true,
    );
  });

  it("still matches when GENERAL is missing (shape, not label, decides)", () => {
    expect(monthlyCentersStrategy.detect(candidate(MISSING_GENERAL_AOA, "PyG-2026-06.xlsx"))).toBe(
      true,
    );
  });

  it("does not match a file with no account rows", () => {
    expect(monthlyCentersStrategy.detect(candidate(NO_ACCOUNTS_AOA, "PyG-2026-06.xlsx"))).toBe(
      false,
    );
  });
});

describe("monthlyCentersStrategy.parse — archivo bien formado", () => {
  it("parses the company, centers, general and warnings", () => {
    const slice = parseOk(MONTHLY_CENTERS_AOA, "PyG-2026-06-junio.xlsx");
    expect(slice.kind).toBe("month-slice");
    expect(slice.mode).toBe("centers");
    expect(slice.year).toBe(2026);
    expect(slice.month).toBe(5);
    expect(slice.companyName).toBe("HOTELERA ANDES S.A.");
    // Two centers + the sin-centro bucket folded in as one more center, positioned last.
    expect(slice.centers.map((c) => c.name)).toEqual([
      "SUCURSAL NORTE",
      "SUCURSAL SUR",
      "SIN CENTRO DE COSTO",
    ]);
    const norte = slice.centers[0];
    expect(norte.centerId).toBe("sucursal-norte");
    expect(norte.accounts.find((a) => a.code === "4")?.values).toEqual([300]);
    expect(slice.general?.find((a) => a.code === "4")?.values).toEqual([355]);
    expect(slice.warnings).toEqual([]);
  });

  it("ignores trailing blank header columns", () => {
    const slice = parseOk(TRAILING_BLANK_HEADER_AOA, "PyG-2026-06.xlsx");
    expect(slice.centers).toHaveLength(3);
  });
});

describe("monthlyCentersStrategy.parse — el archivo no trae fecha", () => {
  it("succeeds with no date-range line in the preamble", () => {
    // MONTHLY_CENTERS_AOA's preamble is just the company name + "Estado de Resultados".
    expect(() => parseOk(MONTHLY_CENTERS_AOA, "PyG-2026-06.xlsx")).not.toThrow();
  });
});

describe("monthlyCentersStrategy.parse — falta GENERAL", () => {
  it("fails naming the missing GENERAL column", () => {
    expect(errorCode(MISSING_GENERAL_AOA, "PyG-2026-06.xlsx")).toBe("general-missing");
  });
});

describe("monthlyCentersStrategy.parse — forma correcta, nombre inválido", () => {
  it("fails with the filename-specific error, not a generic one", () => {
    expect(errorCode(MONTHLY_CENTERS_AOA, "junio.xlsx")).toBe("invalid-filename");
  });

  it("fails with the month-out-of-range error for an impossible month", () => {
    expect(errorCode(MONTHLY_CENTERS_AOA, "PyG-2026-13.xlsx")).toBe("month-out-of-range");
  });
});
