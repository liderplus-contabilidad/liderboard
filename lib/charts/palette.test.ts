import { describe, expect, it } from "vitest";
import {
  CHART_HEAT_EMPTY,
  CHART_HEAT_RAMP,
  CHART_PERIOD_PALETTE,
  CHART_MARK,
  CHART_MAX_SERIES,
  CHART_NEUTRAL,
  CHART_PALETTE,
  CHART_SIGN,
  colorForEntity,
  colorForPeriod,
  heatStep,
} from "./palette";

const CENTERS = ["consolidado", "cultura-manor", "centro-de-costo-principal", "sin-centro"];

describe("el orden de las ranuras", () => {
  it("keeps the eight slots in the sequence that makes them separable", () => {
    expect([...CHART_PALETTE]).toEqual([
      "#2b6cb0",
      "#eb6834",
      "#1baf7a",
      "#eda100",
      "#e87ba4",
      "#008300",
      "#4a3aa7",
      "#e34948",
    ]);
    expect(CHART_MAX_SERIES).toBe(8);
  });

  it("gives the third compared entity slot 3, whatever else is on screen", () => {
    expect(colorForEntity("centro-de-costo-principal", CENTERS)).toBe("#1baf7a");
  });

  it("never reuses the sign tokens as a series color", () => {
    expect(CHART_PALETTE).not.toContain(CHART_SIGN.positive);
    expect(CHART_PALETTE).not.toContain(CHART_SIGN.negative);
  });
});

describe("el color sigue a la entidad", () => {
  it("does not repaint the rest when one is dropped from the drawn set", () => {
    // The order is the dimension's, not the result's: whoever is drawn is irrelevant.
    const before = CENTERS.map((id) => colorForEntity(id, CENTERS));
    const drawn = CENTERS.filter((id) => id !== "consolidado");
    const after = drawn.map((id) => colorForEntity(id, CENTERS));
    expect(after).toEqual(before.slice(1));
  });

  it("returns the same color for the same entity across calls", () => {
    expect(colorForEntity("cultura-manor", CENTERS)).toBe(colorForEntity("cultura-manor", CENTERS));
  });

  it("does not follow the account's position in the result", () => {
    const order = ["4.1.1.1", "4.1.1.2", "4.1.1.3"];
    // Drawn second here, first there — the slot comes from `order` either way.
    expect(colorForEntity("4.1.1.3", order)).toBe(CHART_PALETTE[2]);
  });
});

describe("más allá de la octava ranura", () => {
  it("does not generate a ninth color", () => {
    const nine = Array.from({ length: 9 }, (_, index) => `cuenta-${index}`);
    const ninth = colorForEntity("cuenta-8", nine);
    expect(ninth).toBe(CHART_NEUTRAL);
    expect(CHART_PALETTE).not.toContain(ninth);
  });

  it("does not cycle back to the first slot", () => {
    const ten = Array.from({ length: 10 }, (_, index) => `cuenta-${index}`);
    expect(colorForEntity("cuenta-8", ten)).not.toBe(CHART_PALETTE[0]);
    expect(colorForEntity("cuenta-9", ten)).toBe(colorForEntity("cuenta-8", ten));
  });

  it("falls back to the neutral for an entity the dimension does not contain", () => {
    expect(colorForEntity("desconocido", CENTERS)).toBe(CHART_NEUTRAL);
  });
});

describe("constantes de marca", () => {
  it("exposes the 2px separation the option builders paint between fills", () => {
    expect(CHART_MARK.gap).toBe(2);
  });
});

describe("CHART_PERIOD_PALETTE · un color por marca", () => {
  it("está apagado a propósito: doce barras saturadas cansan la vista", () => {
    // Ninguno es el tono pleno del set de identidad: son mezclas hacia gris.
    for (const hue of CHART_PERIOD_PALETTE) {
      expect(CHART_PALETTE).not.toContain(hue);
    }
  });

  it("tiene doce slots: doce meses es lo más que un periodo alcanza", () => {
    expect(CHART_PERIOD_PALETTE).toHaveLength(12);
    expect(new Set(CHART_PERIOD_PALETTE).size).toBe(12);
  });

  it("da el color por el lugar en el eje", () => {
    expect(colorForPeriod(0)).toBe(CHART_PERIOD_PALETTE[0]);
    expect(colorForPeriod(11)).toBe(CHART_PERIOD_PALETTE[11]);
  });

  it("una marca decimotercera cae en el neutro: no se inventa un tono", () => {
    expect(colorForPeriod(12)).toBe(CHART_NEUTRAL);
    expect(colorForPeriod(-1)).toBe(CHART_NEUTRAL);
  });

  it("no se pisa con los slots de serie: son dos trabajos distintos", () => {
    // Comparten los primeros por diseño (misma familia de marca), pero el set es más largo.
    expect(CHART_PERIOD_PALETTE.length).toBeGreaterThan(CHART_PALETTE.length);
  });
});

describe("CHART_HEAT_RAMP · un solo tono", () => {
  it("es una escala amarilla, de claro a ocre", () => {
    expect(CHART_HEAT_RAMP[0]).toBe("#fde68a");
    expect(CHART_HEAT_RAMP[CHART_HEAT_RAMP.length - 1]).toBe("#a15c07");
    expect(CHART_HEAT_RAMP).toHaveLength(5);
  });

  it("su paso más claro no se confunde con una celda vacía", () => {
    expect(CHART_HEAT_RAMP[0]).not.toBe(CHART_HEAT_EMPTY);
  });

  it("recorre sus pasos de menos a más", () => {
    expect(heatStep(0, 0, 100)).toBe(CHART_HEAT_RAMP[0]);
    expect(heatStep(50, 0, 100)).toBe(CHART_HEAT_RAMP[2]);
    expect(heatStep(100, 0, 100)).toBe(CHART_HEAT_RAMP[4]);
  });

  it("sin dato no toma un paso de la rampa: vacío y cero son distintos", () => {
    expect(heatStep(null, 0, 100)).toBe(CHART_HEAT_EMPTY);
    expect(heatStep(0, 0, 100)).not.toBe(CHART_HEAT_EMPTY);
  });

  it("una escala plana no divide por cero", () => {
    expect(heatStep(5, 5, 5)).toBe(CHART_HEAT_RAMP[4]);
  });

  it("no reutiliza un slot categórico: son dos trabajos distintos", () => {
    for (const step of CHART_HEAT_RAMP) {
      expect(CHART_PALETTE).not.toContain(step);
      expect(CHART_PERIOD_PALETTE).not.toContain(step);
    }
  });
});
