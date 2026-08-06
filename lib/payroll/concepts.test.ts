import { describe, expect, it } from "vitest";
import {
  DEDUCTION_CONCEPTS,
  INCOME_CONCEPTS,
  addableDeductionConcepts,
  addableIncomeConcepts,
  swapOptionsFor,
  visibleDeductionConcepts,
  visibleIncomeConcepts,
} from "./concepts";
import { emptyCapture } from "./employee-input";

const codes = (concepts: readonly { code: string }[]) => concepts.map((c) => c.code);

describe("el catálogo cubre el libro entero", () => {
  it("13 ingresos y 13 egresos, sin códigos ni columnas repetidos", () => {
    expect(INCOME_CONCEPTS).toHaveLength(13);
    expect(DEDUCTION_CONCEPTS).toHaveLength(13);

    const all = [...INCOME_CONCEPTS, ...DEDUCTION_CONCEPTS];
    expect(new Set(all.map((c) => c.code)).size).toBe(26);
    expect(new Set(all.map((c) => c.column)).size).toBe(26);
  });

  it("los códigos van correlativos y en el orden del libro", () => {
    expect(codes(INCOME_CONCEPTS)).toEqual(
      Array.from({ length: 13 }, (_, i) => `I-${String(i + 1).padStart(2, "0")}`),
    );
    expect(codes(DEDUCTION_CONCEPTS)).toEqual(
      Array.from({ length: 13 }, (_, i) => `E-${String(i + 1).padStart(2, "0")}`),
    );
  });

  it("solo las tres clases de hora extra declaran una columna de cantidad", () => {
    const withHours = INCOME_CONCEPTS.filter((c) => c.kind === "calculado" && c.hoursField);
    expect(codes(withHours)).toEqual(["I-02", "I-03", "I-04"]);
  });
});

describe("qué conceptos se ven", () => {
  it("sin nada capturado se ven los calculados y NADA más", () => {
    // Es la pantalla de un empleado recién copiado: su sueldo, sus horas extras en blanco, sus
    // dos décimos, su fondo de reserva y su aporte al IESS. Listar los 26 conceptos con
    // dieciocho rayas convertiría la tabla en un formulario en blanco.
    expect(codes(visibleIncomeConcepts(emptyCapture(), new Set()))).toEqual([
      "I-01",
      "I-02",
      "I-03",
      "I-04",
      "I-05",
      "I-06",
      "I-07",
    ]);
    expect(codes(visibleDeductionConcepts(emptyCapture(), new Set()))).toEqual(["E-01"]);
  });

  it("un capturado con valor aparece solo, sin que nadie lo añada", () => {
    // Es lo que hace que un rol cargado desde Excel se vea completo: los conceptos que el
    // archivo trae con importe se muestran porque lo traen.
    const capture = { ...emptyCapture(), allowances: 120 };
    expect(codes(visibleIncomeConcepts(capture, new Set()))).toContain("I-10");
  });

  it("un capturado en cero NO aparece, aunque venga del archivo", () => {
    expect(
      codes(visibleIncomeConcepts({ ...emptyCapture(), allowances: 0 }, new Set())),
    ).not.toContain("I-10");
  });

  it("un capturado añadido a mano aparece aunque valga cero — si no, se borraría al teclearlo", () => {
    const visible = visibleIncomeConcepts(emptyCapture(), new Set(["I-11"]));
    expect(codes(visible)).toContain("I-11");
  });

  it("conserva SIEMPRE el orden del libro, se añada en el orden que se añada", () => {
    const visible = visibleIncomeConcepts(emptyCapture(), new Set(["I-13", "I-08"]));
    expect(codes(visible)).toEqual([
      "I-01",
      "I-02",
      "I-03",
      "I-04",
      "I-05",
      "I-06",
      "I-07",
      "I-08",
      "I-13",
    ]);
  });

  it("un egreso capturado con valor aparece; el aporte al IESS está siempre", () => {
    const capture = {
      ...emptyCapture(),
      deductions: { ...emptyCapture().deductions, salaryAdvance: 200 },
    };
    expect(codes(visibleDeductionConcepts(capture, new Set()))).toEqual(["E-01", "E-04"]);
  });

  it("un importe negativo también cuenta como valor", () => {
    // Un descuento mal tecleado en negativo tiene que VERSE para poder corregirse; esconderlo
    // dejaría una cifra moviendo el líquido sin fila que la explique.
    const capture = { ...emptyCapture(), deductions: { ...emptyCapture().deductions, fines: -10 } };
    expect(codes(visibleDeductionConcepts(capture, new Set()))).toContain("E-08");
  });
});

describe("qué conceptos se pueden añadir", () => {
  it("los capturados que todavía no se ven", () => {
    expect(codes(addableIncomeConcepts(emptyCapture(), new Set()))).toEqual([
      "I-08",
      "I-09",
      "I-10",
      "I-11",
      "I-12",
      "I-13",
    ]);
    expect(addableDeductionConcepts(emptyCapture(), new Set())).toHaveLength(12);
  });

  it("uno ya visible deja de ofrecerse, venga de un valor o de haberse añadido", () => {
    const conValor = { ...emptyCapture(), bonus: 50 };
    expect(codes(addableIncomeConcepts(conValor, new Set()))).not.toContain("I-13");
    expect(codes(addableIncomeConcepts(emptyCapture(), new Set(["I-13"])))).not.toContain("I-13");
  });

  it("un calculado NUNCA se ofrece: no se añade lo que la app deriva sola", () => {
    const addable = addableIncomeConcepts(emptyCapture(), new Set());
    expect(addable.every((c) => c.kind === "capturado")).toBe(true);
  });

  it("con todos puestos no queda nada que añadir", () => {
    const todos = new Set(INCOME_CONCEPTS.map((c) => c.code));
    expect(addableIncomeConcepts(emptyCapture(), todos)).toEqual([]);
  });
});

describe("opciones del desplegable de una fila capturada", () => {
  it("se ofrece a sí mismo primero y luego los libres", () => {
    // El propio concepto encabeza la lista porque es el valor seleccionado: sin él, el
    // desplegable arrancaría mostrando otro y parecería que la fila ya cambió.
    const capture = { ...emptyCapture(), allowances: 120 };
    const options = swapOptionsFor("I-10", INCOME_CONCEPTS, capture, new Set());
    expect(options[0].code).toBe("I-10");
    expect(codes(options)).toEqual(["I-10", "I-08", "I-09", "I-11", "I-12", "I-13"]);
  });

  it("no ofrece otro que ya esté puesto: dos filas no pueden ser el mismo concepto", () => {
    const capture = { ...emptyCapture(), allowances: 120, bonus: 50 };
    const options = swapOptionsFor("I-10", INCOME_CONCEPTS, capture, new Set());
    expect(codes(options)).not.toContain("I-13");
  });

  it("nunca ofrece un calculado", () => {
    const options = swapOptionsFor("I-08", INCOME_CONCEPTS, emptyCapture(), new Set(["I-08"]));
    expect(options.every((c) => c.kind === "capturado")).toBe(true);
  });

  it("un código que no existe no rompe: devuelve solo los libres", () => {
    expect(codes(swapOptionsFor("I-99", INCOME_CONCEPTS, emptyCapture(), new Set()))).toEqual([
      "I-08",
      "I-09",
      "I-10",
      "I-11",
      "I-12",
      "I-13",
    ]);
  });
});
