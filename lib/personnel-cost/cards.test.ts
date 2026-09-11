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
import { GOLDEN_ACCOUNTS, GOLDEN_COVERAGE, goldenYear, legacyYear } from "./fixtures";

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

  it("apila las dos secciones sobre el total del mes", () => {
    expect(sections.option?.series.map((entry) => entry.name)).toEqual(["Planta", "Externos"]);
    expect(sections.option?.series.every((entry) => entry.stack === "costo")).toBe(true);
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
    expect(sections.option?.series.map((entry) => entry.name)).toEqual(["Planta"]);
    // Planta acotada a Afiliados es la serie de Afiliados de la evolución, cifra por cifra.
    const afiliados = flat(groups.option).series.find((entry) => entry.name === "Afiliados");
    expect(sections.option?.series[0].data).toEqual(afiliados?.data);
    expect(sections.table.columns).toEqual(["Planta", "Total"]);
    expect(sections.note).toMatch(/^Sobre ventas: planta [\d.]+ %\.$/);
  });

  it("marcar Honorarios médicos deja solo Externos", () => {
    const { sections } = cards([goldenYear()], ["honorarios-medicos"]);
    expect(sections.option?.series.map((entry) => entry.name)).toEqual(["Externos"]);
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
    ]);
  });
});

describe("Costo vs ventas", () => {
  it("divide cada mes por las ventas de ESE mes, no por las del tramo", () => {
    const { ratio } = cards();
    const row = ratio.table.rows[0];
    // Enero: 104,203.12 / 240,314.07 = 43.4 %; el tramo entero es 50.1 %.
    expect(row.values[0]).toBe("43.4 %");
    expect(row.values.at(-1)).toBe("50.1 %");
  });

  it("un año es una serie: dos años son dos", () => {
    expect(cards().ratio.option?.series).toHaveLength(1);
    expect(cards([goldenYear({ year: 2025 }), goldenYear()]).ratio.option?.series).toHaveLength(2);
  });

  it("la ratio está sobre el ESCENARIO con varios ejercicios y también con uno", () => {
    const one = cards().ratio.option;
    const several = cards([goldenYear({ year: 2025 }), goldenYear()]).ratio;
    expect(one?.backgroundColor).toBe(CHART_STAGE.sky);
    expect(several.option?.backgroundColor).toBe(CHART_STAGE.sky);
    expect(several.option?.legend?.textStyle?.color).toBe(CHART_STAGE.inkMuted);
    // La línea de 2026 sobre el escenario es la traducción por ranura de su color en blanco: el
    // que lleva su fila en la tabla gemela, y el mismo que lleva en el cuerpo sólido.
    const light = several.table.rows[1].color ?? "";
    expect(several.option?.series[1].lineStyle?.color).toBe(stageColor(light));
  });

  it("un mes sin cargar no dibuja punto: no es un cero", () => {
    const { ratio } = cards([goldenYear({ coverage: [0, 1, 2] })], [], [0, 1, 2, 3, 4, 5]);
    const values = ratio.option?.series[0].data;
    expect(values).toEqual([expect.any(Number), expect.any(Number), expect.any(Number)]);
  });

  describe("se lee UNA línea a la vez", () => {
    it("el tooltip es de la línea y lista los MESES de ese ejercicio en dos columnas", () => {
      const { ratio } = cards([goldenYear({ year: 2025 }), goldenYear()]);
      const tooltip = ratio.option?.tooltip;

      expect(tooltip?.trigger).toBe("item");
      const html = tooltip?.formatter?.({
        name: "Ene",
        seriesId: "ratio-2026",
        seriesName: "2026",
        value: 43.4,
        dataIndex: 0,
      });
      expect(html).toContain("2026");
      expect(html).toContain("Ene");
      expect(html).toContain("43.4 %");
      expect(html).toContain("Jun");
      expect(html).not.toContain("2025");
      expect(html).toMatch(/grid-template-columns:\s*auto auto auto auto/);
    });

    it("al pasar por el trazo la línea responde, no solo sus puntos", () => {
      const { ratio } = cards([goldenYear({ year: 2025 }), goldenYear()]);

      for (const serie of ratio.option?.series ?? []) {
        expect(serie.emphasis?.focus).toBe("series");
        expect(serie.triggerEvent).toBe("line");
      }
    });
  });
});

describe("Cada gemela tiene tantas columnas como valores lleva cada fila", () => {
  // `ChartCard` encabeza la columna de la etiqueta por su cuenta («Serie»), así que una columna de
  // más deja la última vacía y corre todas las cifras una posición a la izquierda. Pasó, y se veía.
  it.each([
    ["sections", cards().sections],
    ["ratio", cards().ratio],
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
    expect(built.ratio.option).toBeNull();
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

  it("la pila escribe el TOTAL del mes y no el de la banda que la lleva", () => {
    const { sections } = cards();
    const written = writing(sections.option);
    expect(written.map((entry) => entry.name)).toEqual(["Externos"]);
    const label = written[0].label;
    expect(label?.position).toBe("top");
    // Enero: 55,989.00 de planta + 48,214.12 de externos. La banda que la lleva vale lo segundo.
    expect(label?.formatter?.(param(0, 48214.12))).toBe("$104,203.12");
    expect(label?.formatter?.(param(5, 0))).toBe("$144,277.59");
  });

  it("la lleva la última sección CON datos: sin externos, la escribe planta", () => {
    const soloPlanta = new Map(
      [...GOLDEN_ACCOUNTS].filter(([code]) => !code.startsWith("5.3.03.")),
    );
    const { sections } = cards([goldenYear({ accounts: soloPlanta })]);
    const written = writing(sections.option);
    expect(written.map((entry) => entry.name)).toEqual(["Planta"]);
    expect(written[0].label?.formatter?.(param(0, 55989))).toBe("$55,989.00");
  });

  it("un mes sin cargar no escribe un cero: no hay cifra que escribir", () => {
    const parcial = cards([goldenYear({ coverage: [0, 1] })], [], [0, 1, 2]);
    const label = writing(parcial.sections.option)[0]?.label;
    expect(label?.formatter?.(param(9, null))).toBe("");
  });

  it("la ratio de VARIOS ejercicios no escribe cifra sobre ningún punto: la lleva el tooltip y la gemela", () => {
    for (const built of [
      cards([goldenYear({ year: 2025 }), goldenYear()]),
      cards([2022, 2023, 2024, 2025, 2026].map((year) => goldenYear({ year }))),
    ]) {
      expect(writing(built.ratio.option)).toHaveLength(0);
      // Y sin cifras no hay fila que reservar: el techo es el del dibujo solo.
      expect(built.ratio.option?.grid?.top).toBe(12);
      // El tooltip es el de la LÍNEA (los meses del ejercicio), no el de la columna.
      expect(built.ratio.option?.tooltip?.trigger).toBe("item");
    }
  });

  it("con UN ejercicio la ratio escribe el porcentaje sobre cada punto, en la tinta del escenario", () => {
    const { ratio } = cards();
    const [written] = writing(ratio.option);
    expect(written?.name).toBe("2026");
    expect(written.label?.position).toBe("top");
    // Tinta FUERTE y en seminegrita: la apagada medía 8.77 sobre el navy y se leía como marca de
    // agua. Y con la talla de un porcentaje, dos puntos por encima de la de un importe.
    expect(written.label?.color).toBe(CHART_STAGE.ink);
    expect(written.label?.fontWeight).toBe(600);
    expect(written.label?.fontSize).toBe(12.5);
    // Lo que dice es el porcentaje del punto —enero: 43.4 %— y nada donde no hay mes cargado.
    expect(written.label?.formatter?.(param(0, 43.36))).toBe("43.4 %");
    expect(written.label?.formatter?.(param(9, null))).toBe("");
    // Y la rejilla abre arriba la fila que esas cifras necesitan.
    expect(ratio.option?.grid?.top).toBeGreaterThan(12);
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

describe("Las cuatro lecturas pueden ponerse de pie", () => {
  const solid = (which: "sections" | "ratio" | "concepts", years = [goldenYear()]) => {
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
    expect(is3DOption(built.ratio.option as ChartOption)).toBe(false);
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

  it("la ratio se pone de pie en PORCENTAJE, con una fila por ejercicio", () => {
    const { option } = solid("ratio", [goldenYear({ year: 2025 }), goldenYear()]);
    expect(option.series.map((entry) => entry.name).sort()).toEqual(["2025", "2026"]);
    // Y en ORDEN: los ejercicios no se ordenan por altura como las secciones.
    expect(option.yAxis3D.data).toEqual(["2026", "2025"]);
    expect(option.zAxis3D.axisLabel?.formatter?.(43.36)).toBe("43.4 %");
    expect(option.xAxis3D.data).toEqual(["Ene", "Feb", "Mar", "Abr", "May", "Jun"]);
  });

  it("la ratio deja los ejercicios en orden aunque el más reciente pique más alto", () => {
    const { option } = solid("ratio", [
      goldenYear({ year: 2025, coverage: [0, 1] }),
      goldenYear({ coverage: [5] }),
    ]);
    expect(depthOf(option, "2025")).toBe(1);
    expect(depthOf(option, "2026")).toBe(0);
    expect(option.yAxis3D.data).toEqual(["2026", "2025"]);
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
      solidViews: { sections: "solido", ratio: "solido", concepts: "solido" },
    });
    expect(built.sections.option).toBeNull();
    expect(built.ratio.option).toBeNull();
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
    expect(sections.option?.series.map((entry) => entry.name)).toEqual(["Planta", "Externos"]);
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

  it("la ratio divide por las ventas tecleadas, mes contra el MISMO mes", () => {
    const { ratio } = typed();
    // Enero: 3,750 de 10,000; febrero: 1,100 de 12,000.
    expect(ratio.table.rows[0].values[0]).toBe("37.5 %");
    expect(ratio.table.rows[0].values[1]).toBe("9.2 %");
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
