import { describe, expect, it } from "vitest";
import {
  CHART_COMPOSITION_MAX,
  CHART_COMPOSITION_PALETTE,
  CHART_DISTRIBUTION_MAX,
  CHART_DISTRIBUTION_RAMP,
  CHART_HEAT_EMPTY,
  CHART_HEAT_RAMP,
  CHART_PERIOD_PALETTE,
  CHART_MARK,
  CHART_MAX_SERIES,
  CHART_NEUTRAL,
  CHART_PALETTE,
  CHART_SIGN,
  colorForCompositionSlot,
  colorForDistributionSlot,
  colorForEntity,
  colorForPeriod,
  heatStep,
} from "./palette";

const CENTERS = ["consolidado", "cultura-manor", "centro-de-costo-principal", "sin-centro"];

describe("el orden de las ranuras", () => {
  it("keeps the eight slots in the sequence that makes them separable", () => {
    expect([...CHART_PALETTE]).toEqual([
      "#1466c8",
      "#f4501a",
      "#00c98a",
      "#ef9c00",
      "#f4629b",
      "#0b7a12",
      "#5b2fd6",
      "#ec2d2d",
    ]);
    expect(CHART_MAX_SERIES).toBe(8);
  });

  it("gives the third compared entity slot 3, whatever else is on screen", () => {
    expect(colorForEntity("centro-de-costo-principal", CENTERS)).toBe("#00c98a");
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

describe("CHART_DISTRIBUTION_RAMP · la pila ordenada", () => {
  it("es la escala medida, de azul marino a verde claro", () => {
    expect([...CHART_DISTRIBUTION_RAMP]).toEqual([
      "#1a237e",
      "#1550e0",
      "#2f93ff",
      "#00a651",
      "#45de88",
      CHART_NEUTRAL,
    ]);
  });

  it("son cinco pasos y el neutro: el arco no da para más sin juntar dos vecinos", () => {
    // El corte no es estético — a ocho pasos el peor par vecino cae a ΔE 8, bajo el piso de
    // visión normal, y en una pila los vecinos son justo lo que hay que distinguir.
    expect(CHART_DISTRIBUTION_MAX).toBe(6);
    expect(CHART_DISTRIBUTION_MAX).toBeLessThan(CHART_MAX_SERIES);
    expect(CHART_DISTRIBUTION_RAMP.at(-1)).toBe(CHART_NEUTRAL);
  });

  it("da el tono por el lugar en la pila, que es el tamaño de la cuenta", () => {
    expect(colorForDistributionSlot(0)).toBe(CHART_DISTRIBUTION_RAMP[0]);
    expect(colorForDistributionSlot(5)).toBe(CHART_NEUTRAL);
  });

  it("un séptimo segmento cae en el neutro: no se inventa un paso", () => {
    expect(colorForDistributionSlot(6)).toBe(CHART_NEUTRAL);
    expect(colorForDistributionSlot(-1)).toBe(CHART_NEUTRAL);
  });

  it("no reutiliza un slot de identidad: son dos trabajos distintos", () => {
    for (const step of CHART_DISTRIBUTION_RAMP) {
      expect(CHART_PALETTE).not.toContain(step);
    }
  });
});

describe("CHART_COMPOSITION_PALETTE · el reparto de la tarta", () => {
  it("es el set cálido medido, del rojo al magenta", () => {
    expect([...CHART_COMPOSITION_PALETTE]).toEqual([
      "#e02b2b",
      "#ff8a00",
      "#00836f",
      "#6fa428",
      "#0f5bb5",
      "#c2185b",
    ]);
  });

  it("NO son los tonos de la referencia, y por eso no hay ningún rojo puro", () => {
    // `#ff0000` y `#ff5600` daban ΔE 7.6 en visión NORMAL: la porción del 30 % y la del 20 %
    // eran casi el mismo rojo para cualquiera. Allí lo salvaba el «20%» impreso dentro de la
    // porción; aquí los rótulos van fuera, así que ese relieve no existe.
    for (const hex of ["#ff0000", "#ff5600", "#ff8500", "#99aa27"]) {
      expect(CHART_COMPOSITION_PALETTE).not.toContain(hex);
    }
    // El teal sí se conserva: es uno de los cinco de la referencia y pasa tal cual.
    expect(CHART_COMPOSITION_PALETTE).toContain("#00836f");
  });

  it("cubre el corte de la tarta entero, así que «Otros» no cae en el neutro", () => {
    expect(CHART_COMPOSITION_MAX).toBe(6);
    expect(CHART_COMPOSITION_PALETTE).not.toContain(CHART_NEUTRAL);
  });

  it("no reutiliza un slot de identidad: son dos trabajos distintos", () => {
    for (const hue of CHART_COMPOSITION_PALETTE) {
      expect(CHART_PALETTE).not.toContain(hue);
    }
  });

  it("da el tono por el lugar en el reparto, que es el tamaño de la porción", () => {
    expect(colorForCompositionSlot(0)).toBe(CHART_COMPOSITION_PALETTE[0]);
    expect(colorForCompositionSlot(5)).toBe(CHART_COMPOSITION_PALETTE[5]);
  });

  it("una séptima porción cae en el neutro: no se inventa un tono", () => {
    expect(colorForCompositionSlot(6)).toBe(CHART_NEUTRAL);
    expect(colorForCompositionSlot(-1)).toBe(CHART_NEUTRAL);
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
