import { describe, expect, it } from "vitest";
import { DEDUCTION_CONCEPTS, INCOME_CONCEPTS } from "./concepts";
import { emptyCapture } from "./employee-input";
import {
  isRenameable,
  labelFor,
  payslipLabelFor,
  rowLabelUniverse,
  validateRowLabel,
  withRowLabel,
  withoutRowLabel,
} from "./row-labels";
import type { PayrollMonthlyCapture } from "./types";

const conceptByCode = (code: string) =>
  [...INCOME_CONCEPTS, ...DEDUCTION_CONCEPTS].find((concept) => concept.code === code)!;

const OTROS = conceptByCode("E-11");
const BONO = conceptByCode("I-13");
const SUELDO = conceptByCode("I-01");
const EXTRAS_50 = conceptByCode("I-02");

function captureWith(overrides: Partial<PayrollMonthlyCapture>): PayrollMonthlyCapture {
  return { ...emptyCapture(), ...overrides };
}

describe("isRenameable", () => {
  it("admite las filas cuyo importe se teclea", () => {
    expect(isRenameable(OTROS)).toBe(true);
    expect(isRenameable(BONO)).toBe(true);
  });

  it("rechaza lo que la app deriva entera", () => {
    expect(isRenameable(SUELDO)).toBe(false);
  });

  it("rechaza las horas extras, aunque capturen su cantidad", () => {
    // Su rótulo es una tasa de ley: renombrar `50%` como `100%` mentiría sobre un cálculo que
    // sigue siendo al 50 %, y ninguna cifra lo delataría.
    expect(isRenameable(EXTRAS_50)).toBe(false);
  });
});

describe("labelFor / payslipLabelFor", () => {
  it("sin rótulo propio manda el libro, en pantalla y en papel", () => {
    const capture = emptyCapture();
    expect(labelFor(OTROS, capture)).toBe("Otros");
    expect(payslipLabelFor(OTROS, capture)).toBe("OTROS");
  });

  it("un rótulo propio pisa LOS DOS, y en papel va en mayúsculas", () => {
    const capture = captureWith({ labels: { "E-11": "Uniformes" } });
    expect(labelFor(OTROS, capture)).toBe("Uniformes");
    expect(payslipLabelFor(OTROS, capture)).toBe("UNIFORMES");
  });

  it("un rótulo en blanco no cuenta como rótulo", () => {
    const capture = captureWith({ labels: { "E-11": "   " } });
    expect(labelFor(OTROS, capture)).toBe("Otros");
  });

  it("una fila calculada ignora cualquier rótulo guardado", () => {
    const capture = captureWith({ labels: { "I-01": "Base" } });
    expect(labelFor(SUELDO, capture)).toBe("Sueldo unificado");
    expect(payslipLabelFor(SUELDO, capture)).toBe("SUELDO UNIFICADO");
  });

  it("el rótulo de un empleado no alcanza a otra fila", () => {
    const capture = captureWith({ labels: { "E-11": "Uniformes" } });
    expect(labelFor(conceptByCode("E-08"), capture)).toBe("Multas");
  });
});

describe("rowLabelUniverse", () => {
  it("junta los rótulos efectivos del catálogo con los de las filas de bono", () => {
    const capture = captureWith({
      labels: { "E-11": "Uniformes" },
      extras: [{ id: "x1", label: "Movilización", kind: "noAportable", amount: 50 }],
    });
    expect(rowLabelUniverse(capture, [OTROS, conceptByCode("E-08")])).toEqual([
      { key: "E-11", label: "Uniformes" },
      { key: "E-08", label: "Multas" },
      { key: "x1", label: "Movilización" },
    ]);
  });
});

describe("validateRowLabel", () => {
  const taken = [
    { key: "E-11", label: "Uniformes" },
    { key: "x1", label: "Movilización" },
  ];

  it("rechaza un nombre repetido ignorando mayúsculas y acentos", () => {
    const result = validateRowLabel("MOVILIZACION", taken);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("Movilización");
  });

  it("no choca consigo mismo al renombrar", () => {
    expect(validateRowLabel("Uniformes", taken, "E-11").ok).toBe(true);
  });

  it("rechaza el vacío", () => {
    expect(validateRowLabel("   ", taken).ok).toBe(false);
  });

  it("rechaza por encima del tope de la app", () => {
    expect(validateRowLabel("x".repeat(61), taken).ok).toBe(false);
  });

  it("acepta un nombre libre", () => {
    const result = validateRowLabel("  Rotura   de vajilla ", taken);
    expect(result.ok && result.name).toBe("Rotura de vajilla");
  });
});

describe("withRowLabel / withoutRowLabel", () => {
  it("guarda el nombre normalizado", () => {
    expect(withRowLabel(undefined, "E-11", "  Uniformes  ")).toEqual({ "E-11": "Uniformes" });
  });

  it("un nombre vacío BORRA la entrada en vez de guardarla vacía", () => {
    expect(withRowLabel({ "E-11": "Uniformes" }, "E-11", "  ")).toEqual({});
  });

  it("quitar la fila se lleva su rótulo y no toca los demás", () => {
    expect(withoutRowLabel({ "E-11": "Uniformes", "E-08": "Atrasos" }, "E-11")).toEqual({
      "E-08": "Atrasos",
    });
  });
});
