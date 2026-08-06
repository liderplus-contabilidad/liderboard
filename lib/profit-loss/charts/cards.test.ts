import { describe, expect, it } from "vitest";
import { CHART_PALETTE } from "@/lib/charts/palette";
import {
  CENTRO_PRINCIPAL_SOURCE,
  CENTRO_VACIO_SOURCE,
  CULTURA_MANOR_SEGMENTADO_SOURCE,
  CULTURA_MANOR_SOURCE,
} from "../analytics/fixtures";
import type { AnalyticsSource } from "../analytics/types";
import { emptyFilters, type PygFilters } from "../filters";
import type { Frequency } from "../types";
import { buildSeries } from "../analytics/series";
import { buildAnalisisCards, buildGraficosCards } from "./cards";
import { expenseRootsOf, presetQuery, sumOver } from "./presets";
import { activeSource, type SelectionContext } from "./selection";

/**
 * These cards are the glue between the engine, the presets, the option builders and the palette
 * — everything they call is already tested, so what is checked here is only what the glue
 * decides: WHICH question each card asks, in what order, and with what words.
 *
 * The values below are the fixture's own: a normal month bills 25.229 of revenue against 20.121
 * of expense, and the year is covered Ene–Jul, so the closing period is July.
 */

function ctx(
  sources: AnalyticsSource[],
  activeCenterId: string,
  options: { frequency?: Frequency; year?: number } = {},
): SelectionContext {
  return {
    sources,
    activeCenterId,
    frequency: options.frequency ?? "mensual",
    year: options.year ?? 2026,
  };
}

const MANOR = ctx([CULTURA_MANOR_SOURCE], "cultura-manor");
const SEGMENTADO = ctx([CULTURA_MANOR_SEGMENTADO_SOURCE], "cultura-manor");
const VACIO = ctx([CENTRO_VACIO_SOURCE], "centro-vacio");
const DOS_CENTROS = ctx([CULTURA_MANOR_SOURCE, CENTRO_PRINCIPAL_SOURCE], "cultura-manor");
/** Mismo centro con toda la raíz 4 en cero: la base del porcentaje desaparece, los gastos no. */
const SIN_INGRESOS = ctx(
  [
    {
      ...CULTURA_MANOR_SOURCE,
      valuesByCode: new Map(
        [...CULTURA_MANOR_SOURCE.valuesByCode].map(([code, values]) => [
          code,
          code.startsWith("4") ? values.map(() => 0) : values,
        ]),
      ),
    },
  ],
  "cultura-manor",
);

function withFilters(overrides: Partial<PygFilters>): PygFilters {
  return { ...emptyFilters(), ...overrides };
}

/* -------------------------------------------------------------- el contrato de la lista */

describe("el contrato de la lista", () => {
  it("Gráficos declara cuatro tarjetas, en el orden que la vista posiciona", () => {
    const { cards } = buildGraficosCards(MANOR, emptyFilters());

    expect(cards.map((card) => card.id)).toEqual([
      "evolucion",
      "composicion",
      "ranking",
      "cascada",
    ]);
  });

  it("Análisis declara tres, y la tabla de análisis vertical no es una de ellas", () => {
    const { cards } = buildAnalisisCards(MANOR, emptyFilters());

    expect(cards.map((card) => card.id)).toEqual(["gastos-sobre-ingresos", "variacion", "pareto"]);
  });

  it("cada tarjeta declara su título y su altura", () => {
    const graficos = buildGraficosCards(MANOR, emptyFilters());
    const analisis = buildAnalisisCards(MANOR, emptyFilters());

    expect(graficos.cards.map((card) => [card.title, card.height])).toEqual([
      ["Ingresos contra Costos y Gastos", 300],
      ["Composición de los ingresos", 280],
      ["Ranking de gastos", 280],
      ["Del ingreso a la utilidad", 340],
    ]);
    expect(analisis.cards.map((card) => [card.title, card.height])).toEqual([
      ["Gastos principales sobre ingresos", 300],
      ["Variación contra el periodo anterior", 300],
      ["Concentración de gastos", 300],
    ]);
  });

  it("sin cobertura, lo que no tiene entradas no dibuja y la evolución sale vacía", () => {
    const { cards } = buildGraficosCards(VACIO, emptyFilters());

    // Composición, ranking y cascada no tienen ni una entrada: dicen por qué en vez de dibujar
    // un plot vacío.
    for (const card of cards.slice(1)) {
      expect(card.option).toBeNull();
      expect(card.table.rows).toEqual([]);
    }

    // La evolución sí tiene sus series —existen, lo que no tienen es cobertura—, y cada celda
    // va VACÍA: un periodo sin cargar no es lo mismo que uno cargado en cero.
    expect(cards[0].table.rows.length).toBeGreaterThan(0);
    expect(cards[0].table.rows.every((row) => row.values.every((value) => value === null))).toBe(
      true,
    );
  });
});

/* ------------------------------------------------------- el periodo del que se habla */

describe("el periodo del que hablan las tarjetas", () => {
  it("son los periodos CUBIERTOS, no los doce del año", () => {
    const graficos = buildGraficosCards(MANOR, emptyFilters());

    expect(graficos.periods.map((period) => period.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(graficos.periodName).toBe("Ene–Jul");
  });

  it("es el mismo para las dos pestañas y para todos los subtítulos de una", () => {
    const graficos = buildGraficosCards(MANOR, emptyFilters());
    const analisis = buildAnalisisCards(MANOR, emptyFilters());

    expect(analisis.periodName).toBe(graficos.periodName);
    // La composición lo lleva desnudo; las demás lo llevan dentro de su frase.
    expect(graficos.cards[1].subtitle).toBe("Ene–Jul");
    for (const card of [...graficos.cards.slice(0, 3), analisis.cards[0], analisis.cards[2]]) {
      expect(card.subtitle).toContain("Ene–Jul");
    }
  });

  it("sin un solo periodo cubierto no hay periodos, es «Sin movimiento» y las cifras son nulas", () => {
    const { periods, periodName, tiles } = buildGraficosCards(VACIO, emptyFilters());

    expect(periods).toEqual([]);
    expect(periodName).toBe("Sin movimiento");
    expect(tiles.map((tile) => tile.value)).toEqual([null, null, null]);
    expect(tiles.every((tile) => tile.sign === undefined)).toBe(true);
  });
});

/* ---------------------------------------------------------------- las cifras del periodo */

describe("las cifras del periodo", () => {
  it("son el TOTAL de lo cubierto, no la última columna del eje", () => {
    const { tiles } = buildGraficosCards(MANOR, emptyFilters());

    // Un mes normal factura 25.229; los siete cubiertos suman 176.303 (febrero no trae Ventas
    // Eventos). Leer una sola columna era lo que dejaba la tarjeta en 25.229 con seis meses a la
    // vista.
    expect(tiles).toEqual([
      { id: "ingresos", label: "Ingresos", value: 176303 },
      { id: "gastos", label: "Costos y Gastos", value: 140847 },
      { id: "resultado", label: "Utilidad", value: 35456, sign: "positivo" },
    ]);
  });

  it("con periodos marcados suma ESOS y lo dice", () => {
    const { periodName, tiles } = buildGraficosCards(
      MANOR,
      withFilters({
        periods: [0, 1, 2, 3, 4, 5].map((index) => ({ frequency: "mensual" as const, index })),
      }),
    );

    expect(periodName).toBe("Ene–Jun");
    // Los siete meses menos julio.
    expect(tiles[0].value).toBe(176303 - 25229);
  });

  it("con un solo periodo marcado es ese periodo", () => {
    const { periodName, tiles } = buildGraficosCards(
      MANOR,
      withFilters({ periods: [{ frequency: "mensual", index: 6 }] }),
    );

    expect(periodName).toBe("Jul");
    expect(tiles[0].value).toBe(25229);
  });

  it("un estado segmentado suma LAS DOS raíces de gasto, no solo la 5", () => {
    expect(expenseRootsOf(activeSource(SEGMENTADO))).toEqual(["5", "6"]);

    const { tiles } = buildGraficosCards(SEGMENTADO, emptyFilters());

    // 20.901 mensuales en la raíz 5 (los 20.121 de siempre más los 780 de la rama 5.2 que quedó)
    // y 900 reclasificados a la raíz 6: dejar fuera la 6 daría una utilidad 6.300 más alta.
    expect(tiles[1].value).toBe(21801 * 7);
    expect(tiles[2].value).toBe(176303 - 21801 * 7);
  });
});

/* ------------------------------------------------------------------ lo que marcan los filtros */

describe("lo que marcan los filtros", () => {
  it("sin cuentas marcadas la evolución se titula por lo que compara", () => {
    const { cards } = buildGraficosCards(MANOR, emptyFilters());

    expect(cards[0].title).toBe("Ingresos contra Costos y Gastos");
  });

  it("con cuentas marcadas pasa a ser una comparación", () => {
    const { cards } = buildGraficosCards(MANOR, withFilters({ codes: ["4.1.1.1.1.1", "5.1.5"] }));

    expect(cards[0].title).toBe("Comparación");
  });

  it("un ancestro marcado arrastra sus hojas, una hoja marcada solo a sí misma", () => {
    const { cards } = buildGraficosCards(MANOR, withFilters({ codes: ["4.1.1.1.1.1", "5.1.5"] }));

    // La composición queda con la única hoja de ingresos marcada…
    expect(cards[1].table.rows.map((row) => row.id)).toEqual(["4.1.1.1.1.1"]);
    // …y el ranking con las cuatro que cuelgan de 5.1.5, sin el sueldo, que cuelga de 5.1.1.
    expect(cards[2].table.rows.map((row) => row.id)).toEqual([
      "5.1.5.12",
      "5.1.5.3",
      "5.1.5.7",
      "5.1.5.9",
    ]);
  });

  it("marcar solo un gasto vacía la composición de ingresos, y lo dice", () => {
    const { cards } = buildGraficosCards(MANOR, withFilters({ codes: ["5.1.5"] }));

    expect(cards[1].option).toBeNull();
    expect(cards[1].note).toBe(
      "El filtro de cuentas marcadas no incluye ninguna cuenta de Ingresos.",
    );
  });

  it("marcar solo un ingreso vacía el ranking de gastos, y lo dice", () => {
    const { cards } = buildGraficosCards(MANOR, withFilters({ codes: ["4.1.1.2"] }));

    expect(cards[2].option).toBeNull();
    expect(cards[2].note).toBe(
      "El filtro de cuentas marcadas no incluye ninguna cuenta de Costos y Gastos.",
    );
  });

  it("un periodo marcado ACOTA el eje en vez de agregar series", () => {
    const { cards, periodName } = buildGraficosCards(
      MANOR,
      withFilters({
        periods: [
          { frequency: "mensual", index: 0 },
          { frequency: "mensual", index: 2 },
        ],
      }),
    );

    expect(cards[0].table.columns).toEqual(["Ene", "Mar"]);
    // «Ene–Mar» afirmaría que febrero está sumado, y el filtro lo dejó fuera.
    expect(periodName).toBe("Ene, Mar");
  });

  it("varios centros marcados cruzan cada cuenta con cada centro", () => {
    const { cards } = buildGraficosCards(
      DOS_CENTROS,
      withFilters({ centerIds: ["cultura-manor", "centro-de-costo-principal"] }),
    );

    // El eje de comparación no se declara: dos cuentas por defecto (Ingresos y Costos y Gastos)
    // contra dos centros marcados son cuatro series, y eso es lo que la tarjeta anuncia.
    expect(cards[0].table.rows).toHaveLength(4);
    expect(cards[0].subtitle).toBe("4 series · Ene–Jul");
  });
});

/* ------------------------------------------------------- el orden de los slots de color */

describe("el color se resuelve DESPUÉS de rankear", () => {
  /**
   * El invariante frágil de este módulo. En el fixture, «Arrendamiento Operativo» (5.1.5.12) es
   * el ÚLTIMO gasto en orden de archivo y el SEGUNDO por monto (8.000 contra los 9.000 del
   * sueldo). Si los colores se resolvieran sobre la lista sin rankear, su barra saldría pintada
   * con el slot 4 en vez del 1 — y como el dibujo sí va rankeado, la primera barra de la tarjeta
   * se llevaría un color que no le toca.
   */
  it("el ranking de gastos pinta la segunda barra con el segundo slot", () => {
    const { cards } = buildGraficosCards(MANOR, emptyFilters());
    const rows = cards[2].table.rows;

    expect(rows.map((row) => row.id)).toEqual([
      "5.1.1.1.1",
      "5.1.5.12",
      "5.1.5.3",
      "5.1.5.7",
      "5.1.5.9",
    ]);
    expect(rows[0].color).toBe(CHART_PALETTE[0]);
    expect(rows[1].color).toBe(CHART_PALETTE[1]);
    // Lo que saldría si el color se hubiera resuelto en orden de archivo.
    expect(rows[1].color).not.toBe(CHART_PALETTE[4]);
  });

  it("gastos sobre ingresos hace lo mismo con sus porcentajes", () => {
    const { cards } = buildAnalisisCards(MANOR, emptyFilters());
    const rows = cards[0].table.rows;

    expect(rows[0].id).toBe("5.1.1.1.1");
    expect(rows[1].id).toBe("5.1.5.12");
    expect(rows[0].color).toBe(CHART_PALETTE[0]);
    expect(rows[1].color).toBe(CHART_PALETTE[1]);
  });
});

/* ------------------------------------------------- lo que se calcula sobre las sumas */

describe("el porcentaje sobre ingresos", () => {
  it("es Σ cuenta ÷ Σ ingresos, no el promedio de los porcentajes de cada mes", () => {
    const bundle = buildSeries([CULTURA_MANOR_SOURCE], presetQuery(["4", "5.1.1.1.1"], MANOR));
    const sueldo = sumOver(bundle, "5.1.1.1.1") as number;
    const ingresos = sumOver(bundle, "4") as number;

    // Febrero no trae Ventas Eventos, así que su porcentaje es más alto que el de los demás: el
    // promedio de los siete porcentajes NO es el porcentaje de las sumas, y es esta la que vale.
    const promedioDeRazones =
      bundle.series
        .find((series) => series.key.code === "5.1.1.1.1")!
        .points.reduce((sum, point, index) => {
          const base = bundle.series.find((series) => series.key.code === "4")!.points[index].value;
          return sum + (point.value !== null && base ? (point.value / base) * 100 : 0);
        }, 0) / 7;
    const razonDeSumas = (sueldo / ingresos) * 100;
    expect(promedioDeRazones).not.toBeCloseTo(razonDeSumas, 6);

    const { cards } = buildAnalisisCards(MANOR, emptyFilters());
    expect(cards[0].table.rows[0].id).toBe("5.1.1.1.1");
    expect(cards[0].table.rows[0].values[0]).toBe(`${razonDeSumas.toFixed(1)} %`);
  });

  it("con los ingresos del periodo en cero no divide: se vacía y lo dice", () => {
    const { cards } = buildAnalisisCards(SIN_INGRESOS, emptyFilters());

    expect(cards[0].option).toBeNull();
    expect(cards[0].table.rows).toEqual([]);
    expect(cards[0].note).toBe("Los ingresos de Ene–Jul no dan base para el porcentaje.");
  });
});

describe("la variación nombra las dos columnas que compara", () => {
  it("no hereda el rango, que anunciaría una variación de siete meses", () => {
    const { cards } = buildAnalisisCards(MANOR, emptyFilters());

    expect(cards[1].subtitle).toBe("Jul contra Jun");
  });

  it("sobre un rango marcado compara las dos últimas columnas de ESE rango", () => {
    const { cards } = buildAnalisisCards(
      MANOR,
      withFilters({
        periods: [0, 1, 2, 3, 4, 5].map((index) => ({ frequency: "mensual" as const, index })),
      }),
    );

    expect(cards[1].subtitle).toBe("Jun contra May");
  });

  it("con una sola columna en el eje lo declara en vez de dibujar", () => {
    const { cards } = buildAnalisisCards(
      MANOR,
      withFilters({ periods: [{ frequency: "mensual", index: 6 }] }),
    );

    expect(cards[1].subtitle).toBe("Sin periodo anterior");
    expect(cards[1].option).toBeNull();
  });

  it("sin cobertura alguna dice que no hubo movimiento", () => {
    const { cards } = buildAnalisisCards(VACIO, emptyFilters());

    expect(cards[1].subtitle).toBe("Sin movimiento");
  });
});

/* ------------------------------------------------------------------------ las notas */

describe("lo que cada tarjeta dice de sí misma", () => {
  it("la cascada nombra el rango que sumó, no el año del archivo", () => {
    const { cards } = buildGraficosCards(MANOR, emptyFilters());

    expect(cards[3].subtitle).toBe("Suma de Ene–Jul");
  });

  it("sin escalones la cascada lo declara en vez de dibujar barras en cero", () => {
    const { cards } = buildGraficosCards(VACIO, emptyFilters());

    expect(cards[3].subtitle).toBe("Sin movimiento");
    expect(cards[3].option).toBeNull();
  });

  it("la variación advierte siempre que el color no es la única señal", () => {
    const { cards } = buildAnalisisCards(MANOR, emptyFilters());

    expect(cards[1].note).toContain("el color no es la única señal");
  });

  it("una tarjeta sin nota no lleva el campo", () => {
    const { cards } = buildGraficosCards(MANOR, emptyFilters());

    // Cinco gastos y el corte está en ocho: no hay nada que declarar fuera de la lista.
    expect(cards[2].note).toBeUndefined();
  });
});
