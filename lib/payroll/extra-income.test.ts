import { describe, expect, it } from "vitest";
import {
  NON_CONTRIBUTORY_CAP_RATE,
  extraCapBreaches,
  newExtraRow,
  removeExtraRow,
  renameExtraRow,
  setExtraRowAmount,
  sumExtraIncome,
} from "./extra-income";
import type { PayrollExtraRow } from "./types";

const APORTABLE: PayrollExtraRow = {
  id: "a1",
  label: "Movilización",
  kind: "aportable",
  amount: 100,
};
const NO_APORTABLE: PayrollExtraRow = {
  id: "n1",
  label: "Alimentación",
  kind: "noAportable",
  amount: 60,
};

describe("sumExtraIncome", () => {
  it("separa por clase", () => {
    expect(sumExtraIncome([APORTABLE, NO_APORTABLE])).toEqual({
      contributory: 100,
      nonContributory: 60,
    });
  });

  it("suma varias de la misma clase", () => {
    const rows: PayrollExtraRow[] = [
      APORTABLE,
      { id: "a2", label: "Bono ventas", kind: "aportable", amount: 50 },
    ];
    expect(sumExtraIncome(rows).contributory).toBe(150);
  });

  it("una fila en cero suma cero", () => {
    expect(sumExtraIncome([APORTABLE, { ...NO_APORTABLE, amount: 0 }])).toEqual({
      contributory: 100,
      nonContributory: 0,
    });
  });

  /** The orphan amount can no longer exist: the label, the class and the amount live in the SAME row,
   *  so removing it takes all three. They used to be two structures and one could be left hanging off
   *  the other. */
  it("sin filas declaradas los dos agregados son cero", () => {
    expect(sumExtraIncome([])).toEqual({ contributory: 0, nonContributory: 0 });
    expect(sumExtraIncome(undefined)).toEqual({ contributory: 0, nonContributory: 0 });
  });
});

describe("extraCapBreaches", () => {
  it("no avisa dentro de los dos topes", () => {
    // Salary 500: up to 100 of non-contributory (20 %) and up to 500 of contributory.
    expect(extraCapBreaches({ contributory: 400, nonContributory: 100 }, 500)).toEqual([]);
  });

  it("mide el tope de los no aportables sobre la SUMA, no fila a fila", () => {
    const rows: PayrollExtraRow[] = [
      { id: "n1", label: "Movilización", kind: "noAportable", amount: 20 },
      { id: "n2", label: "Alimentación", kind: "noAportable", amount: 20 },
      { id: "n3", label: "Bono", kind: "noAportable", amount: 20 },
    ];
    // Salary 200 → cap 40. None of the three exceeds it on its own; together they do.
    const totals = sumExtraIncome(rows);
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

  /** One cent over is not a notice: the engine carries floating-point noise and the cap of a salary
   *  with decimals falls in the middle of a bit. It is judged to the cent, like the whole module. */
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
    // The two cells of DELICMAR's book, at the foot of the salary column.
    expect(extraCapBreaches({ contributory: 0, nonContributory: 48.2 }, 241)).toEqual([]);
    expect(extraCapBreaches({ contributory: 0, nonContributory: 100 }, 500)).toEqual([]);
  });
});

describe("newExtraRow", () => {
  it("nace con un id que no colisiona con las declaradas", () => {
    const first = newExtraRow("aportable", []);
    const second = newExtraRow("noAportable", [first]);
    expect(second.id).not.toBe(first.id);
  });

  it("nace CON nombre: dos filas sin rótulo chocarían antes de que nadie escriba", () => {
    expect(newExtraRow("aportable", []).label).toBe("Bono aportable");
    expect(newExtraRow("noAportable", []).label).toBe("Bono no aportable");
  });

  it("busca sufijo contra los rótulos ya tomados, incluidos los de otras filas", () => {
    const first = newExtraRow("aportable", []);
    expect(newExtraRow("aportable", [first]).label).toBe("Bono aportable 2");
    // The universe includes the catalogue's labels: a new row cannot be born clashing with
    // «Uniformes» just because the clash comes from the other table.
    expect(newExtraRow("aportable", [], ["Bono aportable"]).label).toBe("Bono aportable 2");
  });

  it("nace en cero", () => {
    expect(newExtraRow("aportable", []).amount).toBe(0);
  });
});

describe("removeExtraRow / renameExtraRow / setExtraRowAmount", () => {
  const rows = [APORTABLE, NO_APORTABLE];

  it("quitar la fila se lleva su importe, porque vive dentro de ella", () => {
    expect(removeExtraRow(rows, "a1")).toEqual([NO_APORTABLE]);
  });

  it("quitar una que no está devuelve la lista igual", () => {
    expect(removeExtraRow(rows, "zzz")).toEqual(rows);
  });

  it("renombrar NO mueve el importe ni la clase", () => {
    const renamed = renameExtraRow(rows, "a1", "MOVILIZACION NO APORTABLE");
    expect(renamed[0]).toEqual({ ...APORTABLE, label: "MOVILIZACION NO APORTABLE" });
    expect(renamed[1]).toEqual(NO_APORTABLE);
  });

  it("cambiar el importe NO mueve el rótulo ni la clase", () => {
    expect(setExtraRowAmount(rows, "n1", 75)[1]).toEqual({ ...NO_APORTABLE, amount: 75 });
  });
});
