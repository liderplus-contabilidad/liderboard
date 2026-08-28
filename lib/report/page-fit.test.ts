import { describe, expect, it } from "vitest";
import { statementFit } from "./page-fit";

/** The largest column count any sheet admits — what the report can end up asking for. */
const MAX = (() => {
  let last = 0;
  for (let columns = 1; columns <= 60; columns += 1) {
    if (statementFit(columns).fits) {
      last = columns;
    }
  }
  return last;
})();

describe("statementFit", () => {
  it("deja el informe de hoy donde está: cuatro columnas, vertical, 10.5 px", () => {
    // An accumulated figure of two years plus «Var.» and «% Ing.». If this changed, the report that
    // is already printed would change, which is the one thing this change cannot touch.
    const fit = statementFit(4);
    expect(fit.orientation).toBe("portrait");
    expect(fit.fontSize).toBe(10.5);
    expect(fit.fits).toBe(true);
  });

  it("baja la tipografía antes que girar la hoja", () => {
    const fit = statementFit(7);
    expect(fit.orientation).toBe("portrait");
    expect(fit.fontSize).toBeLessThan(10.5);
    expect(fit.fits).toBe(true);
  });

  it("gira la hoja para los doce meses y su Total", () => {
    const fit = statementFit(13);
    expect(fit.orientation).toBe("landscape");
    expect(fit.fits).toBe(true);
    // And they really fit: the columns plus the name's minimum do not exceed the sheet's width.
    expect(13 * fit.columnWidth).toBeLessThanOrEqual(fit.sheetWidth - 190);
  });

  it("no finge que dos años de meses caben", () => {
    expect(statementFit(26).fits).toBe(false);
  });

  it("nunca deja el nombre por debajo de su mínimo mientras diga que cabe", () => {
    for (let columns = 1; columns <= MAX; columns += 1) {
      const fit = statementFit(columns);
      expect(fit.fits).toBe(true);
      expect(fit.sheetWidth - columns * fit.columnWidth).toBeGreaterThanOrEqual(190);
    }
  });

  it("el padding devuelto es el que entró en la cuenta", () => {
    // A component that chose another `px-*` would contradict the computation that decided it fitted.
    const wide = statementFit(4);
    const tight = statementFit(13);
    expect(wide.columnWidth).toBe(Math.ceil(wide.fontSize * 0.6 * 10) + wide.cellPaddingX);
    expect(tight.columnWidth).toBe(Math.ceil(tight.fontSize * 0.6 * 10) + tight.cellPaddingX);
  });

  it("los doce meses y su Total son justo lo último que cabe", () => {
    // 13 is not a chosen figure: it is the complete monthly year, which is the most the report can
    // ask for now that a table is a center-YEAR.
    expect(MAX).toBe(13);
    expect(statementFit(MAX + 1).fits).toBe(false);
  });
});

describe("la cota de la cifra más ancha", () => {
  it("por defecto son diez caracteres, y ningún llamador existente cambia de encaje", () => {
    expect(statementFit(5)).toEqual(statementFit(5, 10));
  });

  it("una cifra más ancha ENSANCHA la columna", () => {
    // Thirteen characters is `$1,446,789.21`: cents over millions, which is what the year-on-year
    // comparison of Ventas prints.
    expect(statementFit(5, 13).columnWidth).toBeGreaterThan(statementFit(5, 10).columnWidth);
  });

  it("la columna cabe la cifra que dice caber", () => {
    // The real failure: the column came out narrower than its content and `overflow-hidden` ate the
    // last digits with no mark at all.
    const fit = statementFit(5, 13);
    const textWidth = 13 * fit.fontSize * 0.6;
    expect(fit.columnWidth).toBeGreaterThanOrEqual(textWidth);
  });

  it("con cifras anchas baja el cuerpo de letra antes que desbordar la hoja", () => {
    expect(statementFit(5, 13).fontSize).toBeLessThan(statementFit(5, 10).fontSize);
    expect(statementFit(5, 13).orientation).toBe("portrait");
  });

  it("y las columnas de una tabla ancha siguen cabiendo en la hoja", () => {
    const fit = statementFit(5, 13);
    expect(5 * fit.columnWidth).toBeLessThanOrEqual(fit.sheetWidth - 190);
  });
});
