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
    // Es la pantalla de un empleado recién copiado: su sueldo, sus dos décimos, su fondo de
    // reserva y su aporte al IESS. Listar los 26 conceptos con dieciocho rayas convertiría la
    // tabla en un formulario en blanco.
    expect(codes(visibleIncomeConcepts(emptyCapture(), new Set()))).toEqual([
      "I-01",
      "I-05",
      "I-06",
      "I-07",
    ]);
    expect(codes(visibleDeductionConcepts(emptyCapture(), new Set()))).toEqual(["E-01"]);
  });

  // Las tres clases de hora extra son los únicos conceptos que derivan su VALOR y a la vez
  // capturan su CANTIDAD. Se juzgan por las horas, que es lo que alguien teclea: sin horas, su
  // valor es cero por construcción y la fila solo puede estar en raya.
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

  // El recorte de Gerencia (`approvedOvertime: 0`, el `*0` del libro) deja el valor en cero pero
  // las horas trabajadas siguen ahí, y el comprobante del contador SÍ las imprime (§10).
  it("unas horas recortadas a cero por Gerencia siguen viéndose", () => {
    const capture = { ...emptyCapture(), overtimeHours50: 5.5, approvedOvertime: 0 };
    expect(codes(visibleIncomeConcepts(capture, new Set()))).toContain("I-02");
  });

  it("una hora extra añadida a mano se ve aunque no tenga horas todavía", () => {
    expect(codes(visibleIncomeConcepts(emptyCapture(), new Set(["I-03"])))).toContain("I-03");
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
    const visible = visibleIncomeConcepts(emptyCapture(), new Set(["I-13", "I-08", "I-02"]));
    expect(codes(visible)).toEqual(["I-01", "I-02", "I-05", "I-06", "I-07", "I-08", "I-13"]);
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
  it("todo lo que se teclea y todavía no se ve, en el orden del libro", () => {
    // Las horas extras encabezan la lista porque son las primeras del catálogo — y de paso son lo
    // que más se añade, que es lo que hace útil que «Agregar ingreso» empiece por ellas.
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

  // Ocultarlas sin poder traerlas de vuelta dejaría las horas extras inalcanzables: sin fila no
  // hay dónde teclear las horas, y sin horas la fila no aparece.
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
    // El propio concepto encabeza la lista porque es el valor seleccionado: sin él, el
    // desplegable arrancaría mostrando otro y parecería que la fila ya cambió.
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

  // Es lo que hace alcanzables las horas extras: se añade una fila y se elige ahí qué es.
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
    // Quien teclea 120 y luego se da cuenta de que era «Comisión fija» y no «Viáticos» espera
    // corregir la fila, no perder lo escrito. Y el origen vuelve a cero, o contaría dos veces.
    const capture = { ...emptyCapture(), allowances: 120 };
    expect(incomeSwapPatch(concept("I-10"), concept("I-11"), capture)).toEqual({
      allowances: 0,
      fixedCommission: 120,
    });
  });

  it("entre dos filas de horas extras se lleva las HORAS, no el importe", () => {
    // Es lo que hace honesto el cambio en esta familia: 5,5 horas mal clasificadas al 50 % son
    // 5,5 horas al 100 %, no 5,5 dólares.
    const capture = { ...emptyCapture(), overtimeHours50: 5.5 };
    expect(incomeSwapPatch(concept("I-02"), concept("I-03"), capture)).toEqual({
      overtimeHours50: 0,
      overtimeHours100: 5.5,
    });
  });

  // Un importe y unas horas no son la misma unidad, así que cruzar de familia NO puede arrastrar
  // la cifra: 200 dólares de anticipo no son 200 horas. En la práctica no se pierde nada, porque
  // el desplegable solo ofrece conceptos LIBRES y una fila con cifra ya está puesta.
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
      // Una fila de dos líneas rompería el paso fijo de las otras veinticinco; `AG2` trae el
      // salto dentro de la celda y aquí se normaliza.
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
    // El libro se contradice: su copia izquierda lee la cabecera de `Q` y la derecha lleva
    // `GERENCIA DE TURNO` escrito a mano. Manda la cabecera, que es de donde sale el dato.
    const concept = INCOME_CONCEPTS.find((c) => c.column === "Q");
    expect(concept?.payslipLabel).toBe("SEGURO PRIVADO");
  });
});

/**
 * EL `(*)` DEL COMPROBANTE, ATADO AL MOTOR.
 *
 * La nota al pie dice «No aporta IESS ni es Ingreso Gravado», y `bases.ts` lo dice en código: el
 * fondo de reserva pagado y el bono «no son base de nada, solo llegan al total». Esta afirmación
 * lo vuelve ejecutable — sumar 1 al componente de un concepto marcado no puede mover NINGUNA de
 * las cinco bases parciales, y uno sin marcar tiene que mover al menos una.
 *
 * Se prueban las cinco y no solo la aportable, que sería lo intuitivo: los dos décimos tampoco
 * mueven la aportable (`F+M+P+Q+R+S+T` no los incluye) y sin embargo NO llevan asterisco, porque
 * sí entran en la provisión. Con una sola base el test pasaría marcándolos por error.
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
  };

  const BASES = [
    contributoryBase,
    thirteenthBase,
    reserveFundAccrualBase,
    vacationBase,
    thirteenthProvisionBase,
  ];

  /** Las tres clases de hora extra llegan a las bases por `M`, nunca por `J`/`K`/`L`. */
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
