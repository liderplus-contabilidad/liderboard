import { describe, expect, it } from "vitest";
import { evaluateAmount } from "./calc";
import { parseCurrency } from "./format";

/** Unwraps a result the test expects to succeed, failing loudly with the error otherwise. */
function value(input: string): number {
  const result = evaluateAmount(input);
  if (!result.ok) {
    throw new Error(`«${input}» debió evaluar, dio: ${result.error}`);
  }
  return result.value;
}

/** The error message of a result the test expects to fail. */
function error(input: string): string {
  const result = evaluateAmount(input);
  if (result.ok) {
    throw new Error(`«${input}» debió fallar, dio: ${result.value}`);
  }
  return result.error;
}

describe("evaluateAmount", () => {
  it("adds, subtracts, multiplies and divides", () => {
    expect(value("=5+5")).toBe(10);
    expect(value("=1200*12")).toBe(14400);
    expect(value("=1200-300")).toBe(900);
    expect(value("=1000/4")).toBe(250);
  });

  it("takes the `=` as optional", () => {
    expect(value("5+5")).toBe(10);
    expect(value("= 5 + 5")).toBe(10);
  });

  it("applies the usual precedence and parentheses", () => {
    expect(value("=2+3*4")).toBe(14);
    expect(value("=(2+3)*4")).toBe(20);
    expect(value("=(500+300)/2")).toBe(400);
    expect(value("=((1+2)*(3+4))")).toBe(21);
  });

  it("understands a unary sign", () => {
    expect(value("-500")).toBe(-500);
    expect(value("=-500+100")).toBe(-400);
    expect(value("=10*-2")).toBe(-20);
    expect(value("=--5")).toBe(5);
  });

  it("ignores whitespace anywhere", () => {
    expect(value("  =  1,000  +  250.50  ")).toBe(1250.5);
  });

  describe("numbers inside a formula follow the same rule as a written amount", () => {
    it("reads the comma as thousands and the dot as cents", () => {
      expect(value("=17,338.85+100")).toBe(17438.85);
      expect(value("=1,234,567.89")).toBe(1234567.89);
    });

    it("rejects the inverted convention instead of silently dividing by a thousand", () => {
      // The trap `parseCurrency` exists to stop: 17.338,85 must never read as 17.33885.
      expect(error("=17.338,85+100")).toMatch(/coma/i);
      expect(error("=1,5+2")).toMatch(/coma/i);
    });

    it("agrees with parseCurrency on a plainly written amount", () => {
      for (const written of ["17,338.85", "1,234", "80.75", "-20.4", "0"]) {
        expect(value(written)).toBe(parseCurrency(written));
      }
    });
  });

  describe("money rounding", () => {
    it("settles floating point at the cent", () => {
      expect(value("=0.1+0.2")).toBe(0.3);
    });

    it("keeps no fraction of a cent", () => {
      expect(value("=1000/3")).toBe(333.33);
      expect(value("=10/3")).toBe(3.33);
    });

    it("never yields a negative zero", () => {
      expect(Object.is(value("=0.001-0.002"), 0)).toBe(true);
    });
  });

  describe("flags a formula apart from a written amount", () => {
    it("counts an operation as a formula", () => {
      expect(evaluateAmount("=5+5")).toMatchObject({ isFormula: true });
      expect(evaluateAmount("5+5")).toMatchObject({ isFormula: true });
    });

    it("counts a plain amount as no formula, signed or not", () => {
      expect(evaluateAmount("1,234.56")).toMatchObject({ isFormula: false });
      expect(evaluateAmount("-500")).toMatchObject({ isFormula: false });
    });

    it("counts a leading `=` as a formula even over a lone number", () => {
      expect(evaluateAmount("=500")).toMatchObject({ isFormula: true, value: 500 });
    });
  });

  describe("errors say what happened", () => {
    it("refuses to divide by zero rather than yielding Infinity", () => {
      expect(error("=5/0")).toMatch(/dividir entre cero/i);
      expect(error("=5/(3-3)")).toMatch(/dividir entre cero/i);
    });

    it("names an unclosed parenthesis", () => {
      expect(error("=(5+5")).toMatch(/paréntesis/i);
      expect(error("=5+5)")).toMatch(/paréntesis/i);
    });

    it("names an incomplete operation", () => {
      expect(error("=5+")).toMatch(/incompleta/i);
      expect(error("=*5")).toMatch(/número/i);
    });

    it("names two numbers with no operator between them", () => {
      expect(error("=5 5")).toMatch(/operador/i);
    });

    it("rejects anything that is not arithmetic", () => {
      expect(error("abc")).toBeTruthy();
      expect(error("=SUMA(1,2)")).toBeTruthy();
      expect(error("=1000*15%")).toBeTruthy();
    });

    it("rejects an empty field", () => {
      expect(error("")).toBeTruthy();
      expect(error("   ")).toBeTruthy();
      expect(error("=")).toBeTruthy();
    });
  });
});
