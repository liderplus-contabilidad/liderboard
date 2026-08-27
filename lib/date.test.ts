import { describe, expect, it } from "vitest";
import { formatDayMonthYear, formatTimestampEs, monthBounds } from "./date";

describe("formatDayMonthYear", () => {
  it("escribe una fecha ISO como DD/MM/AAAA", () => {
    expect(formatDayMonthYear("2025-10-07")).toBe("07/10/2025");
    expect(formatDayMonthYear("2026-03-31")).toBe("31/03/2026");
  });

  it("rellena con cero el día y el mes de un solo dígito", () => {
    expect(formatDayMonthYear("2026-01-05")).toBe("05/01/2026");
  });

  it("null es null: una ficha sin fecha no inventa una", () => {
    expect(formatDayMonthYear(null)).toBeNull();
  });

  it("una fecha ilegible tampoco inventa nada", () => {
    // The parser already leaves `null` when it cannot read the hire date, but old or hand-typed data
    // can arrive broken and a screen must not paint «NaN/NaN/NaN».
    expect(formatDayMonthYear("no es una fecha")).toBeNull();
    expect(formatDayMonthYear("")).toBeNull();
  });

  it("no se corre de día por zona horaria", () => {
    // Read as a LOCAL date, `2026-03-01` in a time zone west of UTC goes back to 28 February. A rol
    // for a month starting the day before would be a hard error to spot.
    expect(formatDayMonthYear("2026-03-01")).toBe("01/03/2026");
    expect(formatDayMonthYear("2026-01-01")).toBe("01/01/2026");
  });
});

describe("monthBounds", () => {
  it("da el primer y el último día del mes", () => {
    expect(monthBounds(2026, 2)).toEqual({ start: "01/03/2026", end: "31/03/2026" });
  });

  it("acierta los meses de 30 días", () => {
    expect(monthBounds(2026, 3)).toEqual({ start: "01/04/2026", end: "30/04/2026" });
  });

  it("febrero de un año normal cierra el 28", () => {
    expect(monthBounds(2026, 1)).toEqual({ start: "01/02/2026", end: "28/02/2026" });
  });

  it("febrero de un año bisiesto cierra el 29", () => {
    expect(monthBounds(2024, 1)).toEqual({ start: "01/02/2024", end: "29/02/2024" });
  });

  it("diciembre no se desborda al año siguiente", () => {
    expect(monthBounds(2026, 11)).toEqual({ start: "01/12/2026", end: "31/12/2026" });
  });
});

describe("formatTimestampEs", () => {
  it("escribe día, mes en letras y hora, la lectura que coteja el contador", () => {
    expect(formatTimestampEs(new Date(2026, 6, 30, 14, 22))).toBe("30 de julio de 2026, 14:22");
  });

  it("rellena con cero la hora y el minuto de un solo dígito", () => {
    expect(formatTimestampEs(new Date(2026, 0, 5, 9, 5))).toBe("5 de enero de 2026, 09:05");
  });
});
