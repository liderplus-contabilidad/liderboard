import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHECK_LAYOUT,
  PICHINCHA_CHECK_LAYOUT,
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

  it("rejects overflow instead of changing the configured font or adding lines", () => {
    const narrow = resolveCheckLayout({ words: { x: 22, y: 34, width: 60 } });
    expect(() => placeCheck(ENI, narrow, measure)).toThrow("Monto en letras no cabe");
    expect(() =>
      placeCheck({ ...ENI, payee: "NOMBRE ".repeat(40) }, DEFAULT_CHECK_LAYOUT, measure),
    ).toThrow("Beneficiario no cabe");
  });

  it("rejects invalid dimensions and calibration outside the paper", () => {
    for (const width of [0, -1, NaN, Infinity]) {
      expect(() => placeCheck(ENI, { ...DEFAULT_CHECK_LAYOUT, width }, measure)).toThrow(
        "formato del banco",
      );
    }
    expect(() => placeCheck(ENI, { ...DEFAULT_CHECK_LAYOUT, offsetX: 100 }, measure)).toThrow(
      "fuera del cheque",
    );
  });

  it("draws the outline and a labelled box per field with guides", () => {
    const page = placeCheck(ENI, DEFAULT_CHECK_LAYOUT, measure, { guides: true });
    expect(page.rects).toHaveLength(5);
    expect(page.texts.map((text) => text.text)).toContain("BENEFICIARIO");
  });
});

describe("resolveCheckLayout", () => {
  it.each(["Pichincha", "BANCO PICHINCHA", "  Banco   Pichincha  ", "pichincha"])(
    "uses the supplied Pichincha format for %s",
    (bank) => {
      expect(resolveCheckLayout(undefined, bank)).toEqual(PICHINCHA_CHECK_LAYOUT);
      expect(resolveCheckLayout({}, bank)).toEqual(PICHINCHA_CHECK_LAYOUT);
    },
  );

  it.each(["Produbanco", "Banco Guayaquil", "", "Cooperativa Pichincha"])(
    "keeps the original default for %s",
    (bank) => expect(resolveCheckLayout(undefined, bank)).toEqual(DEFAULT_CHECK_LAYOUT),
  );

  it("preserves legacy customizations and resets to the named bank's default", () => {
    const stored = { width: 185, offsetX: 1.5, city: "Quito" };
    const resolved = resolveCheckLayout(stored, "Banco Pichincha");
    expect(resolved).toMatchObject({ ...stored, format: "standard" });
    expect(resolved.payee).toEqual(DEFAULT_CHECK_LAYOUT.payee);
    expect(resolveCheckLayout(undefined, "Banco Pichincha")).toEqual(PICHINCHA_CHECK_LAYOUT);
    expect(stored).toEqual({ width: 185, offsetX: 1.5, city: "Quito" });
  });

  it("keeps customized Pichincha coordinates, calibration and text format", () => {
    const stored = {
      format: "pichincha" as const,
      offsetX: 2,
      city: "Quito",
      payee: { x: 160 } as never,
    };
    const resolved = resolveCheckLayout(stored, "Pichincha");
    expect(resolved).toMatchObject({ format: "pichincha", offsetX: 2, city: "Quito" });
    expect(resolved.payee).toEqual({ ...PICHINCHA_CHECK_LAYOUT.payee, x: 160 });
    resolved.filler!.x = 1;
    expect(PICHINCHA_CHECK_LAYOUT.filler!.x).not.toBe(1);
  });

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
