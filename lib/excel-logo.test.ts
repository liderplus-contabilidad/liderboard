import { describe, expect, it } from "vitest";
import { bandWidthFor, columnAnchorAt, columnWidthPx } from "./excel-logo";

describe("columnWidthPx", () => {
  it("convierte caracteres a píxeles con la regla de Excel (7 por carácter + 5)", () => {
    expect(columnWidthPx(12)).toBe(89);
    expect(columnWidthPx(42)).toBe(299);
  });

  // Es lo que hace que anclar contra una hoja de Ocupaciones —donde solo la columna A declara
  // ancho— caiga donde cae de verdad y no en la columna B.
  it("una columna que nadie declaró vale los 64 px de una columna en blanco", () => {
    expect(columnWidthPx(undefined)).toBe(64);
  });
});

describe("columnAnchorAt", () => {
  // Los anchos de una hoja de estado de resultados: código, nombre y meses.
  const statement = [12, 42, 13, 13, 13];
  const EMU = 9525;

  it("un desplazamiento de cero es el borde izquierdo", () => {
    expect(columnAnchorAt(statement, 0)).toEqual({ nativeCol: 0, nativeColOff: 0 });
  });

  // La forma fraccionaria de exceljs (`col: 1.81`) NO sirve aquí: su Anchor la convierte con
  // `caracteres × 10000` EMU por columna cuando un carácter mide ~66.700, así que encoge más de
  // seis veces y el logo aparece al principio de la columna en vez de al final. Por eso el
  // desplazamiento viaja en EMU, que es la unidad del propio formato.
  it("cae DENTRO de la columna que lo contiene, con el resto en EMU", () => {
    // 89 (código) + 299 (nombre) = 388; a 332 px quedan 243 dentro de la columna del nombre.
    expect(columnAnchorAt(statement, 332)).toEqual({
      nativeCol: 1,
      nativeColOff: 243 * EMU,
    });
  });

  it("el borde exacto entre dos columnas es el principio de la siguiente, sin resto", () => {
    expect(columnAnchorAt(statement, 89)).toEqual({ nativeCol: 1, nativeColOff: 0 });
    expect(columnAnchorAt(statement, 89 + 299)).toEqual({ nativeCol: 2, nativeColOff: 0 });
  });

  it("pasada la última columna declarada sigue contando en columnas en blanco", () => {
    // 388 de las dos primeras + 3 × 96 = 676 agota lo declarado; lo que sobra va a 64 px cada una.
    expect(columnAnchorAt(statement, 676 + 64)).toEqual({ nativeCol: 6, nativeColOff: 0 });
  });

  it("una hoja sin ningún ancho declarado cuenta todo a 64 px", () => {
    expect(columnAnchorAt([], 128)).toEqual({ nativeCol: 2, nativeColOff: 0 });
  });

  it("un desplazamiento negativo no produce un ancla negativa", () => {
    expect(columnAnchorAt(statement, -50)).toEqual({ nativeCol: 0, nativeColOff: 0 });
  });

  it("un desplazamiento disparatado se detiene en vez de girar para siempre", () => {
    expect(columnAnchorAt(statement, 10_000_000).nativeCol).toBe(256);
  });
});

describe("bandWidthFor", () => {
  /** PyG: código (12) + nombre (42), y detrás columnas de meses. */
  const statement = [12, 42, 13, 13, 13];
  /** Ocupaciones: una sola columna de rótulos, ancha, y detrás un día por columna. */
  const occupancy = [40];

  // Es el arreglo que pidió la firma: pegado al final del nombre, no flotando entre las cifras.
  it("acaba donde acaba el bloque de rótulos, no más allá", () => {
    expect(bandWidthFor(statement, 2, 56, 56)).toBe(89 + 299);
  });

  it("una sola columna de rótulos manda igual", () => {
    expect(bandWidthFor(occupancy, 1, 56, 56)).toBe(285);
  });

  // Sin esto, la columna de etiquetas de Ocupaciones (285 px) no daría para dos logos apaisados de
  // 240 y el del centro se dibujaría ENCIMA del del hotel, que no es un membrete sino un borrón.
  it("se ensancha lo justo cuando los dos logos no caben en los rótulos", () => {
    expect(bandWidthFor(occupancy, 1, 240, 240)).toBe(240 + 16 + 240);
  });

  it("el logo derecho nunca empieza antes de donde acaba el izquierdo", () => {
    for (const [left, right] of [
      [240, 240],
      [56, 240],
      [240, 56],
      [56, 56],
    ]) {
      expect(bandWidthFor(occupancy, 1, left, right) - right).toBeGreaterThanOrEqual(left);
    }
  });

  it("sin logo izquierdo la banda sigue siendo el bloque de rótulos", () => {
    expect(bandWidthFor(statement, 2, 0, 56)).toBe(388);
  });
});
