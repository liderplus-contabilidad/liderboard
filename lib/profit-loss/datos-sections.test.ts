import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SECTION_TONE_DEPTH, sectionOf, sectionTone } from "./datos-sections";

describe("sectionOf", () => {
  it("clasifica por la raíz, a cualquier profundidad", () => {
    expect(sectionOf("4")).toBe("income");
    expect(sectionOf("4.1.02.01.01")).toBe("income");
    expect(sectionOf("5")).toBe("cost");
    expect(sectionOf("5.2.01")).toBe("cost");
    // La raíz 6 la crea «Segmentar gastos»: es gasto, pero su propio bloque.
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
    // Con `hover:` propio, la columna fija se encendería sola y el borde derecho quedaría de otro
    // color que el resto de la fila justo al pasar por encima.
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
      // Y es el MISMO tono que la tabla, no un segundo verde que pueda divergir.
      expect(tone?.row.split(" ")[0]).toBe(tone?.print);
    }
  });

  it("las clases van LITERALES, o Tailwind no genera el CSS", () => {
    // Una clase construida como `bg-section-${x}` no existe en el CSS generado y la fila sale
    // transparente. Esto falla si alguien vuelve a plantillas al refactorizar.
    const source = readFileSync(new URL("./datos-sections.ts", import.meta.url), "utf8");
    for (const section of ["income", "cost", "other"] as const) {
      expect(source).toContain(`hover:bg-section-${section}-hover`);
      expect(source).toContain(`group-hover:bg-section-${section}-sub-hover`);
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
