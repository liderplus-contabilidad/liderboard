import { describe, expect, it } from "vitest";
import {
  hasPeriod,
  matchesSearch,
  periodKindLabel,
  periodLongLabel,
  periodShortLabel,
  proposeNextPeriod,
  sortPeriodsDesc,
} from "./periods";

describe("periodLongLabel / periodShortLabel", () => {
  it("escribe el mes largo en mayúsculas", () => {
    expect(periodLongLabel(2026, 5)).toBe("JUNIO 2026");
  });

  it("escribe el mes corto en mayúsculas", () => {
    expect(periodShortLabel(2026, 5)).toBe("JUN 2026");
  });

  it("enero es el índice 0", () => {
    expect(periodLongLabel(2026, 0)).toBe("ENERO 2026");
  });
});

describe("periodKindLabel", () => {
  it("nombra el único tipo que existe por ahora", () => {
    expect(periodKindLabel("ordinario")).toBe("Ordinario");
  });
});

describe("sortPeriodsDesc", () => {
  it("ordena por año y luego por mes, más reciente primero", () => {
    const periods = [
      { year: 2025, monthIndex: 11 },
      { year: 2026, monthIndex: 2 },
      { year: 2026, monthIndex: 5 },
    ];
    expect(sortPeriodsDesc(periods)).toEqual([
      { year: 2026, monthIndex: 5 },
      { year: 2026, monthIndex: 2 },
      { year: 2025, monthIndex: 11 },
    ]);
  });

  it("no muta la lista que recibe", () => {
    const periods = [
      { year: 2025, monthIndex: 0 },
      { year: 2026, monthIndex: 0 },
    ];
    sortPeriodsDesc(periods);
    expect(periods[0].year).toBe(2025);
  });
});

describe("matchesSearch", () => {
  it("compara contra la etiqueta larga, ignorando mayúsculas y acentos", () => {
    expect(matchesSearch({ year: 2026, monthIndex: 5 }, "junio")).toBe(true);
    expect(matchesSearch({ year: 2026, monthIndex: 5 }, "JUNIO 2026")).toBe(true);
  });

  it("un texto vacío no filtra nada", () => {
    expect(matchesSearch({ year: 2026, monthIndex: 5 }, "")).toBe(true);
  });

  it("descarta lo que no contiene el texto", () => {
    expect(matchesSearch({ year: 2026, monthIndex: 5 }, "marzo")).toBe(false);
  });
});

describe("hasPeriod", () => {
  const existing = [
    { year: 2026, monthIndex: 2 },
    { year: 2026, monthIndex: 5 },
  ];

  it("encuentra un período ya registrado", () => {
    expect(hasPeriod(existing, 2026, 2)).toBe(true);
  });

  it("no confunde el mismo mes de otro año", () => {
    expect(hasPeriod(existing, 2025, 2)).toBe(false);
  });

  it("no confunde otro mes del mismo año", () => {
    expect(hasPeriod(existing, 2026, 3)).toBe(false);
  });
});

describe("proposeNextPeriod", () => {
  it("con ningún período previo, propone el mes de HOY", () => {
    expect(proposeNextPeriod([], new Date(2026, 4, 15))).toEqual({ year: 2026, monthIndex: 4 });
  });

  it("propone el mes siguiente al más reciente", () => {
    const existing = [
      { year: 2026, monthIndex: 2 },
      { year: 2026, monthIndex: 4 },
    ];
    expect(proposeNextPeriod(existing, new Date(2026, 4, 15))).toEqual({
      year: 2026,
      monthIndex: 5,
    });
  });

  it("diciembre pasa al año siguiente", () => {
    const existing = [{ year: 2026, monthIndex: 11 }];
    expect(proposeNextPeriod(existing, new Date(2026, 11, 20))).toEqual({
      year: 2027,
      monthIndex: 0,
    });
  });

  it("nunca usa la fecha del sistema: `today` siempre llega por parámetro", () => {
    // Dos llamadas con `today` distinto y el mismo `existing` dan resultados distintos — si esto
    // leyera `Date.now()` por dentro, el test no podría distinguirlo.
    const existing = [{ year: 2026, monthIndex: 2 }];
    expect(proposeNextPeriod(existing, new Date(2020, 0, 1))).toEqual({
      year: 2026,
      monthIndex: 3,
    });
  });
});
