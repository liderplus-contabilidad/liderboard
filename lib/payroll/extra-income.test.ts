import { describe, expect, it } from "vitest";
import {
  NON_CONTRIBUTORY_CAP_RATE,
  extraCapBreaches,
  newExtraConcept,
  removeExtraConcept,
  sumExtraIncome,
  validateExtraLabel,
} from "./extra-income";
import type { PayrollExtraConcept } from "./types";

const APORTABLE: PayrollExtraConcept = { id: "a1", label: "Movilización", kind: "aportable" };
const NO_APORTABLE: PayrollExtraConcept = {
  id: "n1",
  label: "Alimentación",
  kind: "noAportable",
};

describe("sumExtraIncome", () => {
  it("separa por clase", () => {
    const totals = sumExtraIncome([APORTABLE, NO_APORTABLE], { a1: 100, n1: 60 });
    expect(totals).toEqual({ contributory: 100, nonContributory: 60 });
  });

  it("suma varios de la misma clase", () => {
    const concepts: PayrollExtraConcept[] = [
      APORTABLE,
      { id: "a2", label: "Bono ventas", kind: "aportable" },
    ];
    expect(sumExtraIncome(concepts, { a1: 100, a2: 50 }).contributory).toBe(150);
  });

  it("un concepto sin importe vale cero", () => {
    expect(sumExtraIncome([APORTABLE, NO_APORTABLE], { a1: 100 })).toEqual({
      contributory: 100,
      nonContributory: 0,
    });
  });

  /** El modo de fallo que el borrado cierra en `db.ts`: aquí se comprueba que, aunque quedara uno,
   *  no suma. Sumarlo metería en el rol una cifra que ninguna pantalla puede enseñar ni corregir. */
  it("ignora un importe huérfano, sin declaración que lo respalde", () => {
    expect(sumExtraIncome([APORTABLE], { a1: 100, borrado: 999 }).contributory).toBe(100);
  });

  it("sin conceptos declarados los dos agregados son cero", () => {
    expect(sumExtraIncome([], { a1: 100 })).toEqual({ contributory: 0, nonContributory: 0 });
  });
});

describe("extraCapBreaches", () => {
  it("no avisa dentro de los dos topes", () => {
    // Sueldo 500: hasta 100 de no aportables (20 %) y hasta 500 de aportables.
    expect(extraCapBreaches({ contributory: 400, nonContributory: 100 }, 500)).toEqual([]);
  });

  it("mide el tope de los no aportables sobre la SUMA, no concepto a concepto", () => {
    const concepts: PayrollExtraConcept[] = [
      { id: "n1", label: "Movilización", kind: "noAportable" },
      { id: "n2", label: "Alimentación", kind: "noAportable" },
      { id: "n3", label: "Bono", kind: "noAportable" },
    ];
    // Sueldo 200 → tope 40. Ninguno de los tres lo supera por su cuenta; juntos sí.
    const totals = sumExtraIncome(concepts, { n1: 20, n2: 20, n3: 20 });
    const breaches = extraCapBreaches(totals, 200);

    expect(breaches).toEqual([{ kind: "noAportable", total: 60, cap: 40, excess: 20 }]);
  });

  it("avisa del aportable que supera el sueldo", () => {
    expect(extraCapBreaches({ contributory: 620, nonContributory: 0 }, 500)).toEqual([
      { kind: "aportable", total: 620, cap: 500, excess: 120 },
    ]);
  });

  it("puede avisar de las dos clases a la vez, aportable primero", () => {
    const breaches = extraCapBreaches({ contributory: 600, nonContributory: 150 }, 500);
    expect(breaches.map((breach) => breach.kind)).toEqual(["aportable", "noAportable"]);
  });

  it("el tope justo no es un exceso", () => {
    expect(extraCapBreaches({ contributory: 500, nonContributory: 100 }, 500)).toEqual([]);
  });

  /** Un céntimo de más no es un aviso: el motor arrastra ruido de coma flotante y el tope de un
   *  sueldo con decimales cae en medio de un bit. Se juzga al centavo, como todo el módulo. */
  it("no avisa por ruido de coma flotante bajo el centavo", () => {
    expect(extraCapBreaches({ contributory: 500.000000001, nonContributory: 0 }, 500)).toEqual([]);
  });

  it("con sueldo unificado cero cualquier importe se pasa", () => {
    const breaches = extraCapBreaches({ contributory: 0, nonContributory: 10 }, 0);
    expect(breaches).toEqual([{ kind: "noAportable", total: 10, cap: 0, excess: 10 }]);
  });

  it("con sueldo cero y sin importes no avisa", () => {
    expect(extraCapBreaches({ contributory: 0, nonContributory: 0 }, 0)).toEqual([]);
  });

  it("la tasa del tope no aportable es el 20 % que el libro escribe a mano", () => {
    expect(NON_CONTRIBUTORY_CAP_RATE).toBe(0.2);
    // Las dos celdas del libro de DELICMAR, al pie de la columna del sueldo.
    expect(extraCapBreaches({ contributory: 0, nonContributory: 48.2 }, 241)).toEqual([]);
    expect(extraCapBreaches({ contributory: 0, nonContributory: 100 }, 500)).toEqual([]);
  });
});

describe("validateExtraLabel", () => {
  it("acepta un rótulo nuevo", () => {
    const result = validateExtraLabel("  Movilización  ", []);
    expect(result).toEqual({ ok: true, name: "Movilización" });
  });

  it("rechaza el vacío", () => {
    expect(validateExtraLabel("   ", [])).toMatchObject({ ok: false });
  });

  it("rechaza pasado el tope de 60 caracteres", () => {
    expect(validateExtraLabel("x".repeat(61), [])).toMatchObject({ ok: false });
  });

  it("rechaza el repetido ignorando mayúsculas y acentos", () => {
    const existing: PayrollExtraConcept[] = [
      { id: "a1", label: "Movilización", kind: "aportable" },
    ];
    expect(validateExtraLabel("MOVILIZACION", existing)).toMatchObject({ ok: false });
  });

  /** Renombrar un concepto a lo que ya se llama no puede ser un choque consigo mismo. */
  it("no choca con el concepto que se está renombrando", () => {
    const existing: PayrollExtraConcept[] = [
      { id: "a1", label: "Movilización", kind: "aportable" },
    ];
    expect(validateExtraLabel("Movilización", existing, "a1")).toMatchObject({ ok: true });
  });

  it("un mismo rótulo en clases distintas también choca", () => {
    const existing: PayrollExtraConcept[] = [{ id: "a1", label: "Bono", kind: "aportable" }];
    expect(validateExtraLabel("bono", existing)).toMatchObject({ ok: false });
  });
});

describe("newExtraConcept", () => {
  it("nace con un id que no colisiona con los declarados", () => {
    const first = newExtraConcept("Movilización", "aportable", []);
    const second = newExtraConcept("Alimentación", "noAportable", [first]);
    expect(second.id).not.toBe(first.id);
  });

  it("conserva el rótulo tal como se escribió, sin espacios sobrantes", () => {
    expect(newExtraConcept("  Bono  ventas ", "aportable", []).label).toBe("Bono ventas");
  });
});

describe("removeExtraConcept", () => {
  it("quita la declaración y el importe de cada captura", () => {
    const concepts = [APORTABLE, NO_APORTABLE];
    const result = removeExtraConcept(concepts, "a1");

    expect(result.concepts).toEqual([NO_APORTABLE]);
    expect(result.pruneAmounts({ a1: 100, n1: 60 })).toEqual({ n1: 60 });
  });

  it("podar una captura que no lo tenía la devuelve igual", () => {
    const result = removeExtraConcept([APORTABLE], "a1");
    expect(result.pruneAmounts({ n1: 60 })).toEqual({ n1: 60 });
  });
});
