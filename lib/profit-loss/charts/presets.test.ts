import { describe, expect, it } from "vitest";
import { CHART_MAX_SERIES, CHART_RANKING_MAX } from "@/lib/charts/palette";
import { makeSource } from "../analytics/fixtures";
import { MAX_SERIES, buildSeries } from "../analytics/series";
import type { AnalyticsSource } from "../analytics/types";
import type { SelectionContext } from "./selection";
import {
  amountsOver,
  childrenOf,
  coveredPeriods,
  compositionQuery,
  excludedNote,
  EXPENSE_RANKING_SIZE,
  intersectWithMarked,
  lastCoveredIndex,
  leavesOf,
  movingPeriods,
  presetQuery,
  RANKING_SIZE,
  sumOver,
  topByMagnitude,
  topEntries,
} from "./presets";

const MANOR: AnalyticsSource = {
  ...makeSource(),
  centerId: "cultura-manor",
  centerName: "Cultura Manor",
};

const CONTEXT: SelectionContext = {
  sources: [MANOR],
  activeCenterId: "cultura-manor",
  frequency: "mensual",
  year: 2026,
};

describe("los presets pasan por la misma consulta que el resto del motor", () => {
  it("caps at the chart limit like any other query", () => {
    const query = presetQuery(["4", "5"], CONTEXT);

    expect(query.codes).toEqual(["4", "5"]);
    expect(query.centerIds).toEqual(["cultura-manor"]);
    expect(query.frequency).toBe("mensual");
    expect(query.limit).toBe(CHART_MAX_SERIES);
  });

  it("lifts the cap for the cards that must see everything before they reduce it", () => {
    // A real statement carries 131 expense leaves; capping first would rank the first N of
    // the file instead of the largest, which is how a ranking of $0 accounts appears.
    const query = compositionQuery(leavesOf(MANOR, "5"), CONTEXT);

    expect(query.limit ?? 0).toBeGreaterThan(MAX_SERIES);
    expect(buildSeries([MANOR], query).truncated).toBe(0);
  });

  it("follows the active (resolved) center", () => {
    const other = { ...CONTEXT, activeCenterId: "consolidado" };

    expect(presetQuery(["4"], other).centerIds).toEqual(["consolidado"]);
  });

  it("narrows the axis to the marked periods without turning them into series", () => {
    const periods = [
      { year: 2026, frequency: "mensual" as const, index: 0 },
      { year: 2026, frequency: "mensual" as const, index: 2 },
    ];
    const query = presetQuery(["4"], CONTEXT, { periods });

    expect(query.periods).toEqual(periods);
    expect(buildSeries([MANOR], query).series).toHaveLength(1);
  });

  it("draws nothing rather than falling back to a default when the codes list is empty", () => {
    const query = presetQuery([], CONTEXT);

    expect(buildSeries([MANOR], query).series).toEqual([]);
  });
});

describe("intersectWithMarked", () => {
  it("is a no-op when nothing is marked", () => {
    const universe = ["4.1.1.1.1.1", "4.1.1.2"];
    expect(intersectWithMarked(universe, [])).toBe(universe);
  });

  it("keeps every leaf under a marked ancestor", () => {
    const universe = leavesOf(MANOR, "5");
    expect(intersectWithMarked(universe, ["5.1.5"])).toEqual([
      "5.1.5.3",
      "5.1.5.7",
      "5.1.5.9",
      "5.1.5.12",
    ]);
  });

  it("keeps only the leaf itself when the mark is a leaf", () => {
    const universe = leavesOf(MANOR, "4");
    expect(intersectWithMarked(universe, ["4.1.1.2"])).toEqual(["4.1.1.2"]);
  });

  it("empties out when the marks fall entirely outside the universe", () => {
    const universe = leavesOf(MANOR, "4");
    expect(intersectWithMarked(universe, ["5.1.5.3"])).toEqual([]);
  });
});

describe("de qué se compone un total", () => {
  it("takes the movement accounts, not the single direct child", () => {
    // "5" has one child ("5.1"), which would draw a chart of one bar.
    expect(childrenOf(MANOR, "5")).toEqual(["5.1"]);
    expect(leavesOf(MANOR, "5")).toEqual([
      "5.1.1.1.1",
      "5.1.5.3",
      "5.1.5.7",
      "5.1.5.9",
      "5.1.5.12",
    ]);
  });

  it("includes the negative income row so the pie can report it as excluded", () => {
    expect(leavesOf(MANOR, "4")).toContain("4.1.4");
  });
});

describe("el periodo activo", () => {
  const bundle = buildSeries([MANOR], presetQuery(["4", "5"], CONTEXT));

  it("son los periodos cubiertos, no los doce del año", () => {
    // The file runs to July: seven columns out of the axis' twelve.
    expect(coveredPeriods(bundle).map((period) => period.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("la variación sigue necesitando la última, y es la séptima", () => {
    expect(lastCoveredIndex(bundle)).toBe(6);
  });

  it("sin cobertura no hay periodos, ni entradas, ni cifra", () => {
    const empty = buildSeries([{ ...MANOR, coverage: new Set() }], presetQuery(["4"], CONTEXT));

    expect(coveredPeriods(empty)).toEqual([]);
    expect(lastCoveredIndex(empty)).toBe(-1);
    expect(amountsOver(empty)).toEqual([]);
    expect(sumOver(empty, "4")).toBeNull();
  });

  /**
   * A LOADED month whose accounts are all worth zero: the coverage is declared by the workspace
   * (`loadedMonthsByYear`), so it exists as a column even though nothing moved. It is the case the
   * «Ocultar meses en 0» button removes from the axis, and the only one where `movingPeriods` and
   * `coveredPeriods` differ — with coverage inferred from the values there cannot be one.
   */
  const declarado = buildSeries(
    [
      {
        ...MANOR,
        coverage: new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]),
      },
    ],
    presetQuery(["4", "5"], CONTEXT),
  );

  it("los meses en 0 siguen CUBIERTOS: la cobertura la declara el workspace, no el valor", () => {
    // Aug and Sep were declared loaded and the file brings them at zero.
    expect(coveredPeriods(declarado).map((period) => period.index)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it("`movingPeriods` deja fuera el mes cubierto que no movió nada", () => {
    expect(movingPeriods(declarado).map((period) => period.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("un mes nunca cargado ya estaba fuera, así que las dos lecturas coinciden", () => {
    expect(movingPeriods(bundle)).toEqual(coveredPeriods(bundle));
  });

  it("juzga el ESTADO y no una cuenta: un mes con solo gasto se queda", () => {
    // February with no revenue at all but with its expense: the business moved, the column is real.
    const soloGasto = buildSeries(
      [
        {
          ...MANOR,
          coverage: new Set([0, 1]),
          valuesByCode: new Map([
            ["4", [10, 0, ...Array(10).fill(0)]],
            ["5", [3, 4, ...Array(10).fill(0)]],
          ]),
        },
      ],
      presetQuery(["4", "5"], CONTEXT),
    );

    expect(movingPeriods(soloGasto).map((period) => period.index)).toEqual([0, 1]);
  });

  it("sin cobertura no hay ninguno que se mueva", () => {
    const empty = buildSeries([{ ...MANOR, coverage: new Set() }], presetQuery(["4"], CONTEXT));

    expect(movingPeriods(empty)).toEqual([]);
  });

  it("suma cada cuenta sobre el eje entero, no una de sus columnas", () => {
    // July is worth 25,229 of revenue; the seven covered months are worth considerably more.
    expect(sumOver(bundle, "4")).toBe(
      bundle.series
        .find((series) => series.key.code === "4")
        ?.points.reduce((sum, point) => sum + (point.value ?? 0), 0),
    );
    expect(sumOver(bundle, "4")).toBeGreaterThan(25_229);
    expect(amountsOver(bundle).map((entry) => entry.code)).toEqual(["4", "5"]);
  });

  it("un periodo cubierto en cero no es lo mismo que uno sin cargar", () => {
    // The account exists and its only covered month is worth 0: the total is 0, not `null`.
    const enCero: AnalyticsSource = {
      ...MANOR,
      coverage: new Set([0]),
      valuesByCode: new Map([["4", Array.from({ length: 12 }, () => 0)]]),
    };
    const bundleEnCero = buildSeries([enCero], presetQuery(["4"], CONTEXT));

    expect(sumOver(bundleEnCero, "4")).toBe(0);
    expect(sumOver(bundleEnCero, "5")).toBeNull();
  });
});

describe("lo que una composición dejó fuera", () => {
  it("names the negatives one by one and counts the idle accounts", () => {
    const note = excludedNote([
      { code: "4.1.4", label: "Rebaja y/o Descuentos sobre Ventas", value: -507 },
      { code: "4.1.1.6", label: "Ventas Teléfono", value: 0 },
      { code: "4.1.1.7", label: "Ventas Parqueadero", value: 0 },
    ]);

    expect(note).toBe(
      "Fuera del pastel — negativas: Rebaja y/o Descuentos sobre Ventas; 2 cuentas sin movimiento.",
    );
  });

  it("says nothing when nothing was set aside", () => {
    expect(excludedNote([])).toBeUndefined();
  });

  it("takes the lead the card gives it", () => {
    expect(excludedNote([{ code: "5.1", label: "Gastos", value: 0 }], "Sin acumular")).toBe(
      "Sin acumular — 1 cuenta sin movimiento.",
    );
  });
});

describe("ranking", () => {
  it("sorts before cutting, so the largest cannot fall off the list", () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({
      code: `5.1.5.${index}`,
      label: `Gasto ${index}`,
      value: (index + 1) * 100,
    }));
    const ranked = topEntries(entries);

    expect(ranked.entries[0].value).toBe(1000);
    expect(ranked.entries).toHaveLength(8);
    expect(ranked.hidden).toBe(2);
  });

  it("reports nothing hidden when everything fits", () => {
    expect(topEntries([{ code: "5.1", label: "Gastos", value: 1 }]).hidden).toBe(0);
  });

  it("ranks a variation by absolute movement, so the falls are not pushed off the list", () => {
    const ranked = topByMagnitude(
      [
        { code: "5.1.5.3", label: "Publicidad", value: 120 },
        { code: "5.1.5.9", label: "Consumo Víveres", value: -1176 },
        { code: "5.1.5.7", label: "Mantenimiento", value: 1021 },
      ],
      2,
    );

    expect(ranked.entries.map((entry) => entry.code)).toEqual(["5.1.5.9", "5.1.5.7"]);
    expect(ranked.hidden).toBe(1);
  });

  /**
   * The «Ranking de gastos» cut is its scale's steps, not a loose number: if the ramp and the cut
   * drift apart, the leftover bar falls back to the neutral and nobody sees it until a client has that
   * sixteenth expense. The others stay at eight because they are painted with the identity slots,
   * which are eight.
   */
  it("el ranking de gastos corta donde acaba su rampa, y las demás siguen en ocho", () => {
    expect(EXPENSE_RANKING_SIZE).toBe(CHART_RANKING_MAX);
    expect(EXPENSE_RANKING_SIZE).toBe(15);
    expect(RANKING_SIZE).toBe(CHART_MAX_SERIES);

    const entries = Array.from({ length: 20 }, (_, index) => ({
      code: `5.1.5.${index}`,
      label: `Gasto ${index}`,
      value: (index + 1) * 100,
    }));
    const ranked = topEntries(entries, EXPENSE_RANKING_SIZE);

    expect(ranked.entries).toHaveLength(15);
    expect(ranked.hidden).toBe(5);
    // And it still sorts before cutting: the largest is the first, not the file's first.
    expect(ranked.entries[0].value).toBe(2000);
  });

  it("drops the accounts that did not move, and does not count them as hidden", () => {
    const ranked = topEntries([
      { code: "5.1.5.3", label: "Publicidad", value: 400 },
      { code: "5.1.5.9", label: "Consumo Víveres", value: 0 },
      { code: "5.1.5.7", label: "Mantenimiento", value: 0 },
    ]);

    expect(ranked.entries.map((entry) => entry.code)).toEqual(["5.1.5.3"]);
    expect(ranked.hidden).toBe(0);
  });
});
