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
  CHART_RANKING_MAX,
  CHART_RANKING_SEQUENCE,
  CHART_SLICE_MAX,
  CHART_SLICE_SEQUENCE,
  CHART_SIGN,
  colorForCompositionSlot,
  colorForDistributionSlot,
  colorForEntity,
  colorForPeriod,
  colorForRankingSlot,
  colorForSliceSlot,
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
    // None of them is the full hue of the identity set: they are mixes toward grey.
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
    // They share the first ones by design (same brand family), but the set is longer.
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
    // The cut is not aesthetic — at eight steps the worst neighbouring pair drops to ΔE 8, below the
    // normal-vision floor, and in a stack neighbours are exactly what has to be told apart.
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
    // `#ff0000` and `#ff5600` gave ΔE 7.6 in NORMAL vision: the 30 % slice and the 20 % one were
    // almost the same red to anyone. There it was saved by the «20%» printed inside the slice; here
    // the labels go outside, so that relief does not exist.
    for (const hex of ["#ff0000", "#ff5600", "#ff8500", "#99aa27"]) {
      expect(CHART_COMPOSITION_PALETTE).not.toContain(hex);
    }
    // The teal is kept: it is one of the reference's five and passes as it is.
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

describe("CHART_RANKING_SEQUENCE · las quince barras del ranking", () => {
  it("son las ocho de identidad seguidas de los doce del periodo", () => {
    expect([...CHART_RANKING_SEQUENCE]).toEqual([...CHART_PALETTE, ...CHART_PERIOD_PALETTE]);
  });

  it("las ocho primeras barras siguen siendo las ranuras de identidad", () => {
    // The tail is an addition, not a replacement: the ranking does not change look until the ninth
    for (let slot = 0; slot < CHART_PALETTE.length; slot++) {
      expect(colorForRankingSlot(slot)).toBe(CHART_PALETTE[slot]);
    }
  });

  it("la novena barra estrena el set del periodo", () => {
    expect(colorForRankingSlot(8)).toBe(CHART_PERIOD_PALETTE[0]);
    expect(colorForRankingSlot(14)).toBe(CHART_PERIOD_PALETTE[6]);
  });

  it("las quince son DISTINTAS entre sí: ese es el defecto que corrige", () => {
    const drawn = Array.from({ length: CHART_RANKING_MAX }, (_, i) => colorForRankingSlot(i));
    expect(new Set(drawn).size).toBe(CHART_RANKING_MAX);
    expect(drawn).not.toContain(CHART_NEUTRAL);
  });

  it("no arranca por el set de la tarta, que se dibuja justo encima en la misma pantalla", () => {
    // `CHART_SLICE_SEQUENCE` starts with the six warm hues of «Composición de los ingresos», which
    // sits above the ranking; with them the first six bars would take the hue of its six rows and,
    // since in both the colour goes by POSITION, it would read as though row 1 of one were row 1 of
    // the other. They are disjoint sets, so starting with identity is what avoids the clash.
    for (const slot of CHART_COMPOSITION_PALETTE) {
      expect(CHART_RANKING_SEQUENCE).not.toContain(slot);
    }
  });

  it("el corte cabe en la secuencia, así que ninguna barra dibujada queda sin tono", () => {
    // The invariant that used to be an accidental identity (8 + 7 = 15). Fifteen is the legibility
    // limit the firm asked for and the sequence gives twenty: what has to hold is the «≤».
    expect(CHART_RANKING_MAX).toBe(15);
    expect(CHART_RANKING_MAX).toBeLessThanOrEqual(CHART_RANKING_SEQUENCE.length);
    expect(colorForRankingSlot(CHART_RANKING_MAX - 1)).not.toBe(CHART_NEUTRAL);
  });

  it("pasada la secuencia se cae en el neutro: no se inventa un tono", () => {
    expect(colorForRankingSlot(CHART_RANKING_SEQUENCE.length)).toBe(CHART_NEUTRAL);
    expect(colorForRankingSlot(-1)).toBe(CHART_NEUTRAL);
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

describe("CHART_SLICE_SEQUENCE · la tarta que nombra todas sus porciones", () => {
  it("encadena los seis cálidos de la composición y los doce del periodo", () => {
    // The order matters: the large slices keep the look the pie already had, and the tail —the part
    // that appears extra by not being folded— takes the set made for «one series with many marks».
    expect(CHART_SLICE_SEQUENCE.slice(0, CHART_COMPOSITION_PALETTE.length)).toEqual([
      ...CHART_COMPOSITION_PALETTE,
    ]);
    expect(CHART_SLICE_SEQUENCE.slice(CHART_COMPOSITION_PALETTE.length)).toEqual([
      ...CHART_PERIOD_PALETTE,
    ]);
  });

  it("da para un anexo real sin repetir ni caer en el neutro", () => {
    // The hospital's carries seventeen lines; the sequence has to cover them all.
    expect(CHART_SLICE_MAX).toBe(18);
    expect(new Set(CHART_SLICE_SEQUENCE).size).toBe(CHART_SLICE_MAX);
    expect(CHART_SLICE_SEQUENCE).not.toContain(CHART_NEUTRAL);
    for (let slot = 0; slot < CHART_SLICE_MAX; slot++) {
      expect(colorForSliceSlot(slot)).not.toBe(CHART_NEUTRAL);
    }
  });

  it("la decimonovena cae en el neutro: no se inventa un tono", () => {
    expect(colorForSliceSlot(CHART_SLICE_MAX)).toBe(CHART_NEUTRAL);
    expect(colorForSliceSlot(-1)).toBe(CHART_NEUTRAL);
  });
});
