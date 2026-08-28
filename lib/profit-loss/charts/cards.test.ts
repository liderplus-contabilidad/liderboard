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
import { ANNEX_MAX_SLICES, DECLARED_ANNEX_ROWS } from "./expense-distribution";
import { emptyFilters, type PygFilters, withPresetSelected } from "../filters";
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
import { expenseRootsOf, leavesOfAny, presetQuery, sumOver } from "./presets";
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
    // The real establishments; the test sources bring neither Consolidado nor «Sin centro».
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
/** The same center with the whole root 4 at zero: the percentage's base disappears, the expenses do
 *  not. */
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
 * The same center with EVERY hotel label renamed: neither the branch nor its children declare
 * anything. Renaming only the branch is not enough since the node is also recognised by its children
 * —which is what makes the view appear in a plan that does not write «hospedaje» anywhere—.
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

/* -------------------------------------------------------------- the list's contract */

describe("el contrato de la lista", () => {
  it("Gráficos declara cinco tarjetas, en el orden que la vista posiciona", () => {
    const { cards } = buildGraficosCards(MANOR, emptyFilters());

    expect(cards.map((card) => card.id)).toEqual([
      "evolucion",
      "composicion",
      "ranking",
      "distribucion",
      "cascada",
    ]);
  });

  it("la composición son BARRAS y no una tarta, la misma forma del ranking que sigue", () => {
    const { cards } = buildGraficosCards(MANOR, emptyFilters());
    const composicion = cards[1];
    const ranking = cards[2];

    // Both are the same breakdown ordered largest to smallest: a pie would say it by an angle that
    // has to be estimated, and with the labels outside and piled on one edge with guide lines.
    expect(composicion.option?.series[0].type).toBe("bar");
    expect(ranking.option?.series[0].type).toBe("bar");
    // The category axis carries one line per account, in the order it draws.
    expect(composicion.option?.yAxis).toMatchObject({ type: "category", inverse: true });
    const drawn = composicion.option?.yAxis;
    expect(!Array.isArray(drawn) && drawn?.data).toEqual(
      composicion.table.rows.map((row) => row.label),
    );
  });

  it("lo excluido del reparto no se nombra ya como «fuera del pastel»", () => {
    const { cards } = buildGraficosCards(MANOR, emptyFilters());

    // The annex, which is STILL a pie, keeps the default lead.
    expect(cards[1].note).toContain("Fuera del reparto —");
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
      ["Composición de los ingresos", 320],
      ["Ranking de gastos", 520],
      ["Distribución de Ventas", 320],
      ["Del ingreso a la utilidad", 340],
    ]);
    expect(analisis.cards.map((card) => [card.title, card.height])).toEqual([
      ["Gastos principales sobre ingresos", 300],
      ["Variación contra el periodo anterior", 300],
      ["Concentración de gastos", 300],
    ]);
  });

  /**
   * The ⓘ's guide: it exists for every card and in every state, because the real failure mode is not
   * a badly written sentence —that is visible— but a NEW card that forgets to bring it, and there the
   * icon simply is not drawn and nothing gives it away.
   */
  it("toda tarjeta trae su guía, en los tres estados de la primera", () => {
    const estados = [
      buildGraficosCards(MANOR, emptyFilters()),
      buildGraficosCards(MANOR, withFilters({ preset: BUSINESS_LINES_PRESET })),
      buildGraficosCards(MANOR, withFilters({ preset: EXPENSE_DISTRIBUTION_PRESET })),
    ];

    for (const { cards } of [...estados, buildAnalisisCards(MANOR, emptyFilters())]) {
      for (const card of cards) {
        expect(card.guide?.purpose, card.title).toBeTruthy();
        expect(card.guide?.actions.length ?? 0, card.title).toBeGreaterThan(0);
        // A control with no label or no effect breaks the panel's two-ink reading.
        for (const action of card.guide?.actions ?? []) {
          expect(action.control, card.title).toBeTruthy();
          expect(action.effect, card.title).toBeTruthy();
        }
      }
    }
  });

  it("la guía de una tarjeta describe ESA tarjeta y no la que ocupaba su ranura", () => {
    const porDefecto = buildGraficosCards(MANOR, emptyFilters()).cards[0];
    const ventas = buildGraficosCards(MANOR, withFilters({ preset: BUSINESS_LINES_PRESET }))
      .cards[0];
    const anexo = buildGraficosCards(MANOR, withFilters({ preset: EXPENSE_DISTRIBUTION_PRESET }))
      .cards[0];

    expect(porDefecto.guide).not.toEqual(ventas.guide);
    expect(ventas.guide).not.toEqual(anexo.guide);
    // The whole screen's only click is named where it exists, and only there.
    expect(anexo.guide?.actions.some((action) => action.control === "Pulsa una barra")).toBe(true);
    expect(porDefecto.guide?.actions.some((action) => action.control.includes("Pulsa"))).toBe(
      false,
    );
  });

  it("sin cobertura, lo que no tiene entradas no dibuja y la evolución sale vacía", () => {
    const { cards } = buildGraficosCards(VACIO, emptyFilters());

    // Composition, ranking and cascade have not a single entry: they say why instead of drawing an
    // empty plot.
    for (const card of cards.slice(1)) {
      expect(card.option).toBeNull();
      expect(card.table.rows).toEqual([]);
    }

    // The evolution does have its series —they exist, what they lack is coverage—, and every cell
    // goes EMPTY: a period that was not loaded is not the same as one loaded at zero.
    expect(cards[0].table.rows.length).toBeGreaterThan(0);
    expect(cards[0].table.rows.every((row) => row.values.every((value) => value === null))).toBe(
      true,
    );
  });
});

/* ------------------------------------------------------- the period being talked about */

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
    // The composition carries it bare; the others carry it inside their sentence.
    expect(graficos.cards[1].subtitle).toBe("Ene–Jul");
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

/* --------------------------------------------------------------- the axis' months at 0 */

/**
 * A workspace that DECLARED August and September loaded and whose file brings them at zero: two real
 * and empty columns on the axis of every card. It is what «Ocultar meses en 0» removes, and it is the
 * only case where it exists — a month that was never loaded does not even become a column.
 */
const CON_MESES_VACIOS = ctx(
  [{ ...CULTURA_MANOR_SOURCE, coverage: new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]) }],
  "cultura-manor",
);

describe("los meses en 0 del eje", () => {
  /**
   * THE REAL CASE, the one from the screenshot: a file that runs to July draws the year's TWELVE
   * columns —the axis is the frequency's, not the coverage's—, so Aug–Dec come out empty even though
   * the tiles say «Ene–Jul». They are the ones the button removes, and counting them against the
   * COVERED months instead of against the drawn columns gave zero and the button never showed up.
   */
  it("cuenta los meses vacíos contra las columnas DIBUJADAS, no contra los cubiertos", () => {
    const { periods, periodName, emptyPeriods } = buildGraficosCards(MANOR, emptyFilters());

    expect(periodName).toBe("Ene–Jul");
    expect(periods).toHaveLength(7);
    // Aug–Dec: five empty columns on the axis.
    expect(emptyPeriods).toBe(5);
  });

  it("ocultándolos el eje se queda en los siete meses con movimiento", () => {
    const { cards, periodName } = buildGraficosCards(MANOR, emptyFilters(), {
      hideEmptyPeriods: true,
    });

    expect(periodName).toBe("Ene–Jul");
    // The axis the first card draws: without Aug–Dec.
    const axis = cards[0].option?.xAxis;
    const categories = Array.isArray(axis) ? axis[0].data : axis?.data;
    expect(categories).toEqual(["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul"]);
  });

  it("un mes NUNCA cargado y uno cargado en cero se van los dos: los dos son columna vacía", () => {
    // The «a null is not a 0» distinction belongs to the ENGINE and is still intact —the tiles and
    // the label read it—; the button talks about what is DRAWN, and there both are a column with
    // nothing in it.
    const { emptyPeriods } = buildGraficosCards(CON_MESES_VACIOS, emptyFilters());

    // Aug and Sep loaded at zero, plus Oct–Dec that never arrived.
    expect(emptyPeriods).toBe(5);
  });

  it("por defecto se dibujan: son columnas del año, y el rango nombra lo cubierto", () => {
    const { periods, periodName, emptyPeriods } = buildGraficosCards(
      CON_MESES_VACIOS,
      emptyFilters(),
    );

    expect(periods.map((period) => period.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(periodName).toBe("Ene–Sep");
    // How many it CAN remove, counted over the unpruned axis: it is what labels the button, and that
    // is why it does not change on pressing it — if it were counted over the pruned one, the control
    // would disappear on being used.
    expect(emptyPeriods).toBe(5);
  });

  it("ocultándolos el eje se encoge y el rótulo lo dice", () => {
    const { periods, periodName, emptyPeriods } = buildGraficosCards(
      CON_MESES_VACIOS,
      emptyFilters(),
      { hideEmptyPeriods: true },
    );

    expect(periods.map((period) => period.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(periodName).toBe("Ene–Jul");
    expect(emptyPeriods).toBe(5);
  });

  it("las CIFRAS no se mueven: un mes en cero suma cero", () => {
    const visible = buildGraficosCards(CON_MESES_VACIOS, emptyFilters());
    const podado = buildGraficosCards(CON_MESES_VACIOS, emptyFilters(), {
      hideEmptyPeriods: true,
    });

    expect(podado.tiles).toEqual(visible.tiles);
  });

  it("un hueco EN MEDIO se lee como hueco y no como rango continuo", () => {
    // March declared loaded and at zero, between two months that did move.
    const conHueco = ctx(
      [
        {
          ...CULTURA_MANOR_SOURCE,
          valuesByCode: new Map(
            [...CULTURA_MANOR_SOURCE.valuesByCode].map(([code, values]) => [
              code,
              values.map((value, index) => (index === 2 ? 0 : value)),
            ]),
          ),
        },
      ],
      "cultura-manor",
    );
    const { periodName } = buildGraficosCards(conHueco, emptyFilters(), {
      hideEmptyPeriods: true,
    });

    // `periodRangeLabel` ENUMERATES a set with gaps instead of composing sub-ranges: «Ene–Jul» would
    // claim March is summed, and the point of hiding it is that it is not.
    expect(periodName).toBe("Ene, Feb, Abr, May, Jun, Jul");
    expect(periodName).not.toContain("Ene–Jul");
  });

  it("las tarjetas heredan el eje podado, así que ninguna nombra un tramo distinto", () => {
    const { cards } = buildGraficosCards(CON_MESES_VACIOS, emptyFilters(), {
      hideEmptyPeriods: true,
    });

    for (const card of cards.slice(0, 4)) {
      expect(card.subtitle).toContain("Ene–Jul");
    }
  });

  it("fuera de mensual no hace nada: el flag ni siquiera llega", () => {
    // The view does not offer the button except in monthly; here it is checked that passing it is
    // harmless, because a covered quarter aggregates three months and is not «a month at 0».
    const trimestral = ctx(
      [{ ...CULTURA_MANOR_SOURCE, coverage: new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]) }],
      "cultura-manor",
      { frequency: "trimestral" },
    );
    const visible = buildGraficosCards(trimestral, emptyFilters());
    const podado = buildGraficosCards(trimestral, emptyFilters(), { hideEmptyPeriods: true });

    expect(podado.periods).toEqual(visible.periods);
    expect(podado.periodName).toBe(visible.periodName);
    expect(podado.emptyPeriods).toBe(0);
    expect(visible.emptyPeriods).toBe(0);
  });

  it("con el eje ACOTADO a lo que se movió no queda nada que ocultar", () => {
    // Marking Ene–Jul leaves the axis at exactly the seven months with movement: the button does not
    // show up.
    const acotado = buildGraficosCards(
      MANOR,
      withFilters({
        periods: [0, 1, 2, 3, 4, 5, 6].map((index) => ({ frequency: "mensual" as const, index })),
      }),
    );

    expect(acotado.emptyPeriods).toBe(0);
  });
});

/* ---------------------------------------------------------------- the period's figures */

describe("las cifras del periodo", () => {
  it("son el TOTAL de lo cubierto, no la última columna del eje", () => {
    const { tiles } = buildGraficosCards(MANOR, emptyFilters());

    // A normal month bills 25,229; the seven covered ones add up to 176,303 (February brings no
    // Ventas Eventos). Reading a single column was what left the card at 25,229 with six months in
    // sight.
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
    // The seven months minus July.
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

    // 20,901 monthly in root 5 (the usual 20,121 plus the 780 of branch 5.2 that was left) and 900
    // reclassified into root 6: leaving 6 out would give a profit 6,300 higher.
    expect(tiles[1].value).toBe(21801 * 7);
    expect(tiles[2].value).toBe(176303 - 21801 * 7);
  });
});

/* ------------------------------------------------------------------ what the filters mark */

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

    // The composition is left with the only marked income leaf…
    expect(cards[1].table.rows.map((row) => row.id)).toEqual(["4.1.1.1.1.1"]);
    // …and the ranking with the four hanging off 5.1.5, without the salary, which hangs off 5.1.1.
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
    // «Ene–Mar» would claim February is summed, and the filter left it out.
    expect(periodName).toBe("Ene, Mar");
  });

  it("marcar una cuenta y otra que la contiene anota el porcentaje y dice cuál es la base", () => {
    const { cards } = buildGraficosCards(MANOR, withFilters({ codes: ["4", "4.1.1"] }));

    expect(cards[0].note).toBe(
      "El porcentaje de cada barra es lo que la cuenta ocupa dentro de la marcada que la contiene: Ventas Alojamiento y Servicios dentro de Ingresos.",
    );
    // The child carries it; the parent, which falls inside nothing marked, does not.
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

    // The comparison axis is not declared: two default accounts (Ingresos and Costos y Gastos)
    // against two marked centers are four series, and that is what the card announces.
    expect(cards[0].table.rows).toHaveLength(4);
    expect(cards[0].subtitle).toBe("4 series · Ene–Jul");
  });
});

/* ------------------------------------------------------- the order of the colour slots */

describe("el color se resuelve DESPUÉS de rankear", () => {
  /**
   * This module's fragile invariant. In the fixture, «Arrendamiento Operativo» (5.1.5.12) is the LAST
   * expense in file order and the SECOND by amount (8,000 against the salary's 9,000). If the colours
   * were resolved over the unranked list, its bar would come out painted with slot 4 instead of 1 —
   * and since the drawing IS ranked, the card's first bar would take a colour that is not its own.
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
    // What would come out if the colour had been resolved in file order.
    expect(rows[1].color).not.toBe(CHART_PALETTE[4]);
  });

  /**
   * The fifteen bars come from fifteen DIFFERENT hues. The fixture only reaches five expenses, so what
   * is tested here is the resolver the card uses, with the list of fifteen a real plan does produce:
   * the first eight keep their identity slots and the following ones take the period set, without
   * repeating any or falling back to the neutral. The table twin reads the SAME resolver, which is
   * what ties each colour dot to its bar.
   */
  it("las quince barras varían, en vez de repetir el neutro ni una sola gama", () => {
    const codes = Array.from({ length: CHART_RANKING_MAX }, (_, i) => `5.1.5.${i}`);
    const colorOf = rankingColorOf(codes);
    const colors = codes.map(colorOf);

    expect(colors.slice(0, CHART_PALETTE.length)).toEqual([...CHART_PALETTE]);
    expect(new Set(colors).size).toBe(CHART_RANKING_MAX);
    expect(colors).not.toContain(CHART_NEUTRAL);
  });

  /**
   * The composition is NOT painted with the identity slots: it has its own warm set, asked for by the
   * firm. What this test protects is that the pie and its table twin read the SAME one, because each
   * row's colour dot is what ties a slice to its account — and that the breakdown's order is what
   * gives the hue, which is the only thing that set says.
   */
  it("la composición toma su set propio y no las ranuras de identidad", () => {
    const { cards } = buildGraficosCards(MANOR, emptyFilters());
    const composicion = cards.find((card) => card.id === "composicion");
    const rows = composicion?.table.rows ?? [];

    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0].color).toBe(CHART_COMPOSITION_PALETTE[0]);
    expect(rows[1].color).toBe(CHART_COMPOSITION_PALETTE[1]);
    expect(rows[0].color).not.toBe(CHART_PALETTE[0]);

    // The hue comes from the PLACE in the breakdown, and the breakdown comes largest to smallest.
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

/* ------------------------------------------------- what is computed over the sums */

describe("el porcentaje sobre ingresos", () => {
  it("es Σ cuenta ÷ Σ ingresos, no el promedio de los porcentajes de cada mes", () => {
    const bundle = buildSeries([CULTURA_MANOR_SOURCE], presetQuery(["4", "5.1.1.1.1"], MANOR));
    const sueldo = sumOver(bundle, "5.1.1.1.1") as number;
    const ingresos = sumOver(bundle, "4") as number;

    // February brings no Ventas Eventos, so its percentage is higher than the others': the average of
    // the seven percentages is NOT the percentage of the sums, and it is the latter that counts.
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

/* ------------------------------------------------------------------------ the notes */

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

    // Five expenses and the cut is at fifteen: there is nothing to declare outside the list.
    expect(cards[2].note).toBeUndefined();
  });
});

/* --------------------------------------------------------------------- the distribution */

/**
 * What the pure layer decides —which account is broken down and which children fit— is already tested
 * in `distribution.test.ts`. What is tested here is only the seam: that the card names that account,
 * that the total's line is a query of its own and not the stack's ceiling, and that with nothing to
 * break down it says so instead of drawing.
 */
describe("la vista predeterminada de líneas de negocio", () => {
  const lines = buildGraficosCards(MANOR, withFilters({ preset: BUSINESS_LINES_PRESET }));
  const plain = buildGraficosCards(MANOR, emptyFilters());

  it("cambia la primera tarjeta y ninguna otra", () => {
    expect(lines.cards[0].title).toBe("Ventas por línea de negocio");
    // By JSON because an option carries formatters: two identical closures are not the same object.
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
    // With the months on the axis, the five categories that are not hospedaje end up crushed against
    // it, with no label of their own and no room for their figure.
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
    // Hospedaje shows three of the five marked because the other two do not sell hospedaje; without
    // saying so, a missing column reads as a missing datum.
    // The second center does not sell laundry: its column does not exist under that category.
    const sinLavanderia = {
      ...CENTRO_PRINCIPAL_SOURCE,
      valuesByCode: new Map(
        [...CENTRO_PRINCIPAL_SOURCE.valuesByCode].map(([code, values]) => [
          code,
          // Lavandería lives in two branches of the test plan: `4.1.1.5` and the external service.
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
    // They are dollars that were in the consolidado and are no longer in any column; the rest of the
    // absences are unmarkings in plain sight, in the dropdown itself.
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
    // It is the accountant's table —category × sucursal— in a single chart, and the only card that
    // reads several centers at once instead of the resolved one.
    const porCentro = buildGraficosCards(
      DOS_CENTROS,
      withFilters({
        preset: BUSINESS_LINES_PRESET,
        centerIds: ["cultura-manor", "centro-de-costo-principal"],
      }),
    );
    // The COLUMNS are the (category, establishment) pairs and the bars are still the months: the two
    // readings coexist in one chart, which is the shape of the accountant's sheet.
    // The row carries the ESTABLISHMENT and the category as a sublabel: the axis writes it once over
    // its columns instead of repeating it whole in each label.
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
    // And the chart's axis gains a second line naming each category over its columns.
    const axes = porCentro.cards[0].option?.xAxis;
    expect(Array.isArray(axes) && axes[1].data?.filter(Boolean)).toEqual([
      "Hospedaje",
      "Restaurante",
      "Lavandería",
      "Otros ingresos ordinarios",
    ]);
  });

  /* ------------------------------------------------------------------ the legend */

  it("apagar una línea la saca de las barras y la nota lo DICE", () => {
    const sinLavanderia = buildGraficosCards(
      MANOR,
      withFilters({ preset: BUSINESS_LINES_PRESET }),
      { hiddenLines: ["lavanderia"] },
    ).cards[0];

    expect(sinLavanderia.table.rows.map((row) => row.label)).toEqual([
      "Hospedaje",
      "Restaurante",
      "Otros ingresos ordinarios",
    ]);
    expect(sinLavanderia.note).toContain("Apagadas en la leyenda: Lavandería");
    // And the balance still closes: what is switched off counts as a difference, not as a hole.
    expect(sinLavanderia.note).not.toContain("sin clasificar");
  });

  it("ofrece la leyenda con las líneas del plan, también la apagada", () => {
    // It is where it is switched back on: a legend that lost the item on switching it off would have
    // nowhere to put it back from.
    expect(lines.lines.map((line) => line.label)).toEqual([
      "Hospedaje",
      "Restaurante",
      "Lavandería",
      "Otros ingresos ordinarios",
    ]);
    expect(
      buildGraficosCards(MANOR, withFilters({ preset: BUSINESS_LINES_PRESET }), {
        hiddenLines: ["lavanderia"],
      }).lines.map((line) => line.id),
    ).toContain("lavanderia");
  });

  it("fuera de la vista no hay leyenda que ofrecer", () => {
    expect(plain.lines).toEqual([]);
  });

  it("apagarlas TODAS no dibuja un gráfico vacío: lo dice", () => {
    const todas = buildGraficosCards(MANOR, withFilters({ preset: BUSINESS_LINES_PRESET }), {
      hiddenLines: ["hospedaje", "restaurante", "lavanderia", "bar", "tours", "otros"],
    }).cards[0];

    expect(todas.title).toBe("Ventas por línea de negocio");
    expect(todas.option).toBeNull();
    expect(todas.note).toContain("Todas las líneas están apagadas");
  });

  it("una marca huérfana no vacía la pantalla", () => {
    const conHuerfana = buildGraficosCards(MANOR, withFilters({ preset: BUSINESS_LINES_PRESET }), {
      hiddenLines: ["spa"],
    }).cards[0];
    expect(JSON.stringify(conHuerfana)).toBe(JSON.stringify(lines.cards[0]));
  });

  it("se queda inerte con un plan que no declara líneas", () => {
    const encendido = buildGraficosCards(SIN_HOTEL, withFilters({ preset: BUSINESS_LINES_PRESET }));
    const apagado = buildGraficosCards(SIN_HOTEL, emptyFilters());
    expect(encendido.cards[0].title).toBe(apagado.cards[0].title);
  });
});

describe("la distribución de una cuenta", () => {
  const distribucionOf = (filters: PygFilters) => buildGraficosCards(MANOR, filters).cards[3];

  it("se titula por la cuenta que reparte y lista sus hijas de mayor a menor", () => {
    const card = distribucionOf(emptyFilters());

    // With no marks it is Ingresos, which descends to `4.1` for having a single child.
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

    // 24,465 + 1,271 − 507 = 25,229: the negative child stacks downwards, so the net is at no edge of
    // the stack and the line is the only thing that says it.
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
    // `4.1.1.6 Ventas Teléfono` is permanently at zero.
    expect(distribucionOf(withFilters({ codes: ["4.1.1"] })).note).toContain(
      "1 cuenta quedó fuera",
    );
  });

  it("sin cobertura no dibuja nada", () => {
    const card = buildGraficosCards(VACIO, emptyFilters()).cards[3];

    expect(card.option).toBeNull();
    expect(card.table.rows).toEqual([]);
  });
});

/* --------------------------------------------------------------- each account's code */

/**
 * The account code's end-to-end seam: the rule lives in `option.ts` and is tested there, but what can
 * break here is that a card stops going through those builders —a table assembled by hand, an
 * `entryTable` of its own— and loses the code with no test of figures noticing. It is looked up by
 * `id` and not by index because the cards' order belongs to the list.
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
      // The variation does not come in: the fixture's months repeat the same amount, so no account
      // moves and the card comes out empty. It comes out of the SAME `entryTable` as these two, and
      // `option.test.ts` tests it directly over its own entries.
      [analisis.cards, "pareto"],
    ] as const) {
      const rows = rowsOf(cards, id);
      expect([id, rows.length > 0]).toEqual([id, true]);

      for (const row of rows) {
        // «Otros» is the tail's fold, not an account: it is the only row left without one.
        if (row.label === "Otros") {
          expect(row.sublabel).toBeUndefined();
          continue;
        }
        // A row's id is the bare code (the amount tables) or `code|center|year` (the series ones); in
        // both, the code is what opens the id.
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

/* ------------------------------------- the costs and expenses preset view */

describe("la vista predeterminada de costos y gastos", () => {
  const conAnexo = () =>
    buildGraficosCards(MANOR, withFilters({ preset: EXPENSE_DISTRIBUTION_PRESET }));

  it("se ofrece con CUALQUIER plan que declare cuentas de gasto, venga de donde venga", () => {
    // It was tied to MicroPlus for legibility, and what gives it today is the card's CUT —fourteen
    // lines and «Otros»—, which does not depend on the system. This file's two plans are of different
    // formats and both receive it.
    for (const context of [SIN_HOTEL, MANOR]) {
      const ids = availablePresets({ source: activeSource(context) }).map((preset) => preset.id);

      expect(ids).toContain(EXPENSE_DISTRIBUTION_PRESET);
    }
  });

  it("un plan sin cuentas de gasto que repartir no la recibe", () => {
    // The only condition left, and it is structural: with fewer than two lines «distribución» is the
    // same computation under another name.
    const ids = availablePresets({ source: undefined }).map((preset) => preset.id);

    expect(ids).not.toContain(EXPENSE_DISTRIBUTION_PRESET);
  });

  it("«Ventas» sigue dependiendo del PLAN, y las dos condiciones son distintas", () => {
    // One looks at the tree's labels (hospedaje, restaurante); the other, at there being expense to
    // break down. A plan with no hotel lines receives the annex and not «Ventas».
    const sinHotel = availablePresets({ source: activeSource(SIN_HOTEL) }).map((p) => p.id);
    const conHotel = availablePresets({ source: activeSource(MANOR) }).map((p) => p.id);

    expect(sinHotel).not.toContain(BUSINESS_LINES_PRESET);
    expect(sinHotel).toContain(EXPENSE_DISTRIBUTION_PRESET);
    expect(conHotel).toContain(BUSINESS_LINES_PRESET);
  });

  it("ocupa dos ranuras y RINDE la de «Distribución», que hablaba de ingresos", () => {
    const { cards } = conAnexo();

    expect(cards.map((card) => [card.id, card.title])).toEqual([
      ["evolucion", "Distribución de costos y gastos"],
      ["ranking", "Distribución de costos y gastos %"],
      // Behind the annex the order is the SAME as outside it: the composition says what is made of
      // what came in —and it is the context for the «% del ingreso» column— and the cascade closes
      // with the path from revenue to result.
      ["composicion", "Composición de los ingresos"],
      ["cascada", "Del ingreso a la utilidad"],
    ]);
    // «Distribución» breaks down ONE account and with fifteen marked it resolved to Ingresos: under an
    // expense annex it was a card breaking down revenue with nothing to do with what is being read.
    expect(cards.map((card) => card.id)).not.toContain("distribucion");
  });

  it("apagada, la lista vuelve a ser exactamente la de siempre", () => {
    // Including the last two in their usual order: outside the annex the composition accompanies the
    // breakdown above and the cascade closes with the complete story.
    const { cards } = buildGraficosCards(MANOR, emptyFilters());

    expect(cards.map((card) => card.title)).toEqual([
      "Ingresos contra Costos y Gastos",
      "Composición de los ingresos",
      "Ranking de gastos",
      "Distribución de Ventas",
      "Del ingreso a la utilidad",
    ]);
  });

  it("la tabla gemela ES el anexo: código, valor y las DOS columnas de porcentaje", () => {
    const { cards } = conAnexo();
    const anexo = cards[0].table;

    expect(anexo.columns).toEqual(["Valor", "% del gasto", "% del ingreso"]);
    // The code goes apart from the name: in a table there is room for both.
    expect(anexo.rows[0].sublabel).toBe("5.1.1.1.1");
    expect(anexo.rows[0].values).toHaveLength(3);
  });

  it("cierra con una fila de TOTAL destacada, que es contra lo que se coteja", () => {
    const { cards, tiles } = conAnexo();
    const rows = cards[0].table.rows;
    const total = rows.at(-1);

    expect(total?.id).toBe("__total__");
    expect(total?.emphasis).toBe(true);
    // The same figure as the «Costos y Gastos» tile: one single definition of the total.
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
    // In the fixture the expense is smaller than the revenue, so every line weighs less over revenue.
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
    // «Otros · 16.6 %» hides exactly what one comes here to read, the opposite of the revenue
    // composition, where the seventh account does not change the answer to «what is the total made
    // of».
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
    // The sequence has room for more lines than a real annex brings.
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
    // Without `interval: 0` there would be seventeen bars with nine names, and the eight unlabelled
    // ones could not be identified by anything else. Splitting the text is the price, and their Excel
    // pays it too.
    const { cards } = conAnexo();
    const xAxis = cards[0].option?.xAxis;
    const axis = Array.isArray(xAxis) ? xAxis[0] : xAxis;

    expect(axis?.axisLabel?.interval).toBe(0);
    expect(axis?.axisLabel?.overflow).toBe("break");
  });

  it("las barras van TODAS del mismo color, y es el del bloque de gastos", () => {
    // Here the colour distinguishes nothing —every bar carries its line labelled and its figure—, so
    // handing out hues would spend the identity channel re-saying what the length already says.
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
    // Their annex is «from 01 January to 30 June» in ONE column per line; in monthly there would be
    // six bars per line, which is its evolution and not its breakdown.
    const anexo = PRESET_VIEWS.find((preset) => preset.id === EXPENSE_DISTRIBUTION_PRESET);
    const ventas = PRESET_VIEWS.find((preset) => preset.id === BUSINESS_LINES_PRESET);

    expect(anexo?.frequency).toBe("anual");
    expect(anexo?.seeds).toBeUndefined();
    // «Ventas» does break down by establishment and month, and that is why it marks them: they are
    // two different views and each declares its own, instead of an `if` in the provider.
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

describe("el anexo no siembra cuentas, pero se deja acotar por ellas", () => {
  it("ninguna vista siembra cuentas: el anexo son más de cien y serían más de cien chips", () => {
    // It did, and it was the way to see which ones go in; but the ones it draws are ALL the movement
    // accounts of the expense tree, and a real plan declares a hundred and thirty-one. Seeding only
    // the fourteen drawn does not work either: which ones they are depends on the amounts, and a mark
    // narrows what the annex sums, so it would take with it the «Otros» that groups the rest.
    for (const preset of PRESET_VIEWS) {
      expect(preset).not.toHaveProperty("seedCodes");
    }
  });

  it("entrar en la vista BORRA las marcas de cuenta que hubiera", () => {
    const conMarcas = { ...emptyFilters(), codes: ["5.1.1.1.1"] };

    expect(withPresetSelected(conMarcas, EXPENSE_DISTRIBUTION_PRESET).codes).toEqual([]);
  });

  it("sin marcas reparte el árbol de gastos ENTERO", () => {
    const source = activeSource(MANOR);
    const universo = leavesOfAny(source, expenseRootsOf(source));
    const { cards } = buildGraficosCards(
      MANOR,
      withFilters({ preset: EXPENSE_DISTRIBUTION_PRESET }),
    );
    const dibujadas = cards[0].table.rows.filter((row) => row.id !== "__total__").map((r) => r.id);

    // What is drawn is a subset of the universe: only what did not move in the span drops out.
    expect(dibujadas.length).toBeGreaterThan(0);
    for (const code of dibujadas) {
      expect(universo).toContain(code);
    }
  });

  it("es la vista la que declara que marcar ACOTA en vez de apagarla", () => {
    // «Ventas» groups whole branches and splits one account in two by the name of its children, so
    // there is no mark that represents what it draws and marking one does contradict it.
    const anexo = PRESET_VIEWS.find((preset) => preset.id === EXPENSE_DISTRIBUTION_PRESET);
    const ventas = PRESET_VIEWS.find((preset) => preset.id === BUSINESS_LINES_PRESET);

    expect(anexo?.narrowedByCodes).toBe(true);
    expect(ventas?.narrowedByCodes).toBeUndefined();
  });

  it("marcar rubros a mano acota el reparto y el cuadre lo dice", () => {
    const source = activeSource(MANOR);
    const todas = leavesOfAny(source, expenseRootsOf(source));
    const sinUna = todas.filter((code) => code !== "5.1.1.1.1");
    const { cards } = buildGraficosCards(
      MANOR,
      withFilters({ preset: EXPENSE_DISTRIBUTION_PRESET, codes: sinUna }),
    );
    const dibujadas = cards[0].table.rows.filter((row) => row.id !== "__total__").map((r) => r.id);

    expect(dibujadas).not.toContain("5.1.1.1.1");
    // The total is NOT recomputed over what is left: it is still the engine's rollup, so the % column
    // adds up to less than 100 and that is what says a part is being looked at.
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
    // A bar's index IS the position here: both lists run largest to smallest through the same place,
    // and if they stopped being so the window would talk about a line other than the one clicked.
    expect(annex?.categories.map((category) => category.code).slice(0, rubros.length)).toEqual(
      rubros.map((row) => row.id),
    );
  });

  it("es null fuera de la vista: nada que abrir donde no hay reparto", () => {
    expect(buildGraficosCards(MANOR, emptyFilters()).annex).toBeNull();
  });
});

describe("el anexo declara sus DOS formas para que la pantalla enseñe una", () => {
  it("nombra las dos tarjetas del par", () => {
    const { cards, annexShapes } = buildGraficosCards(
      MANOR,
      withFilters({ preset: EXPENSE_DISTRIBUTION_PRESET }),
    );
    const ids = cards.map((card) => card.id);

    // Both STILL come out: the printable report wants them together, because a printed control is a
    // button nobody can press. The one that shows only one is the screen.
    expect(annexShapes).not.toBeNull();
    expect(ids).toContain(annexShapes?.barras);
    expect(ids).toContain(annexShapes?.pastel);
    expect(annexShapes?.barras).not.toBe(annexShapes?.pastel);
  });

  it("es null fuera de la vista: no hay par que colapsar", () => {
    expect(buildGraficosCards(MANOR, emptyFilters()).annexShapes).toBeNull();
  });
});

describe("el anexo declarado llega hasta las dos tarjetas", () => {
  /**
   * A plan that declares the clinic's annex: the whole seam —the door, the query by its seventeen
   * codes and the forced label— seen from where the user looks at it. The pure layer is already
   * tested separately; what this covers is the wiring, which is where a misread field is given away
   * by no figure.
   */
  const MESES = (value: number) => Array.from({ length: 12 }, () => value);
  const RUBROS = DECLARED_ANNEX_ROWS.map((row, index) => ({
    code: row.code,
    // The chart of accounts calls them something ELSE; the annex has to override it.
    name: `Como lo llama el sistema ${index + 1}`,
    monthly: (DECLARED_ANNEX_ROWS.length - index) * 100,
  }));
  const CLINICA = ctx(
    [
      {
        centerId: "clinica",
        centerName: "Clínica",
        year: 2026,
        baseFrequency: "mensual",
        valuesByCode: new Map<string, number[]>([
          ["4", MESES(50_000)],
          ["5", MESES(RUBROS.reduce((total, rubro) => total + rubro.monthly, 0))],
          ...RUBROS.map((rubro): [string, number[]] => [rubro.code, MESES(rubro.monthly)]),
        ]),
        namesByCode: new Map<string, string>([
          ["4", "INGRESOS"],
          ["5", "COSTOS Y GASTOS"],
          ...RUBROS.map((rubro): [string, string] => [rubro.code, rubro.name]),
        ]),
        parentByCode: new Map<string, string>(
          RUBROS.map((rubro): [string, string] => [rubro.code, "5"]),
        ),
        coverage: new Set(Array.from({ length: 12 }, (_, index) => index)),
      },
    ],
    "clinica",
    { frequency: "anual" },
  );

  it("las dos tarjetas dibujan los diecisiete rubros con el rótulo de la hoja", () => {
    const { cards } = buildGraficosCards(
      CLINICA,
      withFilters({ preset: EXPENSE_DISTRIBUTION_PRESET }),
    );
    const barras = cards[0].option?.xAxis;
    const eje = (Array.isArray(barras) ? barras[0] : barras)?.data ?? [];

    expect(eje).toEqual(DECLARED_ANNEX_ROWS.map((row) => row.label));
    expect(cards[1].table.rows.map((row) => row.label)).toEqual(eje);
    // Not even a «Como lo llama el sistema» on screen.
    expect(eje.some((label) => String(label).startsWith("Como lo llama"))).toBe(false);
  });

  it("no pliega la cola: son diecisiete y no catorce más «Otros»", () => {
    const { cards } = buildGraficosCards(
      CLINICA,
      withFilters({ preset: EXPENSE_DISTRIBUTION_PRESET }),
    );

    expect(cards[0].option?.series[0].data).toHaveLength(DECLARED_ANNEX_ROWS.length);
    expect(cards[1].table.rows.map((row) => row.id)).not.toContain(OTHERS_CODE);
  });

  it("un plan que no lo declara sigue repartiendo por cuentas de movimiento", () => {
    const { cards } = buildGraficosCards(
      MANOR,
      withFilters({ preset: EXPENSE_DISTRIBUTION_PRESET }),
    );
    const eje = cards[0].option?.xAxis;
    const labels = (Array.isArray(eje) ? eje[0] : eje)?.data ?? [];

    expect(labels).not.toContain("HONORARIOS MEDICOS");
    expect(labels).toContain("Sueldo Básico");
  });
});

describe("el corte del anexo es el MISMO en las dos tarjetas", () => {
  /** A plan with more lines than fit, to see the fold for real. */
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
    // «Otros» does not go at the end: the table orders by amount and the fold adds up to more than
    // several loose lines, so it falls where its figure puts it. What matters is that it IS there.
    expect(dona.map((row) => row.id)).toContain(OTHERS_CODE);
  });

  it("las dos listan EXACTAMENTE los mismos rubros, «Otros» incluido", () => {
    // It is what used to fail: each card cut on its own and they could show a different number of
    // lines of the same breakdown, a disagreement nobody reads as an error.
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
