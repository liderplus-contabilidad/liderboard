import { describe, expect, it } from "vitest";
import { PygParseError } from "../errors";
import { aoaToXlsxBuffer as dingooBuffer, DINGOO_AOA } from "./dingoo.fixtures";
import { microplusStrategy } from "./microplus";
import {
  aoaToXlsxBuffer,
  MICROPLUS_ACCUMULATED_AOA,
  MICROPLUS_AOA,
  MICROPLUS_MISMATCHED_RESULT_AOA,
  MICROPLUS_NO_ACCOUNTS_AOA,
  MICROPLUS_NO_RANGE_AOA,
  MICROPLUS_PARTIAL_MONTH_AOA,
  MICROPLUS_STRAY_MARKER_AOA,
} from "./microplus.fixtures";
import { aoaToXlsxBuffer as centersBuffer, MONTHLY_CENTERS_AOA } from "./monthly-centers.fixtures";
import { aoaToXlsxBuffer as singleBuffer, MONTHLY_SINGLE_AOA } from "./monthly-single.fixtures";
import { monthlyCentersStrategy } from "./monthly-centers";
import { monthlySingleStrategy } from "./monthly-single";
import { buildCandidate } from "./registry";
import type { StagedUpload } from "./types";

function candidate(aoa: Parameters<typeof aoaToXlsxBuffer>[0], fileName = "mayo.xls") {
  return buildCandidate(fileName, aoaToXlsxBuffer(aoa));
}

function parseOk(aoa: Parameters<typeof aoaToXlsxBuffer>[0], fileName = "mayo.xls") {
  return microplusStrategy.parse(candidate(aoa, fileName)) as Extract<
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

function valueOf(slice: Extract<StagedUpload, { kind: "month-slice" }>, code: string): number {
  const account = slice.centers[0].accounts.find((a) => a.code === code);
  if (!account) {
    throw new Error(`no account ${code}`);
  }
  return account.values[0];
}

describe("microplusStrategy.detect", () => {
  it("acierta un archivo MicroPlus con hoja Sheet1", () => {
    expect(microplusStrategy.detect(candidate(MICROPLUS_AOA))).toBe(true);
  });

  it("no lee el nombre del archivo — cualquiera acierta igual", () => {
    expect(microplusStrategy.detect(candidate(MICROPLUS_AOA, "descarga (3).xlsx"))).toBe(true);
  });

  it("no acierta un archivo sin la fila CODIGO + NOMBRE DE LA CUENTA", () => {
    expect(
      microplusStrategy.detect(buildCandidate("x.xlsx", singleBuffer(MONTHLY_SINGLE_AOA))),
    ).toBe(false);
    expect(
      microplusStrategy.detect(
        buildCandidate("PyG-2026-01.xlsx", centersBuffer(MONTHLY_CENTERS_AOA)),
      ),
    ).toBe(false);
  });

  it("no reclama un archivo de Dingoo, cuyo encabezado normaliza a las mismas etiquetas", () => {
    // `Código`/`Nombre de la cuenta` is indistinguishable from `CODIGO`/`NOMBRE DE LA CUENTA` once
    // accents and case are normalized; what separates the two formats is the range row.
    expect(
      microplusStrategy.detect(
        buildCandidate("RptEstadoResultados.xlsx", dingooBuffer(DINGOO_AOA)),
      ),
    ).toBe(false);
  });

  it("el encabezado solo no basta: sin la fila Desde:/Hasta: no acierta", () => {
    expect(microplusStrategy.detect(candidate(MICROPLUS_NO_RANGE_AOA))).toBe(false);
  });
});

describe("microplusStrategy — no se confunde con los otros formatos", () => {
  it("ni el estado único ni el mensual por centros aciertan un archivo MicroPlus", () => {
    const c = candidate(MICROPLUS_AOA);
    expect(monthlySingleStrategy.detect(c)).toBe(false);
    expect(monthlyCentersStrategy.detect(c)).toBe(false);
  });
});

describe("microplusStrategy.parse — archivo bien formado", () => {
  it("produce un month-slice de mayo de 2026 en modo single", () => {
    const slice = parseOk(MICROPLUS_AOA);
    expect(slice.kind).toBe("month-slice");
    expect(slice.mode).toBe("single");
    expect(slice.system).toBe("microplus");
    expect(slice.year).toBe(2026);
    expect(slice.month).toBe(4);
    expect(slice.companyName).toBe("HOSPITAL GENERAL PRIVADO DURAN");
    expect(slice.centers).toHaveLength(1);
    expect(slice.centers[0].centerId).toBeNull();
    expect(slice.general).toBeUndefined();
  });

  it("el periodo sale del rango, nunca de la fecha de impresión", () => {
    // The preamble declares `Fecha:` with July 2026's serial and a range of May.
    const slice = parseOk(MICROPLUS_AOA);
    expect(slice.month).toBe(4);
    expect(slice.year).toBe(2026);
  });
});

describe("microplusStrategy.parse — el código se normaliza", () => {
  it("quita el punto final y conserva los ceros a la izquierda", () => {
    const codes = parseOk(MICROPLUS_AOA).centers[0].accounts.map((a) => a.code);
    expect(codes).toEqual([
      "4",
      "4.1",
      "4.1.01",
      "4.1.01.01",
      "4.1.01.02",
      "4.1.02",
      "4.1.02.01",
      "5",
      "5.1",
      "5.1.01",
      "5.2",
      "5.2.01",
      "5.2.03",
    ]);
  });

  it("4.1.01 queda antes que 4.1.02, leídos como números", () => {
    const codes = parseOk(MICROPLUS_AOA).centers[0].accounts.map((a) => a.code);
    expect(codes.indexOf("4.1.01")).toBeLessThan(codes.indexOf("4.1.02"));
  });

  it("no avisa cuando el marcador de punto final concuerda con el árbol", () => {
    expect(parseOk(MICROPLUS_AOA).warnings).toEqual([]);
  });

  it("avisa nombrando la cuenta cuando el marcador discrepa, y conserva el árbol derivado", () => {
    const slice = parseOk(MICROPLUS_STRAY_MARKER_AOA);
    expect(slice.warnings).toEqual([
      "La cuenta 5.2.03 viene marcada como cuenta padre pero no tiene cuentas anidadas en el " +
        "archivo; se conserva el árbol derivado de los códigos.",
    ]);
    // The tree leads: the account still exists with its normalized code and its value.
    expect(valueOf(slice, "5.2.03")).toBe(-150);
  });
});

describe("microplusStrategy.parse — la rama de gastos se niega al importar", () => {
  it("deja los ingresos como vienen y niega la rama 5", () => {
    const slice = parseOk(MICROPLUS_AOA);
    expect(valueOf(slice, "4")).toBe(3500);
    expect(valueOf(slice, "5")).toBe(1240.5);
    expect(valueOf(slice, "5.1.01")).toBe(1000);
  });

  it("el resultado cuadra con el RESULTADO: del archivo, sin aviso de descuadre", () => {
    // 3,500.00 − 1,240.50 = 2,259.50, the same RESULTADO: the file declares.
    expect(parseOk(MICROPLUS_AOA).warnings).toEqual([]);
  });

  it("avisa cuando el RESULTADO: del archivo no cuadra con el cálculo", () => {
    const slice = parseOk(MICROPLUS_MISMATCHED_RESULT_AOA);
    expect(slice.warnings.some((w) => w.includes("Descuadre en el RESULTADO"))).toBe(true);
  });

  it("la contra-cuenta positiva queda restando gasto", () => {
    const slice = parseOk(MICROPLUS_AOA);
    expect(valueOf(slice, "5.2.03")).toBe(-150);
    // 390.50 of salaries minus 150.00 of discount = 240.50 of administrative expense.
    expect(valueOf(slice, "5.2.01") + valueOf(slice, "5.2.03")).toBe(240.5);
  });
});

describe("microplusStrategy.parse — la misma regla de rango que el resto", () => {
  it("rechaza el acumulado de cinco meses y dice qué rango exportar", () => {
    const error = errorOf(MICROPLUS_ACCUMULATED_AOA);
    expect(error.code).toBe("invalid-date-range");
    expect(error.message).toContain("5 meses");
    expect(error.message).toContain("Desde 01/05/2026 hasta 31/05/2026");
  });

  it("rechaza un mes parcial", () => {
    const error = errorOf(MICROPLUS_PARTIAL_MONTH_AOA);
    expect(error.code).toBe("invalid-date-range");
    expect(error.message).toContain("mayo");
  });

  it("rechaza un archivo sin línea de rango", () => {
    expect(errorOf(MICROPLUS_NO_RANGE_AOA).code).toBe("missing-date-range");
  });

  it("rechaza un archivo sin cuentas", () => {
    expect(errorOf(MICROPLUS_NO_ACCOUNTS_AOA).code).toBe("no-accounts");
  });
});
