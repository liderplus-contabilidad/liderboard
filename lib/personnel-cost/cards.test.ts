import { describe, expect, it } from "vitest";
import { is3DOption, type Chart3DOption, type ChartOption } from "@/lib/charts/types";
import { buildPersonnelCards, CONCEPT_SLICES, type PersonnelCardsInput } from "./cards";

/** Narrows a card that CAN come out in three dimensions, asserting it did not. */
function flat(option: ChartOption | Chart3DOption | null): ChartOption {
  expect(option).not.toBeNull();
  expect(is3DOption(option as ChartOption | Chart3DOption)).toBe(false);
  return option as ChartOption;
}
import { readPersonnelCost } from "./derive";
import { GOLDEN_COVERAGE, goldenYear } from "./fixtures";

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

  it("un mes sin cargar no dibuja punto: no es un cero", () => {
    const { ratio } = cards([goldenYear({ coverage: [0, 1, 2] })], [], [0, 1, 2, 3, 4, 5]);
    const values = ratio.option?.series[0].data;
    expect(values).toEqual([expect.any(Number), expect.any(Number), expect.any(Number)]);
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
    const option = groups.option as Chart3DOption;
    // Honorarios médicos ($325,540) es la mayor y va al fondo (profundidad más alta).
    const depth = (name: string) => {
      const series = option.series.find((entry) => entry.name === name);
      if (!series) {
        throw new Error(`El skyline no dibujó «${name}»`);
      }
      return (series.data[0].value as number[])[1];
    };
    expect(depth("Honorarios médicos")).toBe(2);
    expect(depth("No afiliados")).toBe(0);
  });

  it("el color NO se mueve: sigue siendo el de la entidad en las cuatro cards", () => {
    const stacked = cards();
    const sky = cards([goldenYear()], [], SPAN, "skyline");
    const flatColor = flat(stacked.groups.option).series.find((entry) => entry.name === "Afiliados")
      ?.itemStyle?.color;
    const skyColor = (sky.groups.option as Chart3DOption).series.find(
      (entry) => entry.name === "Afiliados",
    )?.itemStyle?.color;
    expect(skyColor).toBe(flatColor);
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
});
