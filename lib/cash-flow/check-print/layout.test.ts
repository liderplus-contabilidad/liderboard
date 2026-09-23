import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHECK_LAYOUT,
  checkAmountText,
  checkPlaceText,
  placeCheck,
  resolveCheckLayout,
} from "./layout";
import type { MeasureText } from "./types";

/** Helvetica-like: half an em per character. */
const measure: MeasureText = (text, size) => text.length * size * 0.5;

const ENI = { payee: "ENI ECUADOR S.A.", amount: 499.78, date: "2024-09-30" };

describe("placeCheck", () => {
  it("reproduces the real check's page and positions, in points", () => {
    const page = placeCheck(ENI, DEFAULT_CHECK_LAYOUT, measure);
    expect(page.width).toBeCloseTo(481.89, 1);
    expect(page.height).toBeCloseTo(215.43, 1);
    const byText = Object.fromEntries(page.texts.map((text) => [text.text, text]));
    // Baselines of the ENI ECUADOR sample: 36.85 · 70.87 · 96.38 · 130.39 pt.
    expect(byText["**499.78**"]).toMatchObject({ size: 10 });
    expect(byText["**499.78**"]?.x).toBeCloseTo(362.83, 1);
    expect(byText["**499.78**"]?.y).toBeCloseTo(36.85, 1);
    expect(byText["ENI ECUADOR S.A."]?.x).toBeCloseTo(96.38, 1);
    expect(byText["ENI ECUADOR S.A."]?.y).toBeCloseTo(70.87, 1);
    expect(byText["CUATROCIENTOS NOVENTA Y NUEVE CON 78/100 DÓLARES"]?.x).toBeCloseTo(62.36, 1);
    expect(byText["Quito, 30 de septiembre de 2024"]?.y).toBeCloseTo(130.39, 1);
    expect(page.rects).toHaveLength(0);
  });

  it("shifts every datum by the calibration and never the page", () => {
    const base = placeCheck(ENI, DEFAULT_CHECK_LAYOUT, measure);
    const shifted = placeCheck(ENI, { ...DEFAULT_CHECK_LAYOUT, offsetY: 2 }, measure);
    expect(shifted.height).toBe(base.height);
    shifted.texts.forEach((text, index) => {
      expect(text.y - (base.texts[index]?.y ?? 0)).toBeCloseTo((2 * 72) / 25.4, 5);
    });
  });

  it("shrinks a long datum and splits only the words in two lines", () => {
    const narrow = resolveCheckLayout({ words: { x: 22, y: 34, width: 60 } });
    const page = placeCheck({ ...ENI, amount: 777_777.77 }, narrow, measure);
    const words = page.texts.filter((text) => text.y >= 96);
    expect(words.length).toBeGreaterThanOrEqual(2);
    expect(
      words
        .slice(0, 2)
        .map((text) => text.text)
        .join(" "),
    ).toContain("SETECIENTOS");
  });

  it("draws the outline and a labelled box per field with guides", () => {
    const page = placeCheck(ENI, DEFAULT_CHECK_LAYOUT, measure, { guides: true });
    expect(page.rects).toHaveLength(5);
    expect(page.texts.map((text) => text.text)).toContain("BENEFICIARIO");
  });
});

describe("resolveCheckLayout", () => {
  it("completes a partial stored layout with the default, field by field", () => {
    const layout = resolveCheckLayout({ city: "Ambato", payee: { x: 40 } as never });
    expect(layout.city).toBe("Ambato");
    expect(layout.payee).toEqual({ x: 40, y: 25, width: 130 });
    expect(layout.amount).toEqual(DEFAULT_CHECK_LAYOUT.amount);
  });
});

describe("formats", () => {
  it("writes the amount between asterisks, without a symbol", () => {
    expect(checkAmountText(9200)).toBe("**9,200.00**");
    expect(checkAmountText(377.68)).toBe("**377.68**");
  });

  it("writes the place and the date in words", () => {
    expect(checkPlaceText("Quito", "2026-09-22")).toBe("Quito, 22 de septiembre de 2026");
    expect(checkPlaceText("", "2026-01-05")).toBe("5 de enero de 2026");
  });
});
