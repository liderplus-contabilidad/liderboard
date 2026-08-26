import { describe, expect, it } from "vitest";
import { parseSalesGrid } from "./parse";
import {
  foreignGrid,
  salesGrid,
  salesGridShifted,
  salesGridWithRange,
  salesGridWithTextAmounts,
} from "./parse.fixtures";
import type { Cell } from "@/lib/excel/workbook";

function ok(grid: Cell[][]) {
  const result = parseSalesGrid(grid);
  if (!result.ok) {
    throw new Error(`se esperaba una lectura correcta, y falló: ${result.message}`);
  }
  return result.month;
}

describe("detección del formato", () => {
  it("reconoce el reporte por su título y su cabecera", () => {
    expect(parseSalesGrid(salesGrid()).ok).toBe(true);
  });

  it("un balance de MicroPlus NO se confunde con este reporte", () => {
    const result = parseSalesGrid(foreignGrid());
    expect(result.ok).toBe(false);
    // Y el rechazo NOMBRA lo que esperaba, en vez de dejar al usuario adivinando.
    expect(result.ok === false && result.message).toContain("VENTA TOTAL");
  });

  it("sin el título tampoco entra, aunque la cabecera coincida", () => {
    const grid = salesGrid();
    grid[2] = grid[2].map(() => null);
    grid[2][3] = "OTRO REPORTE CUALQUIERA";
    expect(parseSalesGrid(grid).ok).toBe(false);
  });

  it("nada se localiza por coordenada: desplazar la plantilla da la MISMA lectura", () => {
    expect(ok(salesGridShifted())).toEqual(ok(salesGrid()));
  });
});

describe("el periodo", () => {
  it("un mes completo entra como ese mes", () => {
    const month = ok(salesGrid());
    expect(month.year).toBe(2026);
    expect(month.monthIndex).toBe(3);
  });

  it("un rango de dos meses se rechaza diciendo qué leyó", () => {
    const result = parseSalesGrid(salesGridWithRange("01/03/2026", "30/04/2026"));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("01/03/2026–30/04/2026");
  });

  it("medio mes se rechaza", () => {
    const result = parseSalesGrid(salesGridWithRange("01/04/2026", "15/04/2026"));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("abril completo");
  });

  it("a caballo entre dos meses se rechaza", () => {
    expect(parseSalesGrid(salesGridWithRange("15/04/2026", "14/05/2026")).ok).toBe(false);
  });

  it("sin periodo declarado no hay carga: no se deduce de ningún otro sitio", () => {
    const grid = salesGrid();
    grid[4] = grid[4].map(() => null);
    const result = parseSalesGrid(grid);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("no declara su periodo");
  });

  it("febrero bisiesto entra entero", () => {
    const month = ok(salesGridWithRange("01/02/2024", "29/02/2024"));
    expect(month.monthIndex).toBe(1);
    expect(month.year).toBe(2024);
  });
});

describe("las líneas", () => {
  it("cada fila es una línea COMPLETA: servicio, pagador, cantidad e importe", () => {
    const month = ok(salesGrid());
    expect(month.lines).toHaveLength(5);
    expect(month.lines[0]).toEqual({
      serviceCode: "\\01",
      serviceName: "HONORARIOS",
      payer: "ASEGURADORA UNO S.A.",
      quantity: 1,
      amount: 1200.5,
    });
  });

  it("el código de servicio se repite en cada fila y NO se hereda de una cabecera de grupo", () => {
    expect(ok(salesGrid()).lines.map((line) => line.serviceCode)).toEqual([
      "\\01",
      "\\02",
      "\\01",
      "\\03",
      "\\02",
    ]);
  });

  it("las columnas de los DATOS no son las de los rótulos, y se leen igual", () => {
    // La cabecera centra `CANTIDAD` y `VENTA TOTAL` una columna a la derecha de sus valores. Leer
    // por la columna del rótulo devolvía una celda vacía en todas las filas y el reporte salía
    // «sin ninguna línea» — el fallo con el que este formato llegó.
    const month = ok(salesGrid());
    expect(month.lines.every((line) => line.amount > 0)).toBe(true);
  });

  it("los importes también pueden llegar como texto con separador de miles", () => {
    const month = ok(salesGridWithTextAmounts());
    expect(month.lines[0].amount).toBe(1200.5);
    expect(month.lines[1].amount).toBe(250);
  });

  it("la cabecera no entra como pagador", () => {
    const month = ok(salesGrid());
    expect(month.lines.some((line) => line.payer === "NOMBRE")).toBe(false);
  });

  it("el preámbulo y la paginación no entran como datos", () => {
    const month = ok(salesGrid());
    expect(month.lines.some((line) => line.payer.includes("Página"))).toBe(false);
    expect(month.lines.some((line) => line.payer.includes("CLINICA DE PRUEBA"))).toBe(false);
  });

  it("las dos filas de cierre no entran como líneas", () => {
    const month = ok(salesGrid());
    expect(month.lines.some((line) => line.payer.startsWith("TOTAL"))).toBe(false);
    expect(month.lines).toHaveLength(5);
  });

  it("un reporte sin ninguna línea se rechaza en vez de guardarse vacío", () => {
    expect(parseSalesGrid(salesGrid().slice(0, 7)).ok).toBe(false);
  });
});

describe("el cuadre contra el total del archivo", () => {
  it("el total sale de la fila SIN RÓTULO del cierre, no del recuento de ítems", () => {
    // `TOTAL ITEMS` vale 5 —son LÍNEAS—; el total en dólares es 1.900. Buscar un rótulo «TOTAL»
    // habría cuadrado el mes contra un recuento.
    const month = ok(salesGrid());
    expect(month.declaredTotal).toBe(1900);
  });

  it("cuadrando al centavo no hay aviso", () => {
    expect(ok(salesGrid()).warnings).toEqual([]);
  });

  it("una diferencia se AVISA nombrándola, y el mes se carga igual", () => {
    const grid = salesGrid();
    grid[13][24] = 2000;
    const month = ok(grid);
    expect(month.warnings).toHaveLength(1);
    expect(month.warnings[0]).toContain("-100.00");
    expect(month.lines).toHaveLength(5);
  });

  it("sin fila de cierre no hay nada contra qué cuadrar, y tampoco aviso", () => {
    const grid = salesGrid().slice(0, 12);
    const month = ok(grid);
    expect(month.declaredTotal).toBeNull();
    expect(month.warnings).toEqual([]);
  });
});

describe("la empresa", () => {
  it("se lee la razón social y no el título ni la paginación", () => {
    expect(ok(salesGrid()).companyName).toBe("CLINICA DE PRUEBA S.A.");
  });
});
