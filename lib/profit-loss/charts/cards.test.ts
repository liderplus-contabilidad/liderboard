import { describe, expect, it } from "vitest";
import {
  CHART_COMPOSITION_PALETTE,
  CHART_NEUTRAL,
  CHART_PALETTE,
  CHART_SECTION,
  CHART_SLICE_MAX,
  CHART_RANKING_MAX,
} from "@/lib/charts/palette";
import {
  CENTRO_PRINCIPAL_SOURCE,
  CENTRO_VACIO_SOURCE,
  CULTURA_MANOR_SEGMENTADO_SOURCE,
  CULTURA_MANOR_SOURCE,
} from "../analytics/fixtures";
import type { ChartCardSpec } from "@/lib/charts/types";
import type { AnalyticsSource } from "../analytics/types";
import { OTHERS_CODE } from "../analytics/structure";
import { ANNEX_MAX_SLICES } from "./expense-distribution";
import { emptyFilters, type PygFilters } from "../filters";
import { formatCurrency } from "@/lib/format";
import type { Frequency } from "../types";
import { buildSeries } from "../analytics/series";
import { buildAnalisisCards, buildGraficosCards, rankingColorOf } from "./cards";
import {
  availablePresets,
  BUSINESS_LINES_PRESET,
  EXPENSE_DISTRIBUTION_PRESET,
  PRESET_VIEWS,
} from "./preset-views";
import { expenseRootsOf, presetQuery, sumOver } from "./presets";
import { DINGOO_SYSTEM, MICROPLUS_SYSTEM } from "../upload/systems";
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
  options: {
    frequency?: Frequency;
    year?: number;
    centers?: readonly { id: string; name: string; kind: "centro" | "sin-centro" }[];
  } = {},
): SelectionContext {
  return {
    sources,
    activeCenterId,
    frequency: options.frequency ?? "mensual",
    year: options.year ?? 2026,
    // Los establecimientos reales; las fuentes de prueba no traen ni Consolidado ni «Sin centro».
    centers:
      options.centers ??
      sources.map((source) => ({
        id: source.centerId,
        name: source.centerName,
        kind: "centro" as const,
      })),
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

/**
 * El mismo centro con TODO rótulo de hotelería renombrado: ni la rama ni sus hijas declaran
 * nada. Renombrar solo la rama no basta desde que el nodo se reconoce también por sus hijas —que
 * es lo que hace aparecer la vista en un plan que no escribe «hospedaje» en ninguna parte—.
 */
const SIN_HOTEL = ctx(
  [
    {
      ...CULTURA_MANOR_SOURCE,
      namesByCode: new Map(
        [...CULTURA_MANOR_SOURCE.namesByCode].map(([code, name]) => [
          code,
          /habitacion|hospedaj|alojamient|lavander|restaurant|aliment|bebida|tour/i.test(name)
            ? "Ventas Generales"
            : name,
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
  it("Gráficos declara cinco tarjetas, en el orden que la vista posiciona", () => {
    const { cards } = buildGraficosCards(MANOR, emptyFilters());

    expect(cards.map((card) => card.id)).toEqual([
      "evolucion",
      "distribucion",
      "ranking",
      "composicion",
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
      ["Distribución de Ventas", 320],
      ["Ranking de gastos", 520],
      ["Composición de los ingresos", 420],
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
    expect(graficos.cards[3].subtitle).toBe("Ene–Jul");
    for (const card of [...graficos.cards.slice(0, 4), analisis.cards[0], analisis.cards[2]]) {
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
    expect(cards[3].table.rows.map((row) => row.id)).toEqual(["4.1.1.1.1.1"]);
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

    expect(cards[3].option).toBeNull();
    expect(cards[3].note).toBe(
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

  it("marcar una cuenta y otra que la contiene anota el porcentaje y dice cuál es la base", () => {
    const { cards } = buildGraficosCards(MANOR, withFilters({ codes: ["4", "4.1.1"] }));

    expect(cards[0].note).toBe(
      "El porcentaje de cada barra es lo que la cuenta ocupa dentro de la marcada que la contiene: Ventas Alojamiento y Servicios dentro de Ingresos.",
    );
    // La hija lo lleva; el padre, que no cae dentro de nada marcado, no.
    expect(cards[0].option?.series[1].label?.rich).toBeDefined();
    expect(cards[0].option?.series[0].label?.rich).toBeUndefined();
  });

  it("dos cuentas sin parentesco dejan la tarjeta exactamente como estaba", () => {
    const { cards } = buildGraficosCards(MANOR, withFilters({ codes: ["4", "5"] }));

    expect(cards[0].note).toBeUndefined();
    expect(cards[0].option?.series.every((series) => series.label?.rich === undefined)).toBe(true);
  });

  it("la tabla gemela sigue siendo montos: el porcentaje vive en la gráfica", () => {
    const { cards } = buildGraficosCards(MANOR, withFilters({ codes: ["4", "4.1.1"] }));

    expect(cards[0].table.rows.map((row) => row.id)).toEqual([
      "4|cultura-manor|2026",
      "4.1.1|cultura-manor|2026",
    ]);
    expect(cards[0].table.rows[1].values[0]).toBe("$24,465.00");
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

  /**
   * La COLA del ranking —de la novena barra en adelante— no repite el neutro. El fixture solo
   * llega a cinco gastos, así que lo que se prueba aquí es el resolver que la tarjeta usa, con la
   * lista de quince que un plan real sí produce: las ocho primeras conservan sus ranuras y las
   * siete siguientes salen todas distintas. La gemela en tabla lee el MISMO resolver, que es lo
   * que ata cada punto de color a su barra.
   */
  it("de la novena barra en adelante la cola varía, en vez de repetir el neutro", () => {
    const codes = Array.from({ length: CHART_RANKING_MAX }, (_, i) => `5.1.5.${i}`);
    const colorOf = rankingColorOf(codes);
    const colors = codes.map(colorOf);

    expect(colors.slice(0, CHART_PALETTE.length)).toEqual([...CHART_PALETTE]);
    const tail = colors.slice(CHART_PALETTE.length);
    expect(tail).toHaveLength(7);
    expect(new Set(tail).size).toBe(7);
    expect(tail).not.toContain(CHART_NEUTRAL);
  });

  /**
   * La composición NO se pinta con las ranuras de identidad: tiene su propio set cálido, pedido
   * por la firma. Lo que este test protege es que la tarta y su gemela en tabla lean el MISMO,
   * porque el punto de color de cada fila es lo que ata una porción a su cuenta — y que el orden
   * del reparto sea el que da el tono, que es lo único que ese set dice.
   */
  it("la composición toma su set propio y no las ranuras de identidad", () => {
    const { cards } = buildGraficosCards(MANOR, emptyFilters());
    const composicion = cards.find((card) => card.id === "composicion");
    const rows = composicion?.table.rows ?? [];

    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0].color).toBe(CHART_COMPOSITION_PALETTE[0]);
    expect(rows[1].color).toBe(CHART_COMPOSITION_PALETTE[1]);
    expect(rows[0].color).not.toBe(CHART_PALETTE[0]);

    // El tono sale del LUGAR en el reparto, y el reparto viene de mayor a menor.
    for (const [slot, row] of rows.entries()) {
      expect(row.color).toBe(CHART_COMPOSITION_PALETTE[slot]);
    }
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

    expect(cards[4].subtitle).toBe("Suma de Ene–Jul");
  });

  it("sin escalones la cascada lo declara en vez de dibujar barras en cero", () => {
    const { cards } = buildGraficosCards(VACIO, emptyFilters());

    expect(cards[4].subtitle).toBe("Sin movimiento");
    expect(cards[4].option).toBeNull();
  });

  it("la variación advierte siempre que el color no es la única señal", () => {
    const { cards } = buildAnalisisCards(MANOR, emptyFilters());

    expect(cards[1].note).toContain("el color no es la única señal");
  });

  it("una tarjeta sin nota no lleva el campo", () => {
    const { cards } = buildGraficosCards(MANOR, emptyFilters());

    // Cinco gastos y el corte está en quince: no hay nada que declarar fuera de la lista.
    expect(cards[2].note).toBeUndefined();
  });
});

/* --------------------------------------------------------------------- la distribución */

/**
 * Lo que decide la capa pura —qué cuenta se reparte y qué hijas caben— ya está probado en
 * `distribution.test.ts`. Lo que se prueba aquí es solo la costura: que la tarjeta nombre esa
 * cuenta, que la línea del total sea una consulta propia y no el techo de la pila, y que sin
 * nada que repartir lo diga en vez de dibujar.
 */
describe("la vista predeterminada de líneas de negocio", () => {
  const lines = buildGraficosCards(MANOR, withFilters({ preset: BUSINESS_LINES_PRESET }));
  const plain = buildGraficosCards(MANOR, emptyFilters());

  it("cambia la primera tarjeta y ninguna otra", () => {
    expect(lines.cards[0].title).toBe("Ventas por línea de negocio");
    // Por JSON porque una opción lleva formateadores: dos cierres iguales no son el mismo objeto.
    expect(JSON.stringify(lines.cards.slice(1))).toBe(JSON.stringify(plain.cards.slice(1)));
    expect(lines.tiles).toEqual(plain.tiles);
  });

  it("dibuja una serie por categoría, con la rama de hospedaje fundida en una sola", () => {
    expect(lines.cards[0].table.rows.map((row) => row.label)).toEqual([
      "Hospedaje",
      "Restaurante",
      "Lavandería",
      "Otros ingresos ordinarios",
    ]);
  });

  it("gira el eje: las categorías son las FILAS de la tabla y las columnas lo comparado", () => {
    // Con los meses en el eje, las cinco categorías que no son hospedaje quedan aplastadas contra
    // él, sin rótulo propio ni sitio para su cifra.
    expect(lines.cards[0].table.columns.length).toBeGreaterThan(0);
    expect(lines.cards[0].option?.xAxis?.data).toEqual(
      lines.cards[0].table.rows.map((row) => row.label),
    );
  });

  it("dice qué agrupa y qué deja fuera, porque una barra no se llama como el plan", () => {
    expect(lines.cards[0].note).toContain("Rebaja y/o Descuentos sobre Ventas");
  });

  it("desmarcarlos TODOS vuelve al centro resuelto, la regla de siempre", () => {
    const sinMarcas = buildGraficosCards(
      DOS_CENTROS,
      withFilters({ preset: BUSINESS_LINES_PRESET }),
    );
    expect(sinMarcas.cards[0].subtitle).not.toContain("centros");
  });

  it("un establecimiento sin ventas en una línea no abre columna, y lo DICE", () => {
    // Hospedaje enseña tres de los cinco marcados porque los otros dos no venden hospedaje; sin
    // decirlo, una columna que falta se lee como un dato que falta.
    // El segundo centro no vende lavandería: su columna no existe bajo esa categoría.
    const sinLavanderia = {
      ...CENTRO_PRINCIPAL_SOURCE,
      valuesByCode: new Map(
        [...CENTRO_PRINCIPAL_SOURCE.valuesByCode].map(([code, values]) => [
          code,
          // Lavandería vive en dos ramas del plan de prueba: `4.1.1.5` y el servicio externo.
          code.startsWith("4.1.1.5") || code.startsWith("4.1.8") ? values.map(() => 0) : values,
        ]),
      ),
    };
    const porCentro = buildGraficosCards(
      ctx([CULTURA_MANOR_SOURCE, sinLavanderia], "cultura-manor"),
      withFilters({
        preset: BUSINESS_LINES_PRESET,
        centerIds: ["cultura-manor", "centro-de-costo-principal"],
      }),
    ).cards[0];
    expect(porCentro.table.rows.filter((row) => row.sublabel === "Lavandería")).toHaveLength(1);
    expect(porCentro.note).toContain("sin ventas en una línea no abre columna");
  });

  it("«Sin centro de costo» queda fuera del reparto y se DICE", () => {
    // Son dólares que estaban en el consolidado y ya no están en ninguna columna; el resto de
    // ausencias son desmarcados a la vista, en el propio desplegable.
    const conCajon = ctx([CULTURA_MANOR_SOURCE, CENTRO_PRINCIPAL_SOURCE], "cultura-manor", {
      centers: [
        { id: "cultura-manor", name: "Cultura Manor", kind: "centro" },
        { id: "centro-de-costo-principal", name: "Centro de Costo Principal", kind: "centro" },
        { id: "sin-centro", name: "Sin centro de costo", kind: "sin-centro" },
      ],
    });
    const card = buildGraficosCards(
      conCajon,
      withFilters({
        preset: BUSINESS_LINES_PRESET,
        centerIds: ["cultura-manor", "centro-de-costo-principal"],
      }),
    ).cards[0];
    expect(card.subtitle).toContain("× 2 centros");
    expect(card.note).toContain("Sin centro de costo no entra en el reparto");
  });

  it("con VARIOS centros marcados dibuja una barra por establecimiento", () => {
    // Es la tabla del contador —categoría × sucursal— en un solo gráfico, y la única tarjeta que
    // lee varios centros a la vez en vez del resuelto.
    const porCentro = buildGraficosCards(
      DOS_CENTROS,
      withFilters({
        preset: BUSINESS_LINES_PRESET,
        centerIds: ["cultura-manor", "centro-de-costo-principal"],
      }),
    );
    // Las COLUMNAS son los pares (categoría, establecimiento) y las barras siguen siendo los
    // meses: las dos lecturas conviven en un gráfico, que es la forma de la hoja del contador.
    // La fila lleva el ESTABLECIMIENTO y la categoría de subrótulo: el eje la escribe una vez
    // sobre sus columnas en vez de repetirla entera en cada rótulo.
    expect(porCentro.cards[0].table.rows.map((row) => `${row.sublabel} · ${row.label}`)).toEqual([
      "Hospedaje · Cultura Manor",
      "Hospedaje · Centro de Costo Principal",
      "Restaurante · Cultura Manor",
      "Restaurante · Centro de Costo Principal",
      "Lavandería · Cultura Manor",
      "Lavandería · Centro de Costo Principal",
      "Otros ingresos ordinarios · Cultura Manor",
      "Otros ingresos ordinarios · Centro de Costo Principal",
    ]);
    expect(porCentro.cards[0].table.columns[0]).toBe("Ene");
    // Y el eje del gráfico gana un segundo renglón que nombra cada categoría sobre sus columnas.
    const axes = porCentro.cards[0].option?.xAxis;
    expect(Array.isArray(axes) && axes[1].data?.filter(Boolean)).toEqual([
      "Hospedaje",
      "Restaurante",
      "Lavandería",
      "Otros ingresos ordinarios",
    ]);
  });

  it("se queda inerte con un plan que no declara líneas", () => {
    const encendido = buildGraficosCards(SIN_HOTEL, withFilters({ preset: BUSINESS_LINES_PRESET }));
    const apagado = buildGraficosCards(SIN_HOTEL, emptyFilters());
    expect(encendido.cards[0].title).toBe(apagado.cards[0].title);
  });
});

describe("la distribución de una cuenta", () => {
  const distribucionOf = (filters: PygFilters) => buildGraficosCards(MANOR, filters).cards[1];

  it("se titula por la cuenta que reparte y lista sus hijas de mayor a menor", () => {
    const card = distribucionOf(emptyFilters());

    // Sin marcas es Ingresos, que baja a `4.1` por tener hija única.
    expect(card.title).toBe("Distribución de Ventas");
    expect(card.table.rows.map((row) => row.label)).toEqual([
      "Ventas Alojamiento y Servicios",
      "Otros Servicios",
      "Rebaja y/o Descuentos sobre Ventas",
      "Ventas",
    ]);
  });

  it("la última fila es el TOTAL de la cuenta, y no la suma de las barras dibujadas", () => {
    const card = distribucionOf(emptyFilters());
    const total = card.table.rows.at(-1);

    // 24.465 + 1.271 − 507 = 25.229: la hija negativa se apila hacia abajo, así que el neto no
    // está en ningún borde de la pila y la línea es la única que lo dice.
    expect(total?.emphasis).toBe(true);
    expect(total?.values[0]).toBe("$25,229.00");
    expect(card.option?.series.at(-1)?.type).toBe("line");
  });

  it("una sola cuenta marcada es la que se reparte", () => {
    expect(distribucionOf(withFilters({ codes: ["4.1.1"] })).title).toBe(
      "Distribución de Ventas Alojamiento y Servicios",
    );
  });

  it("una cuenta de movimiento marcada no tiene nada que repartir, y lo dice", () => {
    const card = distribucionOf(withFilters({ codes: ["4.1.1.2"] }));

    expect(card.option).toBeNull();
    expect(card.table.rows).toEqual([]);
    expect(card.note).toContain("Marca UNA cuenta con desglose");
  });

  it("declara las cuentas que dejó fuera por no moverse", () => {
    // `4.1.1.6 Ventas Teléfono` está permanentemente en cero.
    expect(distribucionOf(withFilters({ codes: ["4.1.1"] })).note).toContain(
      "1 cuenta quedó fuera",
    );
  });

  it("sin cobertura no dibuja nada", () => {
    const card = buildGraficosCards(VACIO, emptyFilters()).cards[1];

    expect(card.option).toBeNull();
    expect(card.table.rows).toEqual([]);
  });
});

/* --------------------------------------------------------------- el código de cada cuenta */

/**
 * La costura de extremo a extremo del código de cuenta: la regla vive en `option.ts` y se prueba
 * allí, pero lo que puede romperse aquí es que una tarjeta deje de pasar por esos builders —una
 * tabla armada a mano, un `entryTable` propio— y pierda el código sin que ningún test de cifras
 * lo note. Se busca por `id` y no por índice porque el orden de las tarjetas es de la lista.
 */
describe("el código de cuenta llega a las tarjetas", () => {
  interface Row {
    id: string;
    label: string;
    sublabel?: string;
  }

  const rowsOf = (cards: readonly ChartCardSpec[], id: string): Row[] =>
    (cards.find((card) => card.id === id)?.table.rows ?? []) as Row[];

  it("cada fila que ES una cuenta lo cuelga bajo su nombre, en Gráficos y en Análisis", () => {
    const graficos = buildGraficosCards(MANOR, emptyFilters());
    const analisis = buildAnalisisCards(MANOR, emptyFilters());

    for (const [cards, id] of [
      [graficos.cards, "evolucion"],
      [graficos.cards, "ranking"],
      [graficos.cards, "composicion"],
      [analisis.cards, "gastos-sobre-ingresos"],
      // La variación no entra: los meses del fixture repiten el mismo importe, así que ninguna
      // cuenta se mueve y la tarjeta sale vacía. Sale del MISMO `entryTable` que estas dos, y
      // `option.test.ts` la prueba directamente sobre sus propias entradas.
      [analisis.cards, "pareto"],
    ] as const) {
      const rows = rowsOf(cards, id);
      expect([id, rows.length > 0]).toEqual([id, true]);

      for (const row of rows) {
        // «Otros» es el pliegue de la cola, no una cuenta: es la única fila que se queda sin él.
        if (row.label === "Otros") {
          expect(row.sublabel).toBeUndefined();
          continue;
        }
        // El id de una fila es el código a secas (las tablas de montos) o `código|centro|año`
        // (las de series); en las dos, el código es lo que abre el id.
        expect(row.sublabel).toBeDefined();
        expect(row.id.startsWith(row.sublabel as string)).toBe(true);
      }
    }
  });

  it("la cascada no lo lleva: sus escalones son bloques del estado y no cuentas", () => {
    const { cards } = buildGraficosCards(MANOR, emptyFilters());
    const rows = rowsOf(cards, "cascada");

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.sublabel === undefined)).toBe(true);
  });
});

/* ------------------------------------- la vista predeterminada de costos y gastos */

describe("la vista predeterminada de costos y gastos", () => {
  const conAnexo = () =>
    buildGraficosCards(MANOR, withFilters({ preset: EXPENSE_DISTRIBUTION_PRESET }));

  it("solo se ofrece en MicroPlus, donde el plan da un anexo legible", () => {
    // No es que el cálculo falle en otros: es que reparte sobre las cuentas de movimiento, y otros
    // planes bajan mucho más y devuelven más de cien rubros — una tarta que no reparte nada.
    const source = activeSource(SIN_HOTEL);
    const conMicroplus = availablePresets({ source, systemId: MICROPLUS_SYSTEM });
    const conOtro = availablePresets({ source, systemId: DINGOO_SYSTEM });

    expect(conMicroplus.map((preset) => preset.id)).toContain(EXPENSE_DISTRIBUTION_PRESET);
    expect(conOtro.map((preset) => preset.id)).not.toContain(EXPENSE_DISTRIBUTION_PRESET);
  });

  it("sin sistema —el consolidado entre clientes— tampoco se ofrece", () => {
    // Allí los planes de varios clientes se UNEN, así que «las cuentas más específicas» son de
    // varios sistemas a la vez y el anexo dejaría de ser el anexo de nadie.
    const ids = availablePresets({ source: activeSource(MANOR), systemId: null }).map((p) => p.id);

    expect(ids).not.toContain(EXPENSE_DISTRIBUTION_PRESET);
  });

  it("«Ventas» sigue dependiendo del PLAN y no del sistema", () => {
    // Las dos condiciones son distintas a propósito: una mira los rótulos del árbol, la otra el
    // formato del que salió el archivo.
    const sinHotel = availablePresets({
      source: activeSource(SIN_HOTEL),
      systemId: MICROPLUS_SYSTEM,
    });
    const conHotel = availablePresets({ source: activeSource(MANOR), systemId: DINGOO_SYSTEM });

    expect(sinHotel.map((preset) => preset.id)).not.toContain(BUSINESS_LINES_PRESET);
    expect(conHotel.map((preset) => preset.id)).toContain(BUSINESS_LINES_PRESET);
  });

  it("ocupa dos ranuras y RINDE la de «Distribución», que hablaba de ingresos", () => {
    const { cards } = conAnexo();

    expect(cards.map((card) => [card.id, card.title])).toEqual([
      ["evolucion", "Distribución de costos y gastos"],
      ["ranking", "Distribución de costos y gastos %"],
      // La cascada se ADELANTA: va del ingreso al resultado pasando por los gastos, así que es la
      // continuación del reparto que se acaba de leer. La composición de ingresos se queda detrás,
      // como contexto de la columna «% del ingreso».
      ["cascada", "Del ingreso a la utilidad"],
      ["composicion", "Composición de los ingresos"],
    ]);
    // «Distribución» reparte UNA cuenta y con quince marcadas resolvía Ingresos: bajo un anexo de
    // gastos era una tarjeta repartiendo ingresos que no tiene que ver con lo que se está leyendo.
    expect(cards.map((card) => card.id)).not.toContain("distribucion");
  });

  it("apagada, la lista vuelve a ser exactamente la de siempre", () => {
    // Incluidas las dos del final en su orden de siempre: fuera del anexo la composición acompaña
    // al reparto de arriba y la cascada cierra con la historia completa.
    const { cards } = buildGraficosCards(MANOR, emptyFilters());

    expect(cards.map((card) => card.title)).toEqual([
      "Ingresos contra Costos y Gastos",
      "Distribución de Ventas",
      "Ranking de gastos",
      "Composición de los ingresos",
      "Del ingreso a la utilidad",
    ]);
  });

  it("la tabla gemela ES el anexo: código, valor y las DOS columnas de porcentaje", () => {
    const { cards } = conAnexo();
    const anexo = cards[0].table;

    expect(anexo.columns).toEqual(["Valor", "% del gasto", "% del ingreso"]);
    // El código va aparte del nombre: en una tabla hay sitio para los dos.
    expect(anexo.rows[0].sublabel).toBe("5.1.1.1.1");
    expect(anexo.rows[0].values).toHaveLength(3);
  });

  it("cierra con una fila de TOTAL destacada, que es contra lo que se coteja", () => {
    const { cards, tiles } = conAnexo();
    const rows = cards[0].table.rows;
    const total = rows.at(-1);

    expect(total?.id).toBe("__total__");
    expect(total?.emphasis).toBe(true);
    // La misma cifra que la baldosa de «Costos y Gastos»: una sola definición del total.
    expect(total?.values[0]).toBe(formatCurrency(tiles[1].value as number, { cents: true }));
    expect(total?.values[1]).toBe("100.0 %");
  });

  it("los porcentajes de la columna del gasto suman 100", () => {
    const { cards } = conAnexo();
    const rubros = cards[0].table.rows.filter((row) => row.id !== "__total__");
    const sum = rubros.reduce(
      (total, row) => total + Number.parseFloat(row.values[1] as string),
      0,
    );

    expect(sum).toBeCloseTo(100, 1);
  });

  it("la segunda columna mide contra el ingreso, así que da menos que la primera", () => {
    // En el fixture el gasto es menor que el ingreso, luego todo rubro pesa menos sobre el ingreso.
    const { cards } = conAnexo();
    const rubros = cards[0].table.rows.filter((row) => row.id !== "__total__");

    for (const row of rubros) {
      const sobreGasto = Number.parseFloat(row.values[1] as string);
      const sobreIngreso = Number.parseFloat(row.values[2] as string);
      expect(sobreIngreso).toBeLessThan(sobreGasto);
    }
  });

  it("la nota cuadra el reparto contra el ingreso, con centavos", () => {
    const { cards } = conAnexo();

    expect(cards[0].note).toContain("rubros suman");
    expect(cards[0].note).toContain("% de los ingresos del tramo");
  });

  it("la dona NO pliega la cola: el anexo es una lista que sale entera", () => {
    // «Otros · 16,6 %» esconde justo lo que se viene a leer aquí, al revés que en la composición de
    // ingresos, donde la séptima cuenta no cambia la respuesta a «de qué se compone el total».
    const { cards } = conAnexo();
    const dona = cards[1];
    const barras = cards[0].table.rows.filter((row) => row.id !== "__total__");

    expect(dona.option?.series[0].type).toBe("pie");
    expect(dona.table.rows.map((row) => row.id)).not.toContain(OTHERS_CODE);
    expect(dona.table.rows).toHaveLength(barras.length);
  });

  it("cada porción toma un tono propio, hasta donde llega la secuencia", () => {
    const { cards } = conAnexo();
    const data = cards[1].option?.series[0].data ?? [];
    const colors = data.map((d) => (d as { itemStyle?: { color?: string } }).itemStyle?.color);

    expect(new Set(colors).size).toBe(colors.length);
    expect(colors).not.toContain(CHART_NEUTRAL);
    // La secuencia da para más rubros de los que un anexo real trae.
    expect(CHART_SLICE_MAX).toBeGreaterThanOrEqual(17);
  });

  it("las dos tarjetas hablan del MISMO reparto", () => {
    const { cards } = conAnexo();
    const barras = cards[0].table.rows.filter((row) => row.id !== "__total__");
    const dona = cards[1].table.rows;

    expect(dona[0].id).toBe(barras[0].id);
  });

  it("sin un solo gasto cubierto no dibuja ninguna de las dos y dice por qué", () => {
    const { cards } = buildGraficosCards(
      VACIO,
      withFilters({ preset: EXPENSE_DISTRIBUTION_PRESET }),
    );

    expect(cards[0].option).toBeNull();
    expect(cards[1].option).toBeNull();
    expect(cards[0].table.rows).toEqual([]);
  });
});

describe("el anexo se dibuja como la hoja del contador", () => {
  const conAnexo = () =>
    buildGraficosCards(MANOR, withFilters({ preset: EXPENSE_DISTRIBUTION_PRESET }));

  it("son barras VERTICALES: los rubros en el eje X, con su cifra encima", () => {
    const { cards } = conAnexo();
    const option = cards[0].option;
    const xAxis = option?.xAxis;

    expect(Array.isArray(xAxis) ? xAxis[0].type : xAxis?.type).toBe("category");
    expect(option?.yAxis?.type).toBe("value");
    expect(option?.series[0].label?.show).toBe(true);
    expect(option?.series[0].label?.position).toBe("top");
  });

  it("dibuja TODOS los rótulos aunque no quepan: los parte en vez de saltarse uno de cada dos", () => {
    // Sin `interval: 0` quedarían diecisiete barras con nueve nombres, y las ocho sin rotular no se
    // podrían identificar por nada más. Partir el texto es el precio, y su Excel lo paga igual.
    const { cards } = conAnexo();
    const xAxis = cards[0].option?.xAxis;
    const axis = Array.isArray(xAxis) ? xAxis[0] : xAxis;

    expect(axis?.axisLabel?.interval).toBe(0);
    expect(axis?.axisLabel?.overflow).toBe("break");
  });

  it("las barras van TODAS del mismo color, y es el del bloque de gastos", () => {
    // Aquí el color no distingue nada —cada barra lleva su rubro rotulado y su cifra—, así que
    // repartir tonos gastaría el canal de identidad en re-decir lo que la longitud ya dice.
    const { cards } = conAnexo();
    const data = cards[0].option?.series[0].data ?? [];
    const colors = new Set(
      data.map((datum) => (datum as { itemStyle?: { color?: string } }).itemStyle?.color),
    );

    expect(colors.size).toBe(1);
    expect([...colors][0]).toBe(CHART_SECTION.cost);
  });

  it("la tabla NO lleva punto de color: diecisiete puntos iguales no distinguen nada", () => {
    const { cards } = conAnexo();

    for (const row of cards[0].table.rows) {
      expect(row.color).toBeUndefined();
    }
  });

  it("la vista declara que se lee en ANUAL y que no siembra marcas", () => {
    // Su anexo es «del 01 de enero al 30 de junio» en UNA columna por rubro; en mensual saldrían
    // seis barras por rubro, que es su evolución y no su reparto.
    const anexo = PRESET_VIEWS.find((preset) => preset.id === EXPENSE_DISTRIBUTION_PRESET);
    const ventas = PRESET_VIEWS.find((preset) => preset.id === BUSINESS_LINES_PRESET);

    expect(anexo?.frequency).toBe("anual");
    expect(anexo?.seeds).toBeUndefined();
    // «Ventas» sí reparte por establecimiento y mes, y por eso los marca: son dos vistas distintas
    // y cada una declara lo suyo, en vez de un `if` en el proveedor.
    expect(ventas?.seeds).toEqual({ centers: true, periods: true });
    expect(ventas?.frequency).toBeUndefined();
  });

  it("en anual cada rubro es UNA columna, que es el gráfico de la muestra", () => {
    const anual = ctx([CULTURA_MANOR_SOURCE], "cultura-manor", { frequency: "anual" });
    const { cards } = buildGraficosCards(
      anual,
      withFilters({ preset: EXPENSE_DISTRIBUTION_PRESET }),
    );
    const xAxis = cards[0].option?.xAxis;
    const axis = Array.isArray(xAxis) ? xAxis[0] : xAxis;
    const rubros = cards[0].table.rows.filter((row) => row.id !== "__total__");

    expect(axis?.data).toHaveLength(rubros.length);
    expect(cards[0].option?.series).toHaveLength(1);
  });
});

describe("las cuentas que la vista del anexo siembra", () => {
  it("son las MISMAS que dibuja: las de movimiento del árbol de gastos", () => {
    const source = activeSource(MANOR);
    const anexo = PRESET_VIEWS.find((preset) => preset.id === EXPENSE_DISTRIBUTION_PRESET);
    const sembradas = anexo?.seedCodes?.(source) ?? [];
    const { cards } = buildGraficosCards(
      MANOR,
      withFilters({ preset: EXPENSE_DISTRIBUTION_PRESET }),
    );
    const dibujadas = cards[0].table.rows.filter((row) => row.id !== "__total__").map((r) => r.id);

    // Lo dibujado es un subconjunto de lo sembrado: solo se cae lo que no se movió en el tramo.
    expect(sembradas.length).toBeGreaterThan(0);
    for (const code of dibujadas) {
      expect(sembradas).toContain(code);
    }
  });

  it("«Ventas» NO puede sembrar cuentas: sus categorías no son cuentas del plan", () => {
    const ventas = PRESET_VIEWS.find((preset) => preset.id === BUSINESS_LINES_PRESET);

    expect(ventas?.seedCodes).toBeUndefined();
  });

  it("desmarcar un rubro lo quita del reparto y del cuadre a la vez", () => {
    const source = activeSource(MANOR);
    const todas =
      PRESET_VIEWS.find((p) => p.id === EXPENSE_DISTRIBUTION_PRESET)?.seedCodes?.(source) ?? [];
    const sinUna = todas.filter((code) => code !== "5.1.1.1.1");
    const { cards } = buildGraficosCards(
      MANOR,
      withFilters({ preset: EXPENSE_DISTRIBUTION_PRESET, codes: sinUna }),
    );
    const dibujadas = cards[0].table.rows.filter((row) => row.id !== "__total__").map((r) => r.id);

    expect(dibujadas).not.toContain("5.1.1.1.1");
    // El total NO se recalcula sobre lo que queda: sigue siendo el rollup del motor, así que la
    // columna del % suma menos de 100 y eso es lo que dice que se está mirando un trozo.
    const suma = cards[0].table.rows
      .filter((row) => row.id !== "__total__")
      .reduce((total, row) => total + Number.parseFloat(row.values[1] as string), 0);
    expect(suma).toBeLessThan(100);
  });
});

describe("el reparto en crudo, para la ventana que abre una barra", () => {
  it("sale junto a las tarjetas, porque una barra clicada necesita NÚMEROS, no cadenas", () => {
    const { annex, cards } = buildGraficosCards(
      MANOR,
      withFilters({ preset: EXPENSE_DISTRIBUTION_PRESET }),
    );
    const rubros = cards[0].table.rows.filter((row) => row.id !== "__total__");

    expect(annex).not.toBeNull();
    expect(annex?.totalExpenses).not.toBeNull();
    expect(typeof annex?.categories[0].value).toBe("number");
    // El índice de una barra ES la posición aquí: las dos listas van de mayor a menor por el mismo
    // sitio, y si dejaran de estarlo la ventana hablaría de un rubro distinto del que se pulsó.
    expect(annex?.categories.map((category) => category.code).slice(0, rubros.length)).toEqual(
      rubros.map((row) => row.id),
    );
  });

  it("es null fuera de la vista: nada que abrir donde no hay reparto", () => {
    expect(buildGraficosCards(MANOR, emptyFilters()).annex).toBeNull();
  });
});

describe("el corte del anexo es el MISMO en las dos tarjetas", () => {
  /** Un plan con más rubros de los que caben, para ver el pliegue de verdad. */
  const MUCHOS = ctx(
    [
      {
        ...CULTURA_MANOR_SOURCE,
        valuesByCode: new Map([
          ...CULTURA_MANOR_SOURCE.valuesByCode,
          ...Array.from({ length: 20 }, (_, i): [string, number[]] => [
            `5.1.9.${i + 1}`,
            Array.from({ length: 12 }, () => (20 - i) * 100),
          ]),
        ]),
        namesByCode: new Map([
          ...CULTURA_MANOR_SOURCE.namesByCode,
          ...Array.from({ length: 20 }, (_, i): [string, string] => [
            `5.1.9.${i + 1}`,
            `Gasto ${i + 1}`,
          ]),
        ]),
        parentByCode: new Map([
          ...CULTURA_MANOR_SOURCE.parentByCode,
          ...Array.from({ length: 20 }, (_, i): [string, string] => [`5.1.9.${i + 1}`, "5.1"]),
        ]),
      },
    ],
    "cultura-manor",
  );

  const conMuchos = () =>
    buildGraficosCards(MUCHOS, withFilters({ preset: EXPENSE_DISTRIBUTION_PRESET }));

  it("barras y dona dibujan quince y la última es «Otros»", () => {
    const { cards } = conMuchos();
    const barras = cards[0].option?.series[0].data ?? [];
    const dona = cards[1].table.rows;

    expect(barras).toHaveLength(ANNEX_MAX_SLICES);
    expect(dona).toHaveLength(ANNEX_MAX_SLICES);
    // «Otros» no va al final: la tabla ordena por monto y el pliegue suma más que varios rubros
    // sueltos, así que cae donde su cifra lo pone. Lo que importa es que ESTÉ.
    expect(dona.map((row) => row.id)).toContain(OTHERS_CODE);
  });

  it("las dos listan EXACTAMENTE los mismos rubros, «Otros» incluido", () => {
    // Es lo que antes no se cumplía: cada tarjeta cortaba por su cuenta y podían enseñar distinto
    // número de rubros del mismo reparto, un desacuerdo que nadie lee como un error.
    const { cards } = conMuchos();
    const ejeX = cards[0].option?.xAxis;
    const barras = (Array.isArray(ejeX) ? ejeX[0] : ejeX)?.data ?? [];
    const dona = cards[1].table.rows.map((row) => row.label);

    expect(barras).toEqual(dona);
  });

  it("la nota dice cuántos agrupó y que la tabla los lista uno a uno", () => {
    const { cards } = conMuchos();

    expect(cards[0].note).toContain("«Otros» agrupa");
    expect(cards[0].note).toContain("la tabla lista uno a uno");
  });

  it("la TABLA del anexo no corta: siguen ahí todos con su cifra", () => {
    const { cards } = conMuchos();
    const rubros = cards[0].table.rows.filter((row) => row.id !== "__total__");

    expect(rubros.length).toBeGreaterThan(ANNEX_MAX_SLICES);
    expect(rubros.map((row) => row.id)).not.toContain(OTHERS_CODE);
  });
});
