import { describe, expect, it } from "vitest";
import { scopeToMonths } from "./derive";
import { ALL_MONTHS, EXTERNAL_2026, REVENUE_2026 } from "./fixtures";
import { readRatio, shareOf } from "./ratio";

const cents = (value: number) => Math.round(value * 100) / 100;
const points = (value: number) => Math.round(value * 10) / 10;

describe("readRatio · la participación de los cobros con tarjeta", () => {
  const reading = readRatio(EXTERNAL_2026.cardRevenue, REVENUE_2026);

  it("solo usa los meses donde existen sus DOS términos", () => {
    // Julio tiene venta ($241,844.03) y ningún cobro registrado: queda fuera de los dos totales.
    expect(reading.sharedMonths).toEqual([0, 1, 2, 3, 4, 5]);
    expect(reading.missingMonths).toEqual([6]);
  });

  it("da 18.0 % sobre Ene–Jun, no el 15.4 % del Excel", () => {
    expect(cents(reading.numeratorTotal)).toBe(259028.58);
    expect(cents(reading.denominatorTotal)).toBe(1441876.38);
    expect(points(reading.percent as number)).toBe(18.0);
    // Lo que sale de dividir seis meses de tarjeta entre SIETE de venta.
    expect(points(reading.percent as number)).not.toBe(15.4);
  });

  it("el denominador NO incluye la venta de julio", () => {
    expect(cents(reading.denominatorTotal)).not.toBe(1683720.41);
  });

  it("un mes sin numerador no cuenta como cero", () => {
    expect(reading.points[6].denominator).toBe(241844.03);
    expect(reading.points[6].numerator).toBeNull();
    expect(reading.points[6].percent).toBeNull();
  });
});

describe("readRatio · la comisión sobre los cobros", () => {
  const reading = readRatio(EXTERNAL_2026.cardFees, EXTERNAL_2026.cardRevenue);

  it("da 5.0 %", () => {
    expect(cents(reading.numeratorTotal)).toBe(12928.05);
    expect(cents(reading.denominatorTotal)).toBe(259028.58);
    expect(points(reading.percent as number)).toBe(5.0);
  });

  it("coincide con el Excel porque sus dos términos cubren los mismos meses", () => {
    // Es el caso que demuestra que el defecto del libro está en el TRAMO y no en la aritmética.
    expect(reading.sharedMonths).toEqual([0, 1, 2, 3, 4, 5]);
    expect(reading.missingMonths).toEqual([]);
  });
});

describe("readRatio · la pauta sobre las ventas", () => {
  const reading = readRatio(EXTERNAL_2026.adSpend, REVENUE_2026);

  it("da 3.0 % sobre Ene–Jun, no el 2.53 % del Excel", () => {
    expect(cents(reading.numeratorTotal)).toBe(42608.16);
    expect(cents(reading.denominatorTotal)).toBe(1441876.38);
    expect(points(reading.percent as number)).toBe(3.0);
    expect(points(reading.percent as number)).not.toBe(2.5);
  });
});

describe("readRatio · el tramo marcado", () => {
  it("marcar meses acota los dos términos a la vez", () => {
    const span = [0, 1, 2];
    const reading = readRatio(
      scopeToMonths(EXTERNAL_2026.cardRevenue, span),
      scopeToMonths(REVENUE_2026, span),
    );

    expect(reading.sharedMonths).toEqual(span);
    expect(cents(reading.numeratorTotal)).toBe(113921.42);
    expect(cents(reading.denominatorTotal)).toBe(692433.66);
    expect(points(reading.percent as number)).toBe(16.5);
  });

  it("un tramo sin ningún mes compartido no declara porcentaje", () => {
    const reading = readRatio(
      scopeToMonths(EXTERNAL_2026.cardRevenue, [6]),
      scopeToMonths(REVENUE_2026, [6]),
    );

    expect(reading.sharedMonths).toEqual([]);
    expect(reading.percent).toBeNull();
    // Y sigue sabiendo nombrar el mes que falta registrar.
    expect(reading.missingMonths).toEqual([6]);
  });

  it("sin nada capturado no hay participación y todo el periodo está pendiente", () => {
    const reading = readRatio(
      Array.from({ length: 12 }, () => null),
      scopeToMonths(REVENUE_2026, ALL_MONTHS),
    );

    expect(reading.percent).toBeNull();
    expect(reading.missingMonths).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe("shareOf", () => {
  it("un denominador en cero es indefinido, no infinito", () => {
    expect(shareOf(10, 0)).toBeNull();
  });

  it("un término ausente no se lee como cero", () => {
    expect(shareOf(null, 100)).toBeNull();
    expect(shareOf(10, null)).toBeNull();
  });

  it("devuelve puntos y no una fracción", () => {
    expect(shareOf(18, 100)).toBe(18);
  });

  it("un numerador en cero sí es un cero real", () => {
    expect(shareOf(0, 100)).toBe(0);
  });
});
