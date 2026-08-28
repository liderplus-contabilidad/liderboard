import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { PygParseError } from "../errors";
import { dingooStrategy } from "./dingoo";
import {
  aoaToXlsxBuffer,
  DINGOO_ACCUMULATED_AOA,
  DINGOO_AOA,
  DINGOO_EMPTY_VALUE_AOA,
  DINGOO_MISMATCHED_RESULT_AOA,
  DINGOO_NO_ACCOUNTS_AOA,
  DINGOO_NO_HEADER_AOA,
  DINGOO_NO_RANGE_AOA,
  DINGOO_NO_RESULT_AOA,
  DINGOO_PARTIAL_MONTH_AOA,
} from "./dingoo.fixtures";
import { aoaToXlsxBuffer as microplusBuffer, MICROPLUS_AOA } from "./microplus.fixtures";
import { aoaToXlsxBuffer as centersBuffer, MONTHLY_CENTERS_AOA } from "./monthly-centers.fixtures";
import { aoaToXlsxBuffer as singleBuffer, MONTHLY_SINGLE_AOA } from "./monthly-single.fixtures";
import { microplusStrategy } from "./microplus";
import { monthlyCentersStrategy } from "./monthly-centers";
import { monthlySingleStrategy } from "./monthly-single";
import { buildCandidate } from "./registry";
import type { StagedUpload } from "./types";

/** The app's own statement sheet, inline: month headers instead of `Saldo`, no range line. */
function appWorkbookBuffer(): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["HOTELERA ANDES S.A."],
    ["Estado de Resultados"],
    [null],
    [null, null, "Enero", "Febrero", "Total"],
    ["4", "Ingresos", 10, 20, 30],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Estado");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

function candidate(
  aoa: Parameters<typeof aoaToXlsxBuffer>[0],
  fileName = "RptEstadoResultados.xlsx",
) {
  return buildCandidate(fileName, aoaToXlsxBuffer(aoa));
}

function parseOk(aoa: Parameters<typeof aoaToXlsxBuffer>[0]) {
  return dingooStrategy.parse(candidate(aoa)) as Extract<StagedUpload, { kind: "month-slice" }>;
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

function valueOf(slice: Extract<StagedUpload, { kind: "month-slice" }>, code: string): number {
  const account = slice.centers[0].accounts.find((a) => a.code === code);
  if (!account) {
    throw new Error(`no account ${code}`);
  }
  return account.values[0];
}

describe("dingooStrategy.detect", () => {
  it("acierta un archivo con encabezado y línea de rango", () => {
    expect(dingooStrategy.detect(candidate(DINGOO_AOA))).toBe(true);
  });

  it("no lee el nombre del archivo — cualquiera acierta igual", () => {
    expect(dingooStrategy.detect(candidate(DINGOO_AOA, "descarga (3).xlsx"))).toBe(true);
  });

  it("el encabezado solo NO basta: sin línea de rango no acierta", () => {
    expect(dingooStrategy.detect(candidate(DINGOO_NO_RANGE_AOA))).toBe(false);
  });

  it("la línea de rango sola tampoco basta: sin encabezado no acierta", () => {
    expect(dingooStrategy.detect(candidate(DINGOO_NO_HEADER_AOA))).toBe(false);
  });

  it("no reclama un archivo de MicroPlus, que declara su rango en celdas separadas", () => {
    expect(dingooStrategy.detect(buildCandidate("mayo.xls", microplusBuffer(MICROPLUS_AOA)))).toBe(
      false,
    );
  });

  it("no se confunde con los otros tres formatos", () => {
    expect(dingooStrategy.detect(buildCandidate("x.xlsx", singleBuffer(MONTHLY_SINGLE_AOA)))).toBe(
      false,
    );
    expect(
      dingooStrategy.detect(buildCandidate("PyG-2026-01.xlsx", centersBuffer(MONTHLY_CENTERS_AOA))),
    ).toBe(false);
    expect(dingooStrategy.detect(buildCandidate("app.xlsx", appWorkbookBuffer()))).toBe(false);
  });
});

describe("dingooStrategy — las detecciones son mutuamente excluyentes", () => {
  it("ninguna otra estrategia acierta un archivo Dingoo", () => {
    const c = candidate(DINGOO_AOA);
    expect(microplusStrategy.detect(c)).toBe(false);
    expect(monthlySingleStrategy.detect(c)).toBe(false);
    expect(monthlyCentersStrategy.detect(c)).toBe(false);
  });

  it("para cada archivo acierta exactamente una de las dos", () => {
    const dingoo = candidate(DINGOO_AOA);
    const microplus = buildCandidate("mayo.xls", microplusBuffer(MICROPLUS_AOA));
    expect([dingooStrategy.detect(dingoo), microplusStrategy.detect(dingoo)]).toEqual([
      true,
      false,
    ]);
    expect([dingooStrategy.detect(microplus), microplusStrategy.detect(microplus)]).toEqual([
      false,
      true,
    ]);
  });
});

describe("dingooStrategy.parse — archivo bien formado", () => {
  it("produce un month-slice de mayo de 2026 en modo single", () => {
    const slice = parseOk(DINGOO_AOA);
    expect(slice.kind).toBe("month-slice");
    expect(slice.mode).toBe("single");
    expect(slice.system).toBe("dingoo");
    expect(slice.year).toBe(2026);
    expect(slice.month).toBe(4);
    expect(slice.centers).toHaveLength(1);
    expect(slice.centers[0].centerId).toBeNull();
    expect(slice.centers[0].name).toBe("");
    expect(slice.general).toBeUndefined();
  });

  it("la empresa salta los rótulos del reporte y es la razón social", () => {
    expect(parseOk(DINGOO_AOA).companyName).toBe("DELICMAR S.A.S");
  });
});

describe("dingooStrategy.parse — la rama de ingresos se niega al importar", () => {
  it("niega la rama 4 y deja intacta la 5", () => {
    const slice = parseOk(DINGOO_AOA);
    expect(valueOf(slice, "4")).toBe(3500);
    expect(valueOf(slice, "4.01.01.02")).toBe(3500);
    expect(valueOf(slice, "5")).toBe(1215.5);
    expect(valueOf(slice, "5.01.01.01")).toBe(1000);
  });

  it("la contra-cuenta positiva dentro de ingresos queda restando ingreso", () => {
    const slice = parseOk(DINGOO_AOA);
    expect(valueOf(slice, "4.01.11.01")).toBe(-150);
    // 3,500.00 of sales minus 150.00 of returns = 3,350.00 of ordinary revenue.
    expect(valueOf(slice, "4.01.01.02") + valueOf(slice, "4.01.11.01")).toBe(3350);
  });

  it("la contra-cuenta negativa dentro de gastos sigue restando gasto", () => {
    expect(valueOf(parseOk(DINGOO_AOA), "5.01.02.01")).toBe(-25);
  });

  it("el resultado cuadra con el del archivo, sin aviso de descuadre", () => {
    // 3,500.00 − 1,215.50 = 2,284.50, the −2,284.50 the file declares, negated.
    expect(parseOk(DINGOO_AOA).warnings).toEqual([]);
  });

  it("avisa cuando el Resultado del ejercicio del archivo no cuadra", () => {
    const slice = parseOk(DINGOO_MISMATCHED_RESULT_AOA);
    expect(slice.warnings.some((w) => w.includes("Descuadre en el Resultado del ejercicio"))).toBe(
      true,
    );
  });

  it("un archivo sin fila de resultado no produce aviso", () => {
    expect(parseOk(DINGOO_NO_RESULT_AOA).warnings).toEqual([]);
  });
});

describe("dingooStrategy.parse — el código se conserva verbatim", () => {
  it("mantiene los ceros a la izquierda de cada segmento", () => {
    const codes = parseOk(DINGOO_AOA).centers[0].accounts.map((a) => a.code);
    expect(codes).toEqual([
      "4",
      "4.01",
      "4.01.01",
      "4.01.01.02",
      "4.01.11",
      "4.01.11.01",
      "4.03",
      "4.03.01",
      "5",
      "5.01",
      "5.01.01",
      "5.01.01.01",
      "5.01.02",
      "5.01.02.01",
      "5.02",
      "5.02.01",
      "5.02.01.01",
      "5.02.01.01.01",
    ]);
  });

  it("el árbol se deriva de los códigos sin caso especial", () => {
    const codes = parseOk(DINGOO_AOA).centers[0].accounts.map((a) => a.code);
    expect(codes).toContain("4.01.01");
    expect(codes.indexOf("4.01.01")).toBeLessThan(codes.indexOf("4.01.01.02"));
    expect(codes.indexOf("4.01.01")).toBeLessThan(codes.indexOf("4.01.11"));
  });
});

describe("dingooStrategy.parse — el valor sale de la columna Saldo", () => {
  it("una celda vacía vale 0 y no adopta el número de otra columna", () => {
    expect(valueOf(parseOk(DINGOO_EMPTY_VALUE_AOA), "5.02.01.01.01")).toBe(0);
  });
});

describe("dingooStrategy.parse — la misma regla de rango que el resto", () => {
  it("rechaza el acumulado de cinco meses y dice qué rango exportar", () => {
    const error = errorOf(DINGOO_ACCUMULATED_AOA);
    expect(error.code).toBe("invalid-date-range");
    expect(error.message).toContain("5 meses");
    expect(error.message).toContain("Desde 01/05/2026 hasta 31/05/2026");
  });

  it("rechaza un mes parcial nombrando el mes", () => {
    const error = errorOf(DINGOO_PARTIAL_MONTH_AOA);
    expect(error.code).toBe("invalid-date-range");
    expect(error.message).toContain("mayo");
  });

  it("rechaza un archivo sin línea de rango", () => {
    expect(errorOf(DINGOO_NO_RANGE_AOA).code).toBe("missing-date-range");
  });

  it("rechaza un archivo sin fila de encabezado", () => {
    expect(errorOf(DINGOO_NO_HEADER_AOA).code).toBe("no-header");
  });

  it("rechaza un archivo sin cuentas", () => {
    expect(errorOf(DINGOO_NO_ACCOUNTS_AOA).code).toBe("no-accounts");
  });
});

describe("dingooStrategy — solo lectura", () => {
  it("no declara que sepa escribir su formato", () => {
    expect(dingooStrategy.writesOwnFormat).toBeUndefined();
  });
});
