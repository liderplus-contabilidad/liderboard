import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SECTION_TONE_DEPTH, sectionOf, sectionTone } from "./datos-sections";

describe("sectionOf", () => {
  it("clasifica por la raíz, a cualquier profundidad", () => {
    expect(sectionOf("4")).toBe("income");
    expect(sectionOf("4.1.02.01.01")).toBe("income");
    expect(sectionOf("5")).toBe("cost");
    expect(sectionOf("5.2.01")).toBe("cost");
    // Root 6 is created by «Segmentar gastos»: it is expense, but its own block.
    expect(sectionOf("6")).toBe("other");
    expect(sectionOf("6.1.1")).toBe("other");
  });

  it("no inventa bloque para una raíz ajena al estado", () => {
    expect(sectionOf("1")).toBeNull();
    expect(sectionOf("3.2")).toBeNull();
  });
});

describe("sectionTone", () => {
  it("ingresos y costos NO comparten tono en el nivel 1", () => {
    expect(sectionTone("4", 1)?.row).not.toBe(sectionTone("5", 1)?.row);
  });

  it("ni en el nivel 2: dos filas del mismo tono son del mismo bloque", () => {
    expect(sectionTone("4.1", 2)?.row).not.toBe(sectionTone("5.1", 2)?.row);
  });

  it("el nivel 2 es una versión más clara del nivel 1 de SU bloque", () => {
    expect(sectionTone("4", 1)?.row).toContain("bg-section-income ");
    expect(sectionTone("4.1", 2)?.row).toContain("bg-section-income-sub ");
    expect(sectionTone("5", 1)?.row).toContain("bg-section-cost ");
    expect(sectionTone("5.1", 2)?.row).toContain("bg-section-cost-sub ");
  });

  it("los tres bloques se distinguen entre sí", () => {
    const rows = [sectionTone("4", 1), sectionTone("5", 1), sectionTone("6", 1)].map((t) => t?.row);
    expect(new Set(rows).size).toBe(3);
  });

  it("del nivel 3 hacia dentro la tabla vuelve a ser blanca", () => {
    expect(sectionTone("4.1.01", SECTION_TONE_DEPTH + 1)).toBeNull();
    expect(sectionTone("4.1.01.01.01", 5)).toBeNull();
    expect(sectionTone("5.2.02.01", 4)).toBeNull();
  });

  it("la fila reacciona a su propio hover; la celda fija, al de la fila", () => {
    // With a `hover:` of its own, the pinned column would light up by itself and the right border
    // would end up a different colour from the rest of the row exactly on hover.
    const tone = sectionTone("4", 1);
    expect(tone?.row).toBe("bg-section-income hover:bg-section-income-hover");
    expect(tone?.sticky).toBe("bg-section-income group-hover:bg-section-income-hover");
  });

  it("el fondo del informe es el mismo tono, y no reacciona a nada", () => {
    for (const [code, level] of [
      ["4", 1],
      ["4.1", 2],
      ["5", 1],
      ["5.1", 2],
      ["6", 1],
      ["6.1", 2],
    ] as const) {
      const tone = sectionTone(code, level);
      expect(tone?.print).not.toContain("hover");
      // And it is the SAME hue as the table, not a second green that could diverge.
      expect(tone?.row.split(" ")[0]).toBe(tone?.print);
    }
  });

  it("las clases van LITERALES, o Tailwind no genera el CSS", () => {
    // A class built as `bg-section-${x}` does not exist in the generated CSS and the row comes out
    // transparent. This fails if someone goes back to templates while refactoring.
    const source = readFileSync(new URL("./datos-sections.ts", import.meta.url), "utf8");
    for (const section of ["income", "cost", "other"] as const) {
      expect(source).toContain(`hover:bg-section-${section}-hover`);
      expect(source).toContain(`group-hover:bg-section-${section}-sub-hover`);
    }
  });

  it("el ARGB del Excel es el MISMO hex que el token de `@theme`", () => {
    // An `.xlsx` does not resolve a CSS variable, so the hex is duplicated. This is the test that
    // holds the duplication up: if someone moves a token and does not move its ARGB, it fails here
    // instead of a different green coming out in the download from the one on screen.
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    const tokenHex = (token: string): string => {
      const match = css.match(new RegExp(`--color-${token}:\\s*#([0-9a-fA-F]{6});`));
      if (!match) throw new Error(`falta el token --color-${token} en globals.css`);
      return `FF${match[1].toUpperCase()}`;
    };
    for (const [code, level, token] of [
      ["4", 1, "section-income"],
      ["4.1", 2, "section-income-sub"],
      ["5", 1, "section-cost"],
      ["5.1", 2, "section-cost-sub"],
      ["6", 1, "section-other"],
      ["6.1", 2, "section-other-sub"],
    ] as const) {
      expect(sectionTone(code, level)?.argb).toBe(tokenHex(token));
    }
  });

  it("la fila de resultado no lleva tono: no pertenece a ningún bloque", () => {
    expect(sectionTone("4", 1, true)).toBeNull();
    expect(sectionTone("5", 1, true)).toBeNull();
  });

  it("una raíz ajena al estado tampoco lleva", () => {
    expect(sectionTone("1", 1)).toBeNull();
  });
});
