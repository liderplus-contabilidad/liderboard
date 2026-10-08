import { describe, expect, it } from "vitest";
import { formatDateDraft, parseDateInput } from "./date-input";

describe("parseDateInput", () => {
  it("reads a typed Ecuadorian date and a pasted ISO date without shifting the day", () => {
    expect(parseDateInput(" 1/10/2026 ")).toBe("2026-10-01");
    expect(parseDateInput("2026-10-01")).toBe("2026-10-01");
  });

  it("rejects impossible dates rather than rolling them into another month", () => {
    for (const text of ["31/02/2026", "31/04/2026", "00/10/2026", "01/13/2026", "2026-02-29"]) {
      expect(parseDateInput(text)).toBeNull();
    }
  });

  it("observes leap years, including the century rule", () => {
    expect(parseDateInput("29/02/2028")).toBe("2028-02-29");
    expect(parseDateInput("29/02/2000")).toBe("2000-02-29");
    expect(parseDateInput("29/02/2100")).toBeNull();
  });

  it("leaves blank, incomplete and ambiguous dates unset", () => {
    for (const text of ["", " ", "01/10", "01/10/26", "tomorrow"]) {
      expect(parseDateInput(text)).toBeNull();
    }
  });
});

describe("formatDateDraft", () => {
  it("inserts separators as day, month and year are typed", () => {
    const stages = ["1", "15", "15/1", "15/10", "15/10/2", "15/10/20", "15/10/202", "15/10/2026"];
    stages.forEach((expected, index) => {
      expect(formatDateDraft("15102026".slice(0, index + 1))).toBe(expected);
    });
    expect(parseDateInput(formatDateDraft("15102026"))).toBe("2026-10-15");
  });

  it("preserves partial input while deleting or entering separators by hand", () => {
    for (const text of ["", "1/", "1/1", "15/10/", "15/10/20", "15/1"]) {
      expect(formatDateDraft(text)).toBe(text);
    }
    expect(formatDateDraft("15/102")).toBe("15/10/2");
  });

  it("normalizes pasted dates and keeps impossible dates available for correction", () => {
    expect(formatDateDraft("1/10/2026")).toBe("01/10/2026");
    expect(formatDateDraft("2026-10-15")).toBe("15/10/2026");
    expect(formatDateDraft("1245124")).toBe("12/45/124");
    expect(formatDateDraft("31022026")).toBe("31/02/2026");
    expect(parseDateInput(formatDateDraft("31022026"))).toBeNull();
  });
});
