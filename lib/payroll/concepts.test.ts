import { describe, expect, it } from "vitest";
import {
  contributoryBase,
  reserveFundAccrualBase,
  thirteenthBase,
  thirteenthProvisionBase,
  vacationBase,
} from "./engine/bases";
import type { IncomeComponents } from "./engine/types";
import type { IncomeConcept } from "./concepts";
import {
  DEDUCTION_CONCEPTS,
  INCOME_CONCEPTS,
  addableDeductionConcepts,
  addableIncomeConcepts,
  deductionSwapPatch,
  incomeSwapPatch,
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
  it("sin nada capturado se ven los que SIEMPRE traen cifra y NADA más", () => {
    // It is the screen of a freshly copied employee: their salary, their two décimos, their reserve
    // fund and their IESS contribution. Listing the 26 concepts with eighteen dashes would turn the
    // table into a blank form.
    expect(codes(visibleIncomeConcepts(emptyCapture(), new Set()))).toEqual([
      "I-01",
      "I-05",
      "I-06",
      "I-07",
    ]);
    expect(codes(visibleDeductionConcepts(emptyCapture(), new Set()))).toEqual(["E-01"]);
  });

  // The three overtime classes are the only concepts that derive their VALUE and at the same time
  // capture their QUANTITY. They are judged by the hours, which is what someone types: with no hours,
  // their value is zero by construction and the row can only be a dash.
  it("una hora extra sin horas NO se ve, aunque su valor lo derive el motor", () => {
    const visible = codes(visibleIncomeConcepts(emptyCapture(), new Set()));
    expect(visible).not.toContain("I-02");
    expect(visible).not.toContain("I-03");
    expect(visible).not.toContain("I-04");
  });

  it("una hora extra con horas se ve, sin que nadie la añada", () => {
    const capture = { ...emptyCapture(), overtimeHours50: 5.5 };
    expect(codes(visibleIncomeConcepts(capture, new Set()))).toEqual([
      "I-01",
      "I-02",
      "I-05",
      "I-06",
      "I-07",
    ]);
  });

  // Gerencia's trim (`approvedOvertime: 0`, the book's `*0`) leaves the value at zero but the hours
  // worked are still there, and the accountant's payslip DOES print them (§10).
  it("unas horas recortadas a cero por Gerencia siguen viéndose", () => {
    const capture = { ...emptyCapture(), overtimeHours50: 5.5, approvedOvertime: 0 };
    expect(codes(visibleIncomeConcepts(capture, new Set()))).toContain("I-02");
  });

  it("una hora extra añadida a mano se ve aunque no tenga horas todavía", () => {
    expect(codes(visibleIncomeConcepts(emptyCapture(), new Set(["I-03"])))).toContain("I-03");
  });

  it("un capturado con valor aparece solo, sin que nadie lo añada", () => {
    // It is what makes a rol loaded from Excel look complete: the concepts the file brings with an
    // amount are shown because they bring one.
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

  // What is visible by its own figure keeps the BOOK's order —it is what allows reading two employees
  // of the same month in parallel—; what someone has just added goes AT THE END and in the order it
  // was added, which is where the button that created it is. Slipping it into its catalogue place
  // makes the new row appear far from where it was clicked, sometimes out of sight.
  it("lo que trae cifra va en orden del libro; lo añadido, al final y en orden de adición", () => {
    const visible = visibleIncomeConcepts(emptyCapture(), new Set(["I-13", "I-08", "I-02"]));
    expect(codes(visible)).toEqual(["I-01", "I-05", "I-06", "I-07", "I-13", "I-08", "I-02"]);
  });

  it("un capturado con cifra sigue en su sitio del libro aunque otro se añada después", () => {
    const capture = { ...emptyCapture(), allowances: 120 };
    expect(codes(visibleIncomeConcepts(capture, new Set(["I-08"])))).toEqual([
      "I-01",
      "I-05",
      "I-06",
      "I-07",
      "I-10",
      "I-08",
    ]);
  });

  // `added` only lives while the screen is open, so this reorders nothing that is stored: on reload, a
  // row with a figure goes back to its place in the book on its own.
  it("una fila añadida Y con cifra se queda donde se añadió mientras dure la sesión", () => {
    const capture = { ...emptyCapture(), bonus: 50 };
    expect(codes(visibleIncomeConcepts(capture, new Set(["I-13"])))).toEqual([
      "I-01",
      "I-05",
      "I-06",
      "I-07",
      "I-13",
    ]);
  });

  it("un código de otra tabla no se cuela: los egresos ignoran lo añadido en ingresos", () => {
    expect(codes(visibleDeductionConcepts(emptyCapture(), new Set(["I-08"])))).toEqual(["E-01"]);
  });

  it("un egreso capturado con valor aparece; el aporte al IESS está siempre", () => {
    const capture = {
      ...emptyCapture(),
      deductions: { ...emptyCapture().deductions, salaryAdvance: 200 },
    };
    expect(codes(visibleDeductionConcepts(capture, new Set()))).toEqual(["E-01", "E-04"]);
  });

  it("un importe negativo también cuenta como valor", () => {
    // A deduction mistyped as a negative has to be VISIBLE so it can be corrected; hiding it would
    // leave a figure moving the net pay with no row to explain it.
    const capture = { ...emptyCapture(), deductions: { ...emptyCapture().deductions, fines: -10 } };
    expect(codes(visibleDeductionConcepts(capture, new Set()))).toContain("E-08");
  });
});

describe("qué conceptos se pueden añadir", () => {
  it("todo lo que se teclea y todavía no se ve, en el orden del libro", () => {
    // The overtime rows head the list because they are the first of the catalogue — and they also
    // happen to be what gets added most, which is what makes it useful for «Agregar ingreso» to start
    // with them.
    expect(codes(addableIncomeConcepts(emptyCapture(), new Set()))).toEqual([
      "I-02",
      "I-03",
      "I-04",
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

  it("una hora extra con horas deja de ofrecerse: ya está en la tabla", () => {
    const capture = { ...emptyCapture(), overtimeHours100: 3 };
    expect(codes(addableIncomeConcepts(capture, new Set()))).not.toContain("I-03");
  });

  // Hiding them without being able to bring them back would leave the overtime unreachable: with no
  // row there is nowhere to type the hours, and with no hours the row does not appear.
  it("las horas extras SÍ se ofrecen, aunque su valor lo derive el motor", () => {
    expect(codes(addableIncomeConcepts(emptyCapture(), new Set()))).toContain("I-02");
  });

  it("lo que la app deriva SOLA nunca se ofrece: no se añade un sueldo unificado", () => {
    const addable = codes(addableIncomeConcepts(emptyCapture(), new Set()));
    expect(addable).not.toContain("I-01");
    expect(addable).not.toContain("I-05");
    expect(addable).not.toContain("I-06");
    expect(addable).not.toContain("I-07");
  });

  it("con todos puestos no queda nada que añadir", () => {
    const todos = new Set(INCOME_CONCEPTS.map((c) => c.code));
    expect(addableIncomeConcepts(emptyCapture(), todos)).toEqual([]);
  });
});

describe("opciones del desplegable de una fila capturada", () => {
  it("se ofrece a sí mismo primero y luego los libres", () => {
    // The concept itself heads the list because it is the selected value: without it, the dropdown
    // would start showing another one and it would look as though the row had already changed.
    const capture = { ...emptyCapture(), allowances: 120 };
    const options = swapOptionsFor("I-10", INCOME_CONCEPTS, capture, new Set());
    expect(options[0].code).toBe("I-10");
    expect(codes(options)).toEqual([
      "I-10",
      "I-02",
      "I-03",
      "I-04",
      "I-08",
      "I-09",
      "I-11",
      "I-12",
      "I-13",
    ]);
  });

  // It is what makes the overtime reachable: a row is added and what it is gets picked there.
  it("una fila puede cambiarse a una hora extra", () => {
    const options = swapOptionsFor("I-08", INCOME_CONCEPTS, emptyCapture(), new Set(["I-08"]));
    expect(codes(options)).toContain("I-02");
  });

  it("una fila de horas extras se ofrece a sí misma y a sus hermanas", () => {
    const capture = { ...emptyCapture(), overtimeHours50: 5.5 };
    const options = swapOptionsFor("I-02", INCOME_CONCEPTS, capture, new Set());
    expect(options[0].code).toBe("I-02");
    expect(codes(options)).toContain("I-03");
    expect(codes(options)).toContain("I-04");
  });

  it("no ofrece otro que ya esté puesto: dos filas no pueden ser el mismo concepto", () => {
    const capture = { ...emptyCapture(), allowances: 120, bonus: 50 };
    const options = swapOptionsFor("I-10", INCOME_CONCEPTS, capture, new Set());
    expect(codes(options)).not.toContain("I-13");
  });

  it("nunca ofrece lo que la app deriva sola", () => {
    const options = codes(
      swapOptionsFor("I-08", INCOME_CONCEPTS, emptyCapture(), new Set(["I-08"])),
    );
    expect(options).not.toContain("I-01");
    expect(options).not.toContain("I-06");
  });

  it("un código que no existe no rompe: devuelve solo los libres", () => {
    expect(codes(swapOptionsFor("I-99", INCOME_CONCEPTS, emptyCapture(), new Set()))).toEqual([
      "I-02",
      "I-03",
      "I-04",
      "I-08",
      "I-09",
      "I-10",
      "I-11",
      "I-12",
      "I-13",
    ]);
  });
});

describe("qué escribe un cambio de concepto", () => {
  const concept = (code: string) => INCOME_CONCEPTS.find((c) => c.code === code)!;

  it("entre dos filas capturadas se lleva el importe y vacía el origen", () => {
    // Whoever types 120 and then realises it was «Comisión fija» and not «Viáticos» expects to correct
    // the row, not to lose what they wrote. And the source goes back to zero, or it would count twice.
    const capture = { ...emptyCapture(), allowances: 120 };
    expect(incomeSwapPatch(concept("I-10"), concept("I-11"), capture)).toEqual({
      allowances: 0,
      fixedCommission: 120,
    });
  });

  it("entre dos filas de horas extras se lleva las HORAS, no el importe", () => {
    // It is what makes the change honest within this family: 5.5 hours misclassified at 50 % are 5.5
    // hours at 100 %, not 5.5 dollars.
    const capture = { ...emptyCapture(), overtimeHours50: 5.5 };
    expect(incomeSwapPatch(concept("I-02"), concept("I-03"), capture)).toEqual({
      overtimeHours50: 0,
      overtimeHours100: 5.5,
    });
  });

  // An amount and a number of hours are not the same unit, so crossing families CANNOT drag the
  // figure along: 200 dollars of an advance are not 200 hours. In practice nothing is lost, because
  // the dropdown only offers FREE concepts and a row with a figure is already taken.
  it("cruzando de familia solo vacía el origen, sin inventar una conversión", () => {
    const capture = { ...emptyCapture(), overtimeHours50: 5.5 };
    expect(incomeSwapPatch(concept("I-02"), concept("I-10"), capture)).toEqual({
      overtimeHours50: 0,
    });
  });

  it("no cambia lo que la app deriva sola", () => {
    expect(incomeSwapPatch(concept("I-01"), concept("I-10"), emptyCapture())).toBeNull();
    expect(incomeSwapPatch(concept("I-10"), concept("I-06"), emptyCapture())).toBeNull();
  });

  it("los egresos mueven el importe dentro de su propio objeto", () => {
    const capture = {
      ...emptyCapture(),
      deductions: { ...emptyCapture().deductions, fines: 30 },
    };
    const patch = deductionSwapPatch(
      DEDUCTION_CONCEPTS.find((c) => c.code === "E-08")!,
      DEDUCTION_CONCEPTS.find((c) => c.code === "E-04")!,
      capture,
    );
    expect(patch?.deductions).toMatchObject({ fines: 0, salaryAdvance: 30 });
  });

  it("el aporte al IESS no se cambia por nada: lo deriva el motor", () => {
    const patch = deductionSwapPatch(
      DEDUCTION_CONCEPTS.find((c) => c.code === "E-01")!,
      DEDUCTION_CONCEPTS.find((c) => c.code === "E-04")!,
      emptyCapture(),
    );
    expect(patch).toBeNull();
  });
});

describe("los rótulos del comprobante", () => {
  it("los 26 conceptos declaran uno, y ninguno lleva salto de línea", () => {
    for (const concept of [...INCOME_CONCEPTS, ...DEDUCTION_CONCEPTS]) {
      expect(concept.payslipLabel.trim(), concept.code).not.toBe("");
      // A two-line row would break the fixed rhythm of the other twenty-five; `AG2` brings the line
      // break inside the cell and it is normalized here.
      expect(concept.payslipLabel, concept.code).not.toContain("\n");
    }
  });

  it("van verbatim del libro, con sus erratas", () => {
    const label = (code: string) =>
      [...INCOME_CONCEPTS, ...DEDUCTION_CONCEPTS].find((c) => c.code === code)?.payslipLabel;

    expect(label("I-01")).toBe("SUELDO UNIFICADO");
    expect(label("I-10")).toBe("VIATICOS/VIVIENDA");
    expect(label("E-12")).toBe("DESCUENTO TIEMPO PACIAL");
    expect(label("E-13")).toBe("Descuento PERMISO MEDICO");
    expect(label("E-10")).toBe("CONTRIBUCION SOLIDARIA");
  });

  it("la columna Q se imprime SEGURO PRIVADO, no GERENCIA DE TURNO", () => {
    // The book contradicts itself: its left-hand copy reads `Q`'s header and the right-hand one
    // carries `GERENCIA DE TURNO` written by hand. The header wins, which is where the datum comes
    // from.
    const concept = INCOME_CONCEPTS.find((c) => c.column === "Q");
    expect(concept?.payslipLabel).toBe("SEGURO PRIVADO");
  });
});

/**
 * THE PAYSLIP'S `(*)`, TIED TO THE ENGINE.
 *
 * The footnote says «No aporta IESS ni es Ingreso Gravado», and `bases.ts` says it in code: the paid
 * reserve fund and the bonus «are the base of nothing, they only reach the total». This assertion
 * makes that executable — adding 1 to the component of a marked concept cannot move ANY of the five
 * partial bases, and an unmarked one has to move at least one.
 *
 * All five are tested and not only the contributory one, which would be the intuitive choice: the two
 * décimos do not move the contributory one either (`F+M+P+Q+R+S+T` does not include them) and yet
 * they carry NO asterisk, because they do enter the provision. With a single base the test would pass
 * while marking them by mistake.
 */
describe("el asterisco del comprobante", () => {
  const ZERO: IncomeComponents = {
    unifiedSalary: 0,
    overtimeTotal: 0,
    fourteenthMonthly: 0,
    thirteenthMonthly: 0,
    vacationPay: 0,
    privateInsurance: 0,
    allowances: 0,
    fixedCommission: 0,
    variableCommission: 0,
    reserveFundPaid: 0,
    bonus: 0,
    contributoryExtras: 0,
    nonContributoryExtras: 0,
  };

  const BASES = [
    contributoryBase,
    thirteenthBase,
    reserveFundAccrualBase,
    vacationBase,
    thirteenthProvisionBase,
  ];

  /** The three overtime classes reach the bases through `M`, never through `J`/`K`/`L`. */
  const componentOf = (concept: IncomeConcept): keyof IncomeComponents =>
    concept.kind === "calculado" && concept.hoursField
      ? "overtimeTotal"
      : (concept.field as keyof IncomeComponents);

  const movesSomeBase = (component: keyof IncomeComponents) => {
    const bumped = { ...ZERO, [component]: 1 };
    return BASES.some((base) => base(bumped) !== base(ZERO));
  };

  it("marca exactamente el fondo de reserva y el bono", () => {
    const marked = INCOME_CONCEPTS.filter((c) => c.notContributory).map((c) => c.code);
    expect(marked).toEqual(["I-07", "I-13"]);
  });

  it("un concepto marcado no es base de nada", () => {
    for (const concept of INCOME_CONCEPTS.filter((c) => c.notContributory)) {
      expect(movesSomeBase(componentOf(concept)), concept.code).toBe(false);
    }
  });

  it("un concepto sin marcar mueve al menos una base", () => {
    for (const concept of INCOME_CONCEPTS.filter((c) => !c.notContributory)) {
      expect(movesSomeBase(componentOf(concept)), concept.code).toBe(true);
    }
  });

  it("ningún egreso lleva la marca: es una columna de ingresos", () => {
    expect(DEDUCTION_CONCEPTS.some((c) => "notContributory" in c)).toBe(false);
  });
});
