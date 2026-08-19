import { describe, expect, it } from "vitest";
import { statementFit } from "./page-fit";

/** La última cuenta de columnas que alguna hoja admite — lo que el informe puede llegar a pedir. */
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
    // Un acumulado de dos años más «Var.» y «% Ing.». Si esto cambiara, cambiaría el informe que
    // ya se imprime, que es lo único que este cambio no puede tocar.
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
    // Y caben de verdad: las columnas más el mínimo del nombre no pasan del ancho de la hoja.
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
    // Un componente que eligiera otro `px-*` desmentiría el cálculo que decidió que cabía.
    const wide = statementFit(4);
    const tight = statementFit(13);
    expect(wide.columnWidth).toBe(Math.ceil(wide.fontSize * 0.6 * 10) + wide.cellPaddingX);
    expect(tight.columnWidth).toBe(Math.ceil(tight.fontSize * 0.6 * 10) + tight.cellPaddingX);
  });

  it("los doce meses y su Total son justo lo último que cabe", () => {
    // 13 no es una cifra elegida: es el año mensual completo, que es lo máximo que el informe
    // llega a pedir ahora que una tabla es un centro-AÑO.
    expect(MAX).toBe(13);
    expect(statementFit(MAX + 1).fits).toBe(false);
  });
});
