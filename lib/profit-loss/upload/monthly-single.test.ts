import { describe, expect, it } from "vitest";
import { PygParseError } from "../errors";
import { ANNUAL_AOA, aoaToXlsxBuffer as parseFixtureBuffer, MONTHLY_AOA } from "../parse.fixtures";
import { buildCandidate } from "./registry";
import {
  ACCUMULATED_AOA,
  aoaToXlsxBuffer,
  CROSS_MONTH_AOA,
  FEBRUARY_AOA,
  LEAP_FEBRUARY_AOA,
  LEAP_FEBRUARY_CUT_SHORT_AOA,
  MISMATCHED_RESULT_AOA,
  MONTHLY_SINGLE_AOA,
  NO_ACCOUNTS_AOA,
  NO_DATE_RANGE_AOA,
  PARTIAL_MONTH_AOA,
} from "./monthly-single.fixtures";
import { monthlySingleStrategy } from "./monthly-single";
import type { StagedUpload } from "./types";

function candidate(aoa: Parameters<typeof aoaToXlsxBuffer>[0], fileName = "descarga.xlsx") {
  return buildCandidate(fileName, aoaToXlsxBuffer(aoa));
}

function parseOk(aoa: Parameters<typeof aoaToXlsxBuffer>[0], fileName = "descarga.xlsx") {
  return monthlySingleStrategy.parse(candidate(aoa, fileName)) as Extract<
    StagedUpload,
    { kind: "month-slice" }
  >;
}

function errorOf(aoa: Parameters<typeof aoaToXlsxBuffer>[0]): PygParseError {
  try {
    parseOk(aoa);
  } catch (error) {
    if (error instanceof PygParseError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected parse to fail");
}

describe("monthlySingleStrategy.detect", () => {
  it("matches a lone Total column", () => {
    expect(monthlySingleStrategy.detect(candidate(MONTHLY_SINGLE_AOA))).toBe(true);
  });

  it("does not read the file name — any name resolves the same", () => {
    expect(monthlySingleStrategy.detect(candidate(MONTHLY_SINGLE_AOA, "descarga (3).xls"))).toBe(
      true,
    );
  });

  it("does not read the sheet name — a differently-named sheet still matches", () => {
    // `candidate()`/`aoaToXlsxBuffer` always name the sheet "Consulta Personas"; this asserts
    // detect never inspects that name, only the grid shape.
    expect(monthlySingleStrategy.detect(candidate(MONTHLY_SINGLE_AOA))).toBe(true);
  });

  it("does not match a 12-column monthly export (that shape is retired)", () => {
    expect(
      monthlySingleStrategy.detect(buildCandidate("x.xlsx", parseFixtureBuffer(MONTHLY_AOA))),
    ).toBe(false);
  });

  it("does not match a file with no account rows", () => {
    expect(monthlySingleStrategy.detect(candidate(NO_ACCOUNTS_AOA))).toBe(false);
  });
});

describe("monthlySingleStrategy.parse — archivo bien formado", () => {
  it("resuelve el mes de enero de 2026 y produce un month-slice en modo single", () => {
    const slice = parseOk(MONTHLY_SINGLE_AOA);
    expect(slice.kind).toBe("month-slice");
    expect(slice.mode).toBe("single");
    expect(slice.year).toBe(2026);
    expect(slice.month).toBe(0);
    expect(slice.companyName).toBe("NOMIK HOTELS S.A.S.");
    expect(slice.centers).toHaveLength(1);
    expect(slice.centers[0].centerId).toBeNull();
    expect(slice.centers[0].accounts.find((a) => a.code === "4")?.values).toEqual([355]);
    expect(slice.general).toBeUndefined();
    expect(slice.warnings).toEqual([]);
  });

  it("un nombre de archivo cualquiera se resuelve igual, por su línea de rango", () => {
    const slice = parseOk(MONTHLY_SINGLE_AOA, "descarga (3).xls");
    expect(slice.year).toBe(2026);
    expect(slice.month).toBe(0);
  });
});

describe("monthlySingleStrategy.parse — febrero", () => {
  it("resuelve febrero de un año no bisiesto (28 días)", () => {
    const slice = parseOk(FEBRUARY_AOA);
    expect(slice.year).toBe(2026);
    expect(slice.month).toBe(1);
  });

  it("resuelve febrero de un año bisiesto (29 días)", () => {
    const slice = parseOk(LEAP_FEBRUARY_AOA);
    expect(slice.year).toBe(2028);
    expect(slice.month).toBe(1);
  });

  it("rechaza un febrero bisiesto cortado el 28", () => {
    const error = errorOf(LEAP_FEBRUARY_CUT_SHORT_AOA);
    expect(error.code).toBe("invalid-date-range");
    expect(error.message).toContain("febrero");
  });
});

describe("monthlySingleStrategy.parse — rangos inválidos", () => {
  it("rechaza un acumulado nombrando cuántos meses abarca", () => {
    const error = errorOf(ACCUMULATED_AOA);
    expect(error.code).toBe("invalid-date-range");
    expect(error.message).toContain("6 meses");
  });

  it("rechaza un mes parcial", () => {
    const error = errorOf(PARTIAL_MONTH_AOA);
    expect(error.code).toBe("invalid-date-range");
    expect(error.message).toContain("enero");
  });

  it("rechaza un rango que cruza de mes sin empezar el día 1", () => {
    const error = errorOf(CROSS_MONTH_AOA);
    expect(error.code).toBe("invalid-date-range");
    expect(error.message).toContain("día 1");
  });

  it("rechaza un archivo sin línea de rango", () => {
    const error = errorOf(NO_DATE_RANGE_AOA);
    expect(error.code).toBe("missing-date-range");
  });
});

describe("monthlySingleStrategy.parse — validación del resultado", () => {
  it("avisa cuando Utilidad o Pérdida no cuadra con el cálculo", () => {
    const slice = parseOk(MISMATCHED_RESULT_AOA);
    expect(slice.warnings.some((w) => w.includes("Descuadre en Utilidad o Pérdida"))).toBe(true);
  });
});

describe("monthlySingleStrategy — formatos retirados", () => {
  it("no acepta el export de doce columnas de mes", () => {
    expect(
      monthlySingleStrategy.detect(buildCandidate("x.xlsx", parseFixtureBuffer(MONTHLY_AOA))),
    ).toBe(false);
  });

  it("acierta la forma del export anual (Total único) pero lo rechaza por su rango", () => {
    const c = buildCandidate("x.xlsx", parseFixtureBuffer(ANNUAL_AOA));
    expect(monthlySingleStrategy.detect(c)).toBe(true);
    try {
      monthlySingleStrategy.parse(c);
      throw new Error("expected parse to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(PygParseError);
      expect((error as PygParseError).code).toBe("invalid-date-range");
      expect((error as PygParseError).message).toContain("12 meses");
    }
  });
});
