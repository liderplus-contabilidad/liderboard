import { describe, expect, it } from "vitest";
import { roundToCents } from "./round";

describe("roundToCents", () => {
  it("redondea a dos decimales", () => {
    expect(roundToCents(40.1666666)).toBe(40.17);
    expect(roundToCents(40.6008333)).toBe(40.6);
    expect(roundToCents(59.196015)).toBe(59.2);
  });

  it("deja intacto lo que ya tiene dos decimales o menos", () => {
    expect(roundToCents(487.21)).toBe(487.21);
    expect(roundToCents(30)).toBe(30);
    expect(roundToCents(0)).toBe(0);
  });

  // Es la razón de existir de esta función: `Math.round` redondea el medio hacia +∞, así que
  // un descuento mal tecleado en negativo se iría al alza y dejaría de cuadrar con el archivo.
  it("el medio se va hacia AFUERA del cero, como el ROUND de Excel — no hacia +∞", () => {
    expect(roundToCents(0.005)).toBe(0.01);
    expect(roundToCents(-0.005)).toBe(-0.01);
    expect(roundToCents(2.675)).toBe(2.68);
    expect(roundToCents(-2.675)).toBe(-2.68);
  });

  it("absorbe el error de representación binaria que arrastran las bases", () => {
    // 1.005 no es exactamente 1.005 en binario (es 1.00499999999999989…), así que un
    // `Math.round(x * 100) / 100` a secas devuelve 1.00 y el centavo se pierde.
    expect(roundToCents(1.005)).toBe(1.01);
    expect(roundToCents(8.475)).toBe(8.48);
  });

  it("preserva el cero con signo como cero llano", () => {
    expect(roundToCents(-0.001)).toBe(0);
    expect(Object.is(roundToCents(-0.001), -0)).toBe(false);
  });
});
