import { describe, expect, it } from "vitest";
import { findDateRange, toCalendarMonth, type DateRange } from "./date-range";

function range(
  fromDay: number,
  fromMonth: number,
  fromYear: number,
  toDay: number,
  toMonth: number,
  toYear: number,
): DateRange {
  return { fromDay, fromMonth, fromYear, toDay, toMonth, toYear };
}

describe("findDateRange", () => {
  it("reads day, month and year from both ends of the line", () => {
    const found = findDateRange([
      ["NOMIK HOTELS S.A.S."],
      ["Desde el 01/01/2026 hasta el 31/01/2026"],
    ]);
    expect(found).toEqual(range(1, 0, 2026, 31, 0, 2026));
  });

  it("returns null when no row carries the range line", () => {
    expect(findDateRange([["NOMIK HOTELS S.A.S."], ["Estado de Resultados"]])).toBeNull();
  });
});

describe("toCalendarMonth — mes exacto", () => {
  it("resuelve un mes calendario completo", () => {
    expect(toCalendarMonth(range(1, 0, 2026, 31, 0, 2026))).toEqual({
      ok: true,
      year: 2026,
      month: 0,
    });
  });
});

describe("toCalendarMonth — febrero", () => {
  it("acepta el 28 de febrero de un año no bisiesto", () => {
    expect(toCalendarMonth(range(1, 1, 2026, 28, 1, 2026))).toEqual({
      ok: true,
      year: 2026,
      month: 1,
    });
  });

  it("acepta el 29 de febrero de un año bisiesto", () => {
    expect(toCalendarMonth(range(1, 1, 2028, 29, 1, 2028))).toEqual({
      ok: true,
      year: 2028,
      month: 1,
    });
  });

  it("rechaza un febrero bisiesto cortado el 28", () => {
    const outcome = toCalendarMonth(range(1, 1, 2028, 28, 1, 2028));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("incomplete-month");
      expect(outcome.message).toContain("febrero");
    }
  });
});

describe("toCalendarMonth — acumulado del año", () => {
  it("rechaza un rango de varios meses nombrando cuántos abarca", () => {
    const outcome = toCalendarMonth(range(1, 0, 2026, 30, 5, 2026));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("multi-month");
      expect(outcome.message).toContain("6 meses");
    }
  });
});

describe("toCalendarMonth — mes parcial", () => {
  it("rechaza un rango que no cubre el mes completo", () => {
    const outcome = toCalendarMonth(range(1, 0, 2026, 15, 0, 2026));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("incomplete-month");
      expect(outcome.message).toContain("enero");
    }
  });
});

describe("toCalendarMonth — rango cruzado sin empezar en día 1", () => {
  it("rechaza nombrando que debe empezar el día 1, incluso cruzando de mes", () => {
    const outcome = toCalendarMonth(range(15, 0, 2026, 14, 1, 2026));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("not-first-day");
    }
  });
});
