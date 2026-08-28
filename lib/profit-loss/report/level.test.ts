import { describe, expect, it } from "vitest";
import type { AccountOption } from "../filter";
import { collapsedAtLevel, FULL_DETAIL, hiddenAccountCount, levelLabel } from "./level";

/** A slice of a plan with the six depths a real file brings. */
const OPTIONS: AccountOption[] = [
  { code: "4", name: "Ingresos", level: 1, hasChildren: true },
  { code: "4.1", name: "Ventas", level: 2, hasChildren: true },
  { code: "4.1.1", name: "Alojamiento", level: 3, hasChildren: true },
  { code: "4.1.1.1", name: "Habitaciones", level: 4, hasChildren: true },
  { code: "4.1.1.1.1", name: "Estándar", level: 5, hasChildren: true },
  { code: "4.1.1.1.1.1", name: "Ventas Habitaciones", level: 6, hasChildren: false },
  { code: "4.1.2", name: "Restaurante", level: 3, hasChildren: false },
];

describe("el corte de nivel", () => {
  it("pliega todo padre a esa profundidad o más honda", () => {
    // At level 3 it is visible down to «4.1.1»; what hangs off there is collapsed.
    expect([...collapsedAtLevel(OPTIONS, 3)].sort()).toEqual(["4.1.1", "4.1.1.1", "4.1.1.1.1"]);
  });

  it("a nivel 2 pliega antes", () => {
    expect([...collapsedAtLevel(OPTIONS, 2)].sort()).toEqual([
      "4.1",
      "4.1.1",
      "4.1.1.1",
      "4.1.1.1.1",
    ]);
  });

  it("nunca pliega una cuenta sin hijos: no hay nada que esconder", () => {
    expect(collapsedAtLevel(OPTIONS, 3).has("4.1.2")).toBe(false);
  });

  it("«todo el detalle» no pliega nada", () => {
    expect(collapsedAtLevel(OPTIONS, FULL_DETAIL).size).toBe(0);
  });
});

describe("lo que el corte deja fuera", () => {
  it("cuenta las cuentas con un ancestro plegado", () => {
    const collapsed = collapsedAtLevel(OPTIONS, 3);

    // Left out are 4.1.1.1, 4.1.1.1.1 and 4.1.1.1.1.1 — the three that hang off «4.1.1».
    expect(hiddenAccountCount(OPTIONS, collapsed)).toBe(3);
  });

  it("sin corte no deja nada fuera", () => {
    expect(hiddenAccountCount(OPTIONS, new Set())).toBe(0);
  });

  it("una cuenta cuyo ancestro lejano está plegado también cuenta", () => {
    // «4.1» collapsed hides all its descendants, not only its direct children.
    expect(hiddenAccountCount(OPTIONS, new Set(["4.1"]))).toBe(5);
  });
});

describe("cómo se nombra el nivel", () => {
  it("nombra el corte, y «todo» cuando no lo hay", () => {
    expect(levelLabel(3)).toBe("Hasta nivel 3");
    expect(levelLabel(FULL_DETAIL)).toBe("Todo el detalle");
  });
});
