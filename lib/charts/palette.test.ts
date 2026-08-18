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
  CHART_RANKING_TAIL_RAMP,
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

/** WCAG relative luminance, para poder afirmar la monotonía de una rampa en vez de suponerla. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrastOnWhite = (hex: string) => 1.05 / (relativeLuminance(hex) + 0.05);

/** Los ejes a/b de OKLab, de donde salen el croma y el hue de un hex. */
function oklabAB(hex: string): [number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Croma en OKLCH: cuánto COLOR lleva un tono, que es lo que separa la cola de las ranuras. */
const chroma = (hex: string) => Math.hypot(...oklabAB(hex));

/** Hue en OKLCH: QUÉ color es, que es lo que hace de la cola una sola gama. */
const hue = (hex: string) => {
  const [a, b] = oklabAB(hex);
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
};

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

describe("CHART_RANKING_TAIL_RAMP · la cola del ranking", () => {
  it("es la gama verde lima medida, de oscuro a claro", () => {
    expect([...CHART_RANKING_TAIL_RAMP]).toEqual([
      "#4e6e16",
      "#5b7a2c",
      "#69863e",
      "#769350",
      "#84a061",
      "#92ad72",
      "#a1ba83",
    ]);
  });

  it("es UNA gama: los siete pasos comparten hue y solo cambia el tono", () => {
    // Lo que la separa de un set de identidad. Si dos pasos tuvieran hues distintos, la cola
    // dejaría de leerse como un tramo y volvería a parecer siete asuntos sueltos.
    const hues = CHART_RANKING_TAIL_RAMP.map((step) => Math.round(hue(step)));
    expect(new Set(hues).size).toBe(1);
  });

  it("las ocho primeras barras siguen siendo las ranuras de identidad", () => {
    // La cola es un añadido, no un reemplazo: el ranking no cambia de aspecto hasta la novena.
    for (let slot = 0; slot < CHART_PALETTE.length; slot++) {
      expect(colorForRankingSlot(slot)).toBe(CHART_PALETTE[slot]);
    }
  });

  it("la novena barra estrena la gama y la decimoquinta la cierra", () => {
    expect(colorForRankingSlot(8)).toBe(CHART_RANKING_TAIL_RAMP[0]);
    expect(colorForRankingSlot(14)).toBe(CHART_RANKING_TAIL_RAMP[6]);
  });

  it("las siete de la cola son DISTINTAS entre sí: ese era el defecto que corrige", () => {
    // Con `colorForEntity` las siete devolvían el mismo `CHART_NEUTRAL` — siete barras iguales
    // justo al fondo de la lista, que es donde se mira para saber qué recortar.
    const tail = Array.from({ length: 7 }, (_, i) => colorForRankingSlot(8 + i));
    expect(new Set(tail).size).toBe(7);
    expect(tail).not.toContain(CHART_NEUTRAL);
  });

  it("es MONÓTONA en luminosidad, que es lo único que se le exige a una escala secuencial", () => {
    // La comprobación que sustituye a la banda y a la separación CVD: aquellas son de un set
    // categórico, donde el color es lo único que distingue dos series. Aquí lo que el tono tiene
    // que hacer es no romper el orden que la longitud de la barra ya dice.
    const lums = CHART_RANKING_TAIL_RAMP.map(relativeLuminance);
    for (let i = 1; i < lums.length; i++) {
      expect(lums[i]).toBeGreaterThan(lums[i - 1]);
    }
  });

  it("su paso más claro sigue siendo un relleno visible sobre la superficie", () => {
    // El piso de una escala ordinal: 2:1 contra el papel. Por debajo, la barra más pequeña —que
    // además es la más corta de las quince— desaparece. Es lo que fija dónde deja de aclararse.
    expect(contrastOnWhite(CHART_RANKING_TAIL_RAMP.at(-1) as string)).toBeGreaterThanOrEqual(2);
  });

  it("es más apagada que TODAS las ranuras de identidad, para que la cola se lea como cola", () => {
    // Son las barras más pequeñas de la lista: un verde vivo las pondría por delante de las ocho
    // de arriba, al revés de lo que el ranking dice. Es también lo que la separa de los dos
    // verdes de identidad y del oliva de la sección de ingresos — comparten familia, no croma.
    const menosSaturadaDeIdentidad = Math.min(...CHART_PALETTE.map(chroma));
    for (const step of CHART_RANKING_TAIL_RAMP) {
      expect(chroma(step)).toBeLessThan(menosSaturadaDeIdentidad);
    }
  });

  it("el corte del ranking se DERIVA, así que ninguna barra dibujada queda sin tono", () => {
    expect(CHART_RANKING_MAX).toBe(CHART_PALETTE.length + CHART_RANKING_TAIL_RAMP.length);
    expect(CHART_RANKING_MAX).toBe(15);
    expect(colorForRankingSlot(CHART_RANKING_MAX - 1)).not.toBe(CHART_NEUTRAL);
    // Una decimosexta sí cae en el neutro — pero no llega, porque el corte es el de arriba.
    expect(colorForRankingSlot(CHART_RANKING_MAX)).toBe(CHART_NEUTRAL);
    expect(colorForRankingSlot(-1)).toBe(CHART_NEUTRAL);
  });

  it("no reutiliza un slot de identidad ni un paso de otra escala", () => {
    for (const step of CHART_RANKING_TAIL_RAMP) {
      expect(CHART_PALETTE).not.toContain(step);
      expect(CHART_DISTRIBUTION_RAMP).not.toContain(step);
      expect(CHART_COMPOSITION_PALETTE).not.toContain(step);
      expect(step).not.toBe(CHART_NEUTRAL);
    }
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
    // El orden importa: las porciones grandes conservan el aspecto que la tarta ya tenía, y la cola
    // —la que aparece de más al no plegarse— toma el set hecho para «una serie con muchas marcas».
    expect(CHART_SLICE_SEQUENCE.slice(0, CHART_COMPOSITION_PALETTE.length)).toEqual([
      ...CHART_COMPOSITION_PALETTE,
    ]);
    expect(CHART_SLICE_SEQUENCE.slice(CHART_COMPOSITION_PALETTE.length)).toEqual([
      ...CHART_PERIOD_PALETTE,
    ]);
  });

  it("da para un anexo real sin repetir ni caer en el neutro", () => {
    // El del hospital trae diecisiete rubros; la secuencia tiene que cubrirlos todos.
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
