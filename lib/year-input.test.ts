import { describe, expect, it } from "vitest";
import { MIN_CAPTURE_YEAR, maxCaptureYear, parseYearInput } from "./year-input";

const MAX = 2027;

describe("maxCaptureYear", () => {
  it("reaches one year past the current one, for a budget loaded early", () => {
    expect(maxCaptureYear(new Date("2026-09-05T00:00:00Z"))).toBe(2027);
  });
});

describe("parseYearInput", () => {
  it("accepts a plain four-digit year", () => {
    expect(parseYearInput("2024", MAX)).toEqual({ ok: true, year: 2024 });
  });

  it("ignores surrounding whitespace", () => {
    expect(parseYearInput("  2024 ", MAX)).toEqual({ ok: true, year: 2024 });
  });

  it("accepts both ends of the range", () => {
    expect(parseYearInput(String(MIN_CAPTURE_YEAR), MAX)).toEqual({
      ok: true,
      year: MIN_CAPTURE_YEAR,
    });
    expect(parseYearInput(String(MAX), MAX)).toEqual({ ok: true, year: MAX });
  });

  it("refuses an empty field", () => {
    expect(parseYearInput("   ", MAX)).toEqual({ ok: false, message: "Escribe un año." });
  });

  it("refuses anything that is not four digits", () => {
    for (const raw of ["24", "20244", "2O24", "20.4", "-2024", "dos mil"]) {
      const result = parseYearInput(raw, MAX);
      expect(result.ok, raw).toBe(false);
    }
  });

  it("refuses a year outside the range, and says the range", () => {
    expect(parseYearInput("1999", MAX)).toEqual({
      ok: false,
      message: "Solo años entre 2000 y 2027.",
    });
    expect(parseYearInput("2028", MAX)).toEqual({
      ok: false,
      message: "Solo años entre 2000 y 2027.",
    });
  });
});
