import { describe, expect, it } from "vitest";
import {
  loadedIndicesOf,
  readRevenueYear,
  readRevenueYears,
  referenceYearOf,
  scopeToMonths,
  sumOf,
} from "./derive";
import {
  ALL_MONTHS,
  loadedYears,
  REVENUE_2022,
  REVENUE_2023,
  REVENUE_2024,
  REVENUE_2026,
  yearInput,
} from "./fixtures";
import { emptyMonthSeries } from "./types";

/** Two cents is the tolerance of a figure the firm checks against its own workbook. */
const cents = (value: number) => Math.round(value * 100) / 100;

describe("readRevenueYear", () => {
  it("lee el ingreso mensual de cada año cargado", () => {
    const readings = readRevenueYears(loadedYears(), ALL_MONTHS);

    expect(readings.map((entry) => entry.year)).toEqual([2022, 2023, 2024, 2026]);
    expect(cents(readings[0].total)).toBe(1577661.25);
    expect(cents(readings[1].total)).toBe(1608278.86);
    expect(cents(readings[2].total)).toBe(1915467.9);
    expect(cents(readings[3].total)).toBe(1683720.41);
  });

  it("un año completo cubre los doce meses y uno en curso solo los suyos", () => {
    const full = readRevenueYear(yearInput(2024, REVENUE_2024), ALL_MONTHS);
    const partial = readRevenueYear(yearInput(2026, REVENUE_2026), ALL_MONTHS);

    expect(full.loadedMonths).toHaveLength(12);
    // Ene–Jul: agosto a diciembre nunca llegaron.
    expect(partial.loadedMonths).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(partial.monthly.slice(7)).toEqual([null, null, null, null, null]);
  });

  it("un año sin ningún mes cargado devuelve null en los doce y no está cubierto", () => {
    // 2025 en el archivo real: su columna entera es `#REF!`, que no es un año en cero.
    const absent = readRevenueYear(yearInput(2025, emptyMonthSeries()), ALL_MONTHS);

    expect(absent.monthly).toEqual(Array.from({ length: 12 }, () => null));
    expect(absent.loadedMonths).toEqual([]);
    expect(absent.total).toBe(0);
    expect(absent.average).toBeNull();
    expect(absent.best).toBeNull();
    expect(absent.covered).toBe(false);
  });

  it("el promedio divide entre los meses CARGADOS, no entre doce", () => {
    const reading = readRevenueYear(yearInput(2026, REVENUE_2026), ALL_MONTHS);

    // $1,683,720.41 sobre SIETE meses. El Excel escribe $240,312.73 dividiendo entre otra cosa, y la
    // diferencia no es un redondeo.
    expect(cents(reading.average as number)).toBe(240531.49);
    expect(cents(reading.average as number)).not.toBe(240312.73);
  });

  it("el promedio de un año completo divide entre doce porque doce son los cargados", () => {
    const readings = readRevenueYears(loadedYears(), ALL_MONTHS);

    expect(cents(readings[0].average as number)).toBe(131471.77);
    expect(cents(readings[1].average as number)).toBe(134023.24);
    // 2024 cae EXACTAMENTE en medio centavo: $1,915,467.90 / 12 = $159,622.325. Se compara contra el
    // valor sin redondear —el que la función devuelve— y no contra los $159,622.33 que la pantalla
    // escribe: redondear aquí solo probaría el desempate del helper del test.
    expect(readings[2].average as number).toBeCloseTo(159622.325, 6);
  });

  it("el mejor mes es el mayor de los cargados", () => {
    const reading = readRevenueYear(yearInput(2026, REVENUE_2026), ALL_MONTHS);

    expect(reading.best).toEqual({ monthIndex: 3, amount: 337092.91 });
  });

  it("un empate se resuelve al mes más temprano", () => {
    const tied = readRevenueYear(
      yearInput(2030, [100, 100, null, null, null, null, null, null, null, null, null, null]),
      ALL_MONTHS,
    );

    expect(tied.best?.monthIndex).toBe(0);
  });
});

describe("scopeToMonths", () => {
  it("un mes fuera del tramo se lee como uno nunca cargado", () => {
    const scoped = scopeToMonths(REVENUE_2024, [0, 1, 2]);

    expect(loadedIndicesOf(scoped)).toEqual([0, 1, 2]);
    expect(scoped[3]).toBeNull();
    // Ene+Feb+Mar de 2024.
    expect(cents(sumOf(scoped))).toBe(396620.68);
  });

  it("acotar a un mes deja ese único mes en pie", () => {
    const scoped = scopeToMonths(REVENUE_2022, [6]);

    expect(loadedIndicesOf(scoped)).toEqual([6]);
    expect(scoped[6]).toBe(157486.35);
  });

  it("el tramo no inventa datos donde el año no los tiene", () => {
    // Se pide diciembre a un año que llega hasta julio: sigue sin haber diciembre.
    const scoped = scopeToMonths(REVENUE_2026, [11]);

    expect(loadedIndicesOf(scoped)).toEqual([]);
  });
});

describe("referenceYearOf", () => {
  it("la referencia es el año más reciente de los marcados", () => {
    const readings = readRevenueYears(loadedYears(), ALL_MONTHS);

    expect(referenceYearOf(readings)?.year).toBe(2026);
  });

  it("sin años marcados no hay referencia", () => {
    expect(referenceYearOf([])).toBeNull();
  });

  it("no la decide el orden en que llegan los años", () => {
    const shuffled = readRevenueYears(
      [yearInput(2026, REVENUE_2026), yearInput(2022, REVENUE_2022), yearInput(2023, REVENUE_2023)],
      ALL_MONTHS,
    );

    expect(referenceYearOf(shuffled)?.year).toBe(2026);
  });
});
