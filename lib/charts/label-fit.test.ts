import { describe, expect, it } from "vitest";
import { fitDirectLabel, labelDistance, labelHeadroom, LABEL_GAP } from "./label-fit";

describe("fitDirectLabel", () => {
  it("nunca apaga la cifra, por muchas columnas que traiga el eje", () => {
    // Es la regla que sustituye a los topes de densidad de cada módulo: lo que cambia es la forma,
    // jamás si se escribe.
    for (const columns of [1, 12, 24, 365]) {
      expect(fitDirectLabel(columns).fontSize).toBeGreaterThan(0);
    }
  });

  it("cede el cuerpo según se aprieta el eje, y nunca al revés", () => {
    const sizes = [1, 8, 12, 18, 24].map((columns) => fitDirectLabel(columns).fontSize);

    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(fitDirectLabel(24).fontSize).toBeLessThan(fitDirectLabel(4).fontSize);
  });

  it("suelta los centavos después del cuerpo, no antes", () => {
    // El año en meses todavía los escribe; es más allá donde lo que no cabe son ellos.
    expect(fitDirectLabel(12).cents).toBe(true);
    expect(fitDirectLabel(21).cents).toBe(false);
  });
});

describe("labelDistance", () => {
  it("deja la primera fila sobre su propia marca", () => {
    expect(labelDistance(0, fitDirectLabel(12))).toBe(LABEL_GAP);
  });

  it("levanta cada fila el interlineado de la que tiene debajo", () => {
    const fit = fitDirectLabel(12);

    expect(labelDistance(1, fit)).toBe(labelDistance(0, fit) + fit.fontSize + LABEL_GAP);
    expect(labelDistance(2, fit)).toBeGreaterThan(labelDistance(1, fit));
  });
});

describe("labelHeadroom", () => {
  it("le abre sitio a la fila de arriba, que `outerBoundsContain` no reserva", () => {
    const fit = fitDirectLabel(12);

    expect(labelHeadroom(3, fit, 16)).toBeGreaterThan(labelHeadroom(1, fit, 16));
  });

  it("respeta un margen que ya era mayor que el que la cifra necesita", () => {
    expect(labelHeadroom(1, fitDirectLabel(12), 200)).toBe(200);
  });

  it("trata «ninguna serie» como una, para no pedir un margen negativo", () => {
    expect(labelHeadroom(0, fitDirectLabel(12), 0)).toBe(labelHeadroom(1, fitDirectLabel(12), 0));
  });
});
