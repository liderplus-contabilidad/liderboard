import { describe, expect, it } from "vitest";
import {
  is3DOption,
  type Chart3DOption,
  type ChartOption,
  type ChartParam,
} from "@/lib/charts/types";
import {
  CHART_NEUTRAL,
  CHART_STAGE,
  CHART_STAGE_LIGHT,
  CHART_STAGE_MATERIAL,
  CHART_STAGE_SKY,
  colorForSliceSlot,
  stageColor,
  stageSliceColor,
} from "@/lib/charts/palette";
import { buildPersonnelCards, CONCEPT_SLICES, type PersonnelCardsInput } from "./cards";

/** Narrows a card that CAN come out in three dimensions, asserting it did not. */
function flat(option: ChartOption | Chart3DOption | null): ChartOption {
  expect(option).not.toBeNull();
  expect(is3DOption(option as ChartOption | Chart3DOption)).toBe(false);
  return option as ChartOption;
}
/** La fila del suelo en la que descansa una serie del skyline: cuanto más alta, más al fondo. */
function depthOf(option: Chart3DOption, name: string): number {
  const series = option.series.find((entry) => entry.name === name);
  if (!series) {
    throw new Error(`El skyline no dibujó «${name}»`);
  }
  return (series.data[0].value as number[])[1];
}

import { readPersonnelCost } from "./derive";
import {
  GOLDEN_ACCOUNTS,
  GOLDEN_CONCEPT_TOTALS,
  GOLDEN_COVERAGE,
  goldenYear,
  legacyYear,
} from "./fixtures";

const SPAN = GOLDEN_COVERAGE;

function cards(
  years = [goldenYear()],
  groups: PersonnelCardsInput["groups"] = [],
  span: readonly number[] = SPAN,
  evolutionView: PersonnelCardsInput["evolutionView"] = "apilada",
) {
  return buildPersonnelCards({
    reading: readPersonnelCost(years, span),
    groups,
    period: "Ene–Jun 2026",
    evolutionView,
  });
}

describe("Un año pone los MESES en el eje; varios, los ejercicios", () => {
  it("con uno, doce categorías como mucho y las del tramo", () => {
    const { sections } = cards();
    expect(sections.option?.xAxis).toMatchObject({
      data: ["Ene", "Feb", "Mar", "Abr", "May", "Jun"],
    });
  });

  it("con varios, una categoría por ejercicio y ningún control de por medio", () => {
    const { sections, groups } = cards([goldenYear({ year: 2025 }), goldenYear()]);
    expect(sections.option?.xAxis).toMatchObject({ data: ["2025", "2026"] });
    // La evolución NO cambia de eje: los meses se quedan, y lo que pasa a comparar son los
    // ejercicios — que es justo el detalle que la tabla del comparativo suelta.
    expect(flat(groups.option).xAxis).toMatchObject({
      data: ["Ene", "Feb", "Mar", "Abr", "May", "Jun"],
    });
    expect(flat(groups.option).series.map((entry) => entry.name)).toEqual([
      "2025",
      "2026",
      "Total",
    ]);
    expect(groups.title).toBe("Evolución mensual por ejercicio");
  });
});

describe("Planta vs Externos", () => {
  const { sections } = cards();

  it("apila las dos secciones y les pone encima la línea del total, como la evolución", () => {
    expect(sections.option?.series.map((entry) => entry.name)).toEqual([
      "Planta",
      "Externos",
      "Total",
    ]);
    const bars = sections.option?.series.filter((entry) => entry.type === "bar") ?? [];
    expect(bars.every((entry) => entry.stack === "costo")).toBe(true);
    const total = sections.option?.series.find((entry) => entry.name === "Total");
    expect(total?.type).toBe("line");
    // La línea ES el techo de la pila: enero suma 55,989.00 + 48,214.12.
    expect(total?.data[0]).toBeCloseTo(104203.12, 2);
    // Y es la única que escribe la cifra: las bandas no llevan rótulo.
    expect(total?.label).toBeDefined();
    expect(bars.every((entry) => entry.label === undefined)).toBe(true);
  });

  it("la tabla gemela cierra en el total real de cada mes", () => {
    const enero = sections.table.rows[0];
    expect(enero.values).toEqual(["$55,989.00", "$48,214.12", "$104,203.12"]);
  });

  it("la nota dice los dos porcentajes sobre ventas, que es la conclusión del reporte", () => {
    expect(sections.note).toBe("Sobre ventas: planta 27.5 %, externos 22.6 %.");
  });

  it("una marca de «Grupo» acota cada sección a sus grupos marcados y calla la que no tiene ninguno", () => {
    const { sections, groups } = cards([goldenYear()], ["afiliados"]);
    expect(sections.option?.series.map((entry) => entry.name)).toEqual(["Planta", "Total"]);
    // Planta acotada a Afiliados es la serie de Afiliados de la evolución, cifra por cifra.
    const afiliados = flat(groups.option).series.find((entry) => entry.name === "Afiliados");
    expect(sections.option?.series[0].data).toEqual(afiliados?.data);
    expect(sections.table.columns).toEqual(["Planta", "Total"]);
    expect(sections.note).toMatch(/^Sobre ventas: planta [\d.]+ %\.$/);
  });

  it("marcar Honorarios médicos deja solo Externos", () => {
    const { sections } = cards([goldenYear()], ["honorarios-medicos"]);
    expect(sections.option?.series.map((entry) => entry.name)).toEqual(["Externos", "Total"]);
  });

  it("un ejercicio tipeado no tiene grupos, así que la marca no le quita ninguna sección", () => {
    const marked = buildPersonnelCards({
      reading: readPersonnelCost([legacyYear()], [0, 1]),
      groups: ["afiliados"],
      period: "Ene–Feb 2019",
    });
    expect(marked.sections.option?.series.map((entry) => entry.name)).toEqual([
      "Planta",
      "Externos",
      "Total",
    ]);
  });
});

describe("El tooltip de las dos pilas dice el porcentaje sobre ventas", () => {
  const row = (seriesId: string, seriesName: string, value: number | null, dataIndex = 0) => ({
    name: "Ene",
    seriesId,
    seriesName,
    value,
    dataIndex,
  });

  it("«Planta vs Externos», un año: cada sección y el total contra las ventas de ESE mes", () => {
    const { sections } = cards();
    const html = sections.option?.tooltip?.formatter?.([
      row("section-planta", "Planta", 55989),
      row("section-externos", "Externos", 48214.12),
      row("sections-total", "Total", 104203.12),
    ]);
    // Enero: 55,989.00 / 240,314.07 = 23.3 %; 48,214.12 → 20.1 %; el total 43.4 %.
    expect(html).toContain("$55,989.00");
    expect(html).toContain("23.3 % de ventas");
    expect(html).toContain("20.1 % de ventas");
    expect(html).toContain("43.4 % de ventas");
  });

  it("comparando ejercicios divide por las ventas del ejercicio de la columna", () => {
    const { sections } = cards([goldenYear({ year: 2025 }), goldenYear()]);
    const html = sections.option?.tooltip?.formatter?.([
      row("sections-total", "Total", 723857.09, 1),
    ]);
    // Ene–Jun 2026: 723,857.09 / (6 × 240,314.07) = 50.2 %.
    expect(html).toContain("50.2 % de ventas");
  });

  it("la evolución por grupo hace lo mismo, y por ejercicio divide cada línea por SUS ventas", () => {
    const one = cards();
    const html = flat(one.groups.option).tooltip?.formatter?.([
      row("evolution-total", "Total", 104203.12),
    ]);
    expect(html).toContain("43.4 % de ventas");

    const several = cards([goldenYear({ year: 2025 }), goldenYear()]);
    const compared = flat(several.groups.option).tooltip?.formatter?.([
      row("evolution-2026", "2026", 104203.12),
    ]);
    expect(compared).toContain("43.4 % de ventas");
  });

  it("sin ventas conocidas no escribe porcentaje: nunca «0 %»", () => {
    const typed = buildPersonnelCards({
      reading: readPersonnelCost(
        [legacyYear({ revenue: Array.from({ length: 12 }, () => 0) })],
        [0, 1],
      ),
      groups: [],
      period: "Ene–Feb 2019",
    });
    const html = typed.sections.option?.tooltip?.formatter?.([
      row("sections-total", "Total", 3750),
    ]);
    expect(html).toContain("$3,750.00");
    expect(html).not.toContain("de ventas");
  });
});

describe("Cada gemela tiene tantas columnas como valores lleva cada fila", () => {
  // `ChartCard` encabeza la columna de la etiqueta por su cuenta («Serie»), así que una columna de
  // más deja la última vacía y corre todas las cifras una posición a la izquierda. Pasó, y se veía.
  it.each([
    ["sections", cards().sections],
    ["groups", cards().groups],
    ["concepts", cards().concepts],
  ])("%s", (_name, card) => {
    for (const row of card.table.rows) {
      expect(row.values, row.label).toHaveLength(card.table.columns.length);
    }
  });
});

describe("Composición por concepto", () => {
  const { concepts } = cards();

  it("ordena por monto y encabeza con los honorarios médicos externos", () => {
    expect(concepts.table.rows[0].label).toBe("Honorarios Médicos-Externos");
    expect(concepts.table.rows[0].values[0]).toBe("$280,966.57");
  });

  it("dobla la cola en UNA barra en vez de truncar, y lo dice", () => {
    const bars = concepts.option?.series[0].data ?? [];
    expect(bars).toHaveLength(CONCEPT_SLICES + 1);
    expect(concepts.note).toContain("conceptos más suman");
  });

  it("la tabla lista TODOS los conceptos y cierra contra el total", () => {
    const last = concepts.table.rows.at(-1);
    expect(last?.label).toBe("Total costo de personal");
    expect(last?.values[0]).toBe("$721,764.14");
    // Diecinueve conceptos con movimiento (dos están en cero los seis meses) más el total.
    expect(concepts.table.rows).toHaveLength(20);
  });

  it("el porcentaje es sobre el COSTO y no sobre las ventas, y la columna lo declara", () => {
    expect(concepts.table.columns).toEqual(["Monto", "% del costo"]);
    // 280,966.57 / 721,764.14 = 38.9 %
    expect(concepts.table.rows[0].values[1]).toBe("38.9 %");
  });
});

describe("El grupo acota TODA la pantalla", () => {
  it("la pila deja de tener las bandas que no se marcaron", () => {
    const { groups } = cards([goldenYear()], ["afiliados"]);
    expect(flat(groups.option).series.map((entry) => entry.name)).toEqual(["Afiliados", "Total"]);
  });

  it("el ranking sólo cuenta los conceptos de los grupos marcados", () => {
    const { concepts } = cards([goldenYear()], ["afiliados"]);
    const labels = concepts.table.rows.map((row) => row.label);
    expect(labels).toContain("Administración (Familia Durán)");
    expect(labels).not.toContain("Honorarios Médicos-Externos");
  });
});

describe("Ningún constructor escribe un hex, y una cifra tiene UN color", () => {
  const built = cards();
  const color = (card: "sections" | "groups", name: string) =>
    (card === "sections" ? built.sections.option : flat(built.groups.option))?.series.find(
      (entry) => entry.name === name,
    )?.itemStyle?.color;

  it("«Externos» y «Honorarios médicos» son el mismo color porque son la misma cifra", () => {
    expect(color("sections", "Externos")).toBe(color("groups", "Honorarios médicos"));
  });

  it("«Planta» no toma el color de ninguna de sus dos partes: es la suma de ambas", () => {
    const planta = color("sections", "Planta");
    expect(planta).not.toBe(color("groups", "Afiliados"));
    expect(planta).not.toBe(color("groups", "No afiliados"));
  });

  it("las cuatro entidades del universo no colisionan entre sí", () => {
    const used = new Set(
      [
        color("sections", "Planta"),
        color("groups", "Afiliados"),
        color("groups", "No afiliados"),
        color("groups", "Honorarios médicos"),
      ].filter(Boolean),
    );
    expect(used.size).toBe(4);
  });
});

describe("Sin nada que dibujar", () => {
  it("la card no inventa un gráfico vacío: devuelve `null` y dice por qué", () => {
    const built = cards([goldenYear()], [], [10, 11]);
    expect(built.sections.option).toBeNull();
    expect(built.concepts.option).toBeNull();
  });
});

describe("La línea del total sobre la pila", () => {
  const { groups } = cards();
  const option = flat(groups.option);

  it("va en TINTA y no en un paso de la paleta: no es un cuarto grupo", () => {
    const line = option.series.find((entry) => entry.name === "Total");
    expect(line?.type).toBe("line");
    expect(line?.lineStyle?.color).toBe("#1e293b");
    // Sobre las barras, nunca debajo: una línea escondida tras la pila que mide es una línea que no
    // está.
    expect(line?.z).toBe(3);
  });

  it("dibuja el techo real de la pila, mes a mes", () => {
    const line = option.series.find((entry) => entry.name === "Total");
    expect(line?.data[0]).toBeCloseTo(104203.12, 2);
    expect(line?.data[5]).toBeCloseTo(144277.59, 2);
  });

  it("la gemela cierra con su propia columna Total", () => {
    expect(groups.table.columns.at(-1)).toBe("Total");
    expect(groups.table.rows[0].values.at(-1)).toBe("$104,203.12");
    expect(groups.table.rows[0].values).toHaveLength(groups.table.columns.length);
  });

  it("un mes sin cargar no le pone un cero al total", () => {
    const partial = cards([goldenYear({ coverage: [0, 1] })], [], [0, 1, 2]);
    const line = flat(partial.groups.option).series.find((entry) => entry.name === "Total");
    // El eje sólo lleva los meses que el ejercicio cubre, así que no hay hueco que rellenar.
    expect(line?.data).toHaveLength(2);
  });
});

describe("El skyline", () => {
  it("se ofrece sólo cuando hay algo que poner en el eje de profundidad", () => {
    expect(cards().skylineAvailable).toBe(true);
    // Un solo grupo marcado: no hay profundidad, y el control no se dibuja.
    expect(cards([goldenYear()], ["afiliados"]).skylineAvailable).toBe(false);
    // Sin tramo tampoco.
    expect(cards([goldenYear()], [], [10, 11]).skylineAvailable).toBe(false);
  });

  it("es la MISMA lectura con el eje de profundidad libre: mes × grupo × monto", () => {
    const { groups } = cards([goldenYear()], [], SPAN, "skyline");
    const option = groups.option as Chart3DOption;
    expect(is3DOption(option)).toBe(true);
    expect(option.xAxis3D.data).toEqual(["Ene", "Feb", "Mar", "Abr", "May", "Jun"]);
    expect(option.series.every((entry) => entry.type === "bar3D")).toBe(true);
    expect(option.series).toHaveLength(3);
  });

  it("pone la serie MAYOR al fondo, que es lo único que hace legible una matriz en perspectiva", () => {
    const { groups } = cards([goldenYear()], [], SPAN, "skyline");
    // Honorarios médicos (pico de $77,380 en junio) es la mayor y va al fondo.
    expect(depthOf(groups.option as Chart3DOption, "Honorarios médicos")).toBe(2);
    expect(depthOf(groups.option as Chart3DOption, "No afiliados")).toBe(0);
  });

  it("los EJERCICIOS van en orden, no por altura: el más antiguo al fondo", () => {
    // 2026 trae un solo mes de $144,277, más alto que cualquiera de 2025 ($139,731): por pico iría
    // al fondo y el eje leería «2026 · 2025». Un año se busca por su posición, así que el orden es
    // el cronológico y la altura no lo mueve.
    const { groups } = cards(
      [goldenYear({ year: 2025, coverage: [0, 1] }), goldenYear({ coverage: [5] })],
      [],
      SPAN,
      "skyline",
    );
    const option = groups.option as Chart3DOption;
    expect(depthOf(option, "2025")).toBe(1);
    expect(depthOf(option, "2026")).toBe(0);
    expect(option.yAxis3D.data).toEqual(["2026", "2025"]);
  });

  it("el color se traduce al escenario POR RANURA: la identidad se queda, el tono no", () => {
    const stacked = cards();
    const sky = cards([goldenYear()], [], SPAN, "skyline");
    const flatColor = flat(stacked.groups.option).series.find((entry) => entry.name === "Afiliados")
      ?.itemStyle?.color;
    const skyColor = (sky.groups.option as Chart3DOption).series.find(
      (entry) => entry.name === "Afiliados",
    )?.itemStyle?.color;
    // Sobre el navío la escala clara no llega a 3:1, así que el escenario tiene la suya: un grupo es
    // el mismo color en TODAS las 3D, aunque no sea el que lleva en las tarjetas blancas.
    expect(skyColor).toBe(stageColor(flatColor as string));
    expect(skyColor).not.toBe(flatColor);
  });

  it("comparando ejercicios la profundidad son los AÑOS y los meses siguen en el eje", () => {
    const { groups } = cards([goldenYear({ year: 2025 }), goldenYear()], [], SPAN, "skyline");
    const option = groups.option as Chart3DOption;
    expect(option.xAxis3D.data).toEqual(["Ene", "Feb", "Mar", "Abr", "May", "Jun"]);
    expect(option.series.map((entry) => entry.name).sort()).toEqual(["2025", "2026"]);
  });

  it("gasta más alto que el plano: la perspectiva ocupa lo que un dibujo llano no", () => {
    expect(cards([goldenYear()], [], SPAN, "skyline").groups.height).toBeGreaterThan(
      cards().groups.height,
    );
  });

  it("se dibuja sobre EL ESCENARIO, con el aparejo que le saca el canto a un sólido", () => {
    const option = cards([goldenYear()], [], SPAN, "skyline").groups.option as Chart3DOption;
    expect(option.grid3D.environment).toBe(CHART_STAGE_SKY);
    expect(option.grid3D.light).toBe(CHART_STAGE_LIGHT);
    for (const entry of option.series) {
      expect(entry.shading).toBe("realistic");
      expect(entry.realisticMaterial).toBe(CHART_STAGE_MATERIAL);
    }
    // La leyenda se va ARRIBA: la cámara mira hacia abajo, así que abajo es donde cae la lectura.
    expect(option.legend?.top).toBe(6);
    expect(option.legend?.bottom).toBe("auto");
    expect(option.tooltip?.backgroundColor).toBe(CHART_STAGE.panel);
  });

  it("el hover no declara un borde que gl ignora: escribe la cifra, y como moneda", () => {
    const option = cards([goldenYear()], [], SPAN, "skyline").groups.option as Chart3DOption;
    for (const entry of option.series) {
      expect(entry.emphasis?.itemStyle).toBeUndefined();
    }
    const label = option.series[0].emphasis?.label;
    expect(label?.show).toBe(true);
    // Sin formateador, gl escribe el dato crudo: «39684.6195…» en vez de un monto.
    expect(label?.formatter?.({ value: [0, 0, 39684.6195], seriesName: "" })).toBe("$39,684.62");
  });
});

describe("La cifra sobre la columna", () => {
  /** Lo que el renderizador le pasa al formateador de una etiqueta. */
  const param = (dataIndex: number, value: number | null): ChartParam => ({
    name: "",
    value,
    dataIndex,
  });

  /** Las series que ESCRIBEN una cifra, que nunca deberían ser más de una por tarjeta. */
  const writing = (option: ChartOption | null) =>
    (option?.series ?? []).filter((entry) => entry.label?.show);

  it("la pila escribe el TOTAL del mes, y lo escribe la línea del total y no una banda", () => {
    const { sections } = cards();
    const written = writing(sections.option);
    expect(written.map((entry) => entry.name)).toEqual(["Total"]);
    const label = written[0].label;
    expect(label?.position).toBe("top");
    // Enero: 55,989.00 de planta + 48,214.12 de externos.
    expect(label?.formatter?.(param(0, 104203.12))).toBe("$104,203.12");
    expect(label?.formatter?.(param(5, 0))).toBe("$144,277.59");
  });

  it("sin externos la línea sigue siendo la que escribe, y vale lo que planta", () => {
    const soloPlanta = new Map(
      [...GOLDEN_ACCOUNTS].filter(([code]) => !code.startsWith("5.3.03.")),
    );
    const { sections } = cards([goldenYear({ accounts: soloPlanta })]);
    const written = writing(sections.option);
    expect(written.map((entry) => entry.name)).toEqual(["Total"]);
    expect(written[0].label?.formatter?.(param(0, 55989))).toBe("$55,989.00");
  });

  it("un mes sin cargar no escribe un cero: no hay cifra que escribir", () => {
    const parcial = cards([goldenYear({ coverage: [0, 1] })], [], [0, 1, 2]);
    const label = writing(parcial.sections.option)[0]?.label;
    expect(label?.formatter?.(param(9, null))).toBe("");
  });

  it("en la evolución la lleva la LÍNEA del total, que ya es la cifra de la columna", () => {
    const { groups } = cards();
    const written = writing(flat(groups.option));
    expect(written.map((entry) => entry.name)).toEqual(["Total"]);
    expect(written[0].type).toBe("line");
    expect(written[0].label?.formatter?.(param(0, 104203.12))).toBe("$104,203.12");
  });

  it("le abre sitio a la fila de arriba, que `outerBoundsContain` no reserva", () => {
    const { sections, groups } = cards();
    expect(Number(sections.option?.grid?.top)).toBeGreaterThan(12);
    expect(Number(flat(groups.option).grid?.top)).toBeGreaterThan(12);
    expect(sections.option?.grid?.outerBoundsContain).toBe("axisLabel");
    expect(flat(groups.option).grid?.outerBoundsContain).toBe("axisLabel");
  });

  it("el skyline no escribe ninguna: en perspectiva la cifra flota sobre nada", () => {
    const { groups } = cards([goldenYear()], [], SPAN, "skyline");
    expect((groups.option as Chart3DOption).series.every((entry) => !("label" in entry))).toBe(
      true,
    );
  });
});

describe("Las tres lecturas pueden ponerse de pie", () => {
  const solid = (which: "sections" | "concepts", years = [goldenYear()]) => {
    const built = buildPersonnelCards({
      reading: readPersonnelCost(years, SPAN),
      groups: [],
      period: "Ene–Jun 2026",
      solidViews: { [which]: "solido" },
    });
    const option = built[which].option;
    expect(option).not.toBeNull();
    expect(is3DOption(option as ChartOption | Chart3DOption)).toBe(true);
    return { card: built[which], option: option as Chart3DOption };
  };

  it("por omisión ninguna lo está: el plano es lo que abre", () => {
    const built = cards();
    expect(is3DOption(built.sections.option as ChartOption)).toBe(false);
    expect(is3DOption(built.concepts.option as ChartOption)).toBe(false);
  });

  it("el sólido gasta el alto que la perspectiva pide, y la gemela no se mueve", () => {
    const flatCard = cards().sections;
    const { card, option } = solid("sections");
    expect(card.height).toBeGreaterThan(flatCard.height as number);
    // La tabla es la MISMA: el sólido es otra forma de la misma lectura, no otra lectura.
    expect(card.table).toEqual(flatCard.table);
    expect(option.grid3D.environment).toBe(CHART_STAGE_SKY);
  });

  it("lo que la pila apila, la profundidad lo separa: una fila por sección", () => {
    const { option } = solid("sections");
    expect(option.series.map((entry) => entry.name).sort()).toEqual(["Externos", "Planta"]);
    // Externos pica más alto que planta (junio: $77,380 contra $73,006), así que va al fondo — y el
    // eje de profundidad se rotula de atrás hacia delante.
    expect(option.yAxis3D.data).toEqual(["Externos", "Planta"]);
  });

  it("el ranking es UNA fila y el color lo lleva cada columna, traducido al escenario", () => {
    const { option } = solid("concepts");
    expect(option.series).toHaveLength(1);
    const colors = option.series[0].data.map((datum) => datum.itemStyle?.color);
    expect(colors[0]).toBe(stageSliceColor(colorForSliceSlot(0)));
    // La cola doblada es NEUTRA aquí también: no es la novena entidad.
    expect(colors.at(-1)).toBe(stageColor(CHART_NEUTRAL));
  });

  it("sin nada que dibujar tampoco hay sólido que ofrecer", () => {
    const built = buildPersonnelCards({
      reading: readPersonnelCost([goldenYear()], [10, 11]),
      groups: [],
      period: "Nov–Dic 2026",
      solidViews: { sections: "solido", concepts: "solido" },
    });
    expect(built.sections.option).toBeNull();
    expect(built.concepts.option).toBeNull();
  });
});

describe("Las tarjetas ante un ejercicio TIPEADO", () => {
  const typed = (years = [legacyYear()], span: readonly number[] = [0, 1]) =>
    buildPersonnelCards({
      reading: readPersonnelCost(years, span),
      groups: [],
      period: "Ene–Feb 2019",
      evolutionView: "apilada",
    });

  it("la evolución compara SECCIONES, que es el único nivel que ese año conoce", () => {
    const { groups } = typed();
    expect(flat(groups.option).series.map((entry) => entry.name)).toEqual([
      "Planta",
      "Externos",
      "Total",
    ]);
  });

  it("«Planta vs Externos» se dibuja igual: las dos secciones existen en las dos formas", () => {
    const { sections } = typed();
    expect(sections.option?.series.map((entry) => entry.name)).toEqual([
      "Planta",
      "Externos",
      "Total",
    ]);
    expect(sections.table.rows[0].values).toEqual(["$1,750.00", "$2,000.00", "$3,750.00"]);
  });

  it("el ranking lista las cuatro líneas tecleadas", () => {
    const { concepts } = typed();
    // Ordenado por monto, como el de siempre: personal $2,100 · externos $2,000 · familia $500 · $250.
    expect(concepts.table.rows.map((row) => row.label)).toEqual([
      "Afiliado personal",
      "Externos",
      "Afiliado familia",
      "Factura familia",
      "Total costo de personal",
    ]);
  });

  it("una marca de «Grupo» no puede esconder unas líneas que no tienen grupo", () => {
    const marked = buildPersonnelCards({
      reading: readPersonnelCost([legacyYear()], [0, 1]),
      groups: ["afiliados"],
      period: "Ene–Feb 2019",
    });
    expect(marked.concepts.table.rows).toHaveLength(5);
  });
});

describe("«% vs ventas por nivel» se navega de fuera hacia dentro", () => {
  const revenue = 240314.07 * 6;
  const planta =
    GOLDEN_CONCEPT_TOTALS.familia +
    GOLDEN_CONCEPT_TOTALS.administracion +
    GOLDEN_CONCEPT_TOTALS["mano-obra-directa"] +
    GOLDEN_CONCEPT_TOTALS["mano-obra-indirecta"] +
    GOLDEN_CONCEPT_TOTALS["honorarios-medicos-planta"] +
    GOLDEN_CONCEPT_TOTALS["honorarios-imagenologia-planta"] +
    GOLDEN_CONCEPT_TOTALS["honorarios-enfermeria-planta"] +
    GOLDEN_CONCEPT_TOTALS["honorarios-laboratorio-planta"] +
    GOLDEN_CONCEPT_TOTALS["honorarios-fisioterapia-planta"] +
    GOLDEN_CONCEPT_TOTALS["honorarios-farmacia-planta"] +
    GOLDEN_CONCEPT_TOTALS["honorarios-otros-planta"] +
    GOLDEN_CONCEPT_TOTALS["honorarios-asesoria-contable"] +
    GOLDEN_CONCEPT_TOTALS["servicios-prestados-planta"];

  function shares(
    sharesPath?: PersonnelCardsInput["sharesPath"],
    groups: PersonnelCardsInput["groups"] = [],
  ) {
    return buildPersonnelCards({
      reading: readPersonnelCost([goldenYear()], SPAN),
      groups,
      period: "Ene–Jun 2026",
      sharesPath,
    });
  }

  it("arranca en el total: las dos secciones, cada una sobre las ventas del MISMO tramo", () => {
    const { shares: card, sharesEntries, sharesCrumbs } = shares();
    expect(sharesCrumbs.map((crumb) => crumb.label)).toEqual(["Total"]);
    expect(sharesEntries.map((entry) => entry.id)).toEqual(["planta", "externos"]);
    expect(flat(card.option).yAxis).toMatchObject({ data: ["Planta", "Externos"], inverse: true });
    const [series] = flat(card.option).series;
    expect((series.data[0] as { value: number }).value).toBeCloseTo((planta / revenue) * 100, 6);
    // La fila en negrita es el nivel de arriba: el total del costo sobre las ventas.
    const total = card.table.rows.at(-1);
    expect(total).toMatchObject({ id: "parent", label: "Total costo de personal", emphasis: true });
  });

  it("Planta abre sus dos grupos; Externos, hecho de UN grupo, salta directo a sus conceptos", () => {
    const { sharesEntries } = shares();
    expect(sharesEntries[0].next).toEqual({ section: "planta", group: null });
    expect(sharesEntries[1].next).toEqual({ section: "externos", group: "honorarios-medicos" });

    const groups = shares({ section: "planta", group: null });
    expect(groups.sharesCrumbs.map((crumb) => crumb.label)).toEqual(["Total", "Planta"]);
    expect(groups.sharesEntries.map((entry) => entry.id)).toEqual(["afiliados", "no-afiliados"]);
    expect(groups.shares.table.rows.at(-1)).toMatchObject({ label: "Planta", emphasis: true });

    const concepts = shares({ section: "planta", group: "afiliados" });
    expect(concepts.sharesCrumbs.map((crumb) => crumb.label)).toEqual([
      "Total",
      "Planta",
      "Afiliados",
    ]);
    expect(concepts.sharesEntries.every((entry) => entry.next === null)).toBe(true);
    expect(concepts.shares.subtitle).toBe("Ene–Jun 2026 · Afiliados");
    const familia = concepts.shares.table.rows.find((row) => row.id === "familia");
    expect(familia?.values[0]).toBe("$104,483.50");
  });

  it("una marca de «Personal» acota el nivel y devuelve al lector si su nivel se quedó sin barras", () => {
    // Con solo Afiliados marcado, Planta ES Afiliados: se salta el nivel de grupos.
    const narrowed = shares(undefined, ["afiliados"]);
    expect(narrowed.sharesEntries.map((entry) => entry.id)).toEqual(["planta"]);
    expect(narrowed.sharesEntries[0].next).toEqual({ section: "planta", group: "afiliados" });
    // Parado en No afiliados cuando la marca lo deja fuera: vuelve al nivel de arriba válido.
    const fallen = shares({ section: "planta", group: "no-afiliados" }, ["afiliados"]);
    expect(fallen.sharesCrumbs.map((crumb) => crumb.label)).toEqual(["Total", "Planta"]);
    // Y parado en Externos cuando ningún grupo suyo está marcado: vuelve al total.
    const root = shares({ section: "externos", group: "honorarios-medicos" }, ["afiliados"]);
    expect(root.sharesCrumbs.map((crumb) => crumb.label)).toEqual(["Total"]);
  });

  it("con varios años, una barra por ejercicio y ninguna suma de porcentajes", () => {
    const { shares: card } = buildPersonnelCards({
      reading: readPersonnelCost([goldenYear({ year: 2025 }), goldenYear()], SPAN),
      groups: [],
      period: "Ene–Jun · 2025 y 2026",
    });
    expect(flat(card.option).series.map((entry) => entry.name)).toEqual(["2025", "2026"]);
    expect(flat(card.option).legend).toMatchObject({ show: true });
    expect(card.table.columns).toEqual([
      "Monto 2025",
      "% vs ventas 2025",
      "Monto 2026",
      "% vs ventas 2026",
    ]);
  });

  it("un ejercicio tipeado no tiene ventas: no se dibuja y la nota lo dice", () => {
    const { shares: card } = buildPersonnelCards({
      reading: readPersonnelCost([legacyYear(), goldenYear()], [0, 1]),
      groups: [],
      period: "Ene–Feb",
    });
    expect(flat(card.option).series.map((entry) => entry.name)).toEqual(["2026"]);
    expect(card.note).toContain("tipeado");
  });
});

describe("«% vs ventas por nivel» pinta el último nivel cuenta por cuenta", () => {
  it("las secciones y los grupos llevan su color de entidad; las cuentas, uno por posición", () => {
    const built = (sharesPath?: PersonnelCardsInput["sharesPath"]) =>
      buildPersonnelCards({
        reading: readPersonnelCost([goldenYear()], SPAN),
        groups: [],
        period: "Ene–Jun 2026",
        sharesPath,
      });
    const colorsOf = (option: ChartOption | null) =>
      (flat(option).series[0].data as { itemStyle?: { color?: string } }[]).map(
        (datum) => datum.itemStyle?.color,
      );
    // Dos secciones, dos colores distintos — y los mismos que «Planta vs Externos» usa.
    expect(new Set(colorsOf(built().shares.option)).size).toBe(2);
    // Cuatro cuentas de Afiliados: cuatro colores distintos, por su posición en la secuencia.
    const accounts = colorsOf(built({ section: "planta", group: "afiliados" }).shares.option);
    expect(accounts).toEqual([0, 1, 2, 3].map(colorForSliceSlot));
  });
});

describe("«% vs ventas por nivel» también se pone de pie", () => {
  it("con «solido» sale en tres dimensiones, un color por columna, y sigue sabiendo bajar", () => {
    const built = buildPersonnelCards({
      reading: readPersonnelCost([goldenYear()], SPAN),
      groups: [],
      period: "Ene–Jun 2026",
      solidViews: { shares: "solido" },
    });
    expect(is3DOption(built.shares.option as ChartOption | Chart3DOption)).toBe(true);
    expect(built.shares.note).toContain("Arrastra");
    // Las barras del escenario van en el mismo orden que las entradas: el clic sigue nombrándolas.
    expect((built.shares.option as Chart3DOption).xAxis3D).toMatchObject({
      data: ["Planta", "Externos"],
    });
    expect(built.sharesEntries.map((entry) => entry.id)).toEqual(["planta", "externos"]);
  });

  it("plano por omisión, como las otras", () => {
    const built = buildPersonnelCards({
      reading: readPersonnelCost([goldenYear()], SPAN),
      groups: [],
      period: "Ene–Jun 2026",
    });
    expect(is3DOption(built.shares.option as ChartOption | Chart3DOption)).toBe(false);
  });
});
