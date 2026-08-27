import { describe, expect, it } from "vitest";
import {
  CHART_DISTRIBUTION_MAX,
  CHART_DISTRIBUTION_RAMP,
  CHART_NEUTRAL,
} from "@/lib/charts/palette";
import { buildSeries } from "../analytics/series";
import {
  CENTRO_VACIO_SOURCE,
  CULTURA_MANOR_SOURCE,
  CULTURA_MANOR_SEGMENTADO_SOURCE,
} from "../analytics/fixtures";
import type { AnalyticsSource, Series } from "../analytics/types";
import {
  DISTRIBUTION_OTHERS_CODE,
  distributionColor,
  distributionShares,
  foldDistribution,
  resolveDistributionParent,
} from "./distribution";

/**
 * The fixture's plan chains `4 → 4.1` and `5 → 5.1` with a single child, and only below that does it
 * open up: `4.1` has three children (`4.1.1`, a negative `4.1.4`, `4.1.8`) and `5.1` two. That shape
 * is what makes this module's two decisions checkable over real data of the module.
 */

function childSeries(source: AnalyticsSource, codes: string[]): Series[] {
  return buildSeries([source], {
    codes,
    centerIds: [source.centerId],
    years: [source.year],
    frequency: "mensual",
    limit: Number.MAX_SAFE_INTEGER,
  }).series;
}

/** A synthetic series with one value per month — to test the folding without depending on the plan. */
function fakeSeries(code: string, monthly: number | null): Series {
  return {
    key: { code, centerId: "c", year: 2026 },
    label: code,
    points: Array.from({ length: 3 }, (_, index) => ({
      period: { year: 2026, frequency: "mensual" as const, index },
      value: monthly,
    })),
    container: null,
  };
}

describe("qué cuenta se distribuye", () => {
  it("sin cuentas marcadas, Ingresos — y desciende la cadena de hija única", () => {
    // `4` has a single child, so distributing `4` would be a stack of one segment.
    expect(resolveDistributionParent(CULTURA_MANOR_SOURCE, [])).toEqual({
      code: "4.1",
      label: "Ventas",
    });
  });

  it("con varias marcadas, también Ingresos: varias marcas no eligen una sola cuenta", () => {
    expect(resolveDistributionParent(CULTURA_MANOR_SOURCE, ["5", "4.1.1"])?.code).toBe("4.1");
  });

  it("con exactamente una marcada, esa cuenta", () => {
    expect(resolveDistributionParent(CULTURA_MANOR_SOURCE, ["4.1.1"])).toEqual({
      code: "4.1.1",
      label: "Ventas Alojamiento y Servicios",
    });
  });

  it("una marcada con hija única desciende hasta donde hay algo que repartir", () => {
    // `5 → 5.1` is a single-child chain; `5.1` already has two.
    expect(resolveDistributionParent(CULTURA_MANOR_SOURCE, ["5"])).toEqual({
      code: "5.1",
      label: "Gastos Operacionales",
    });
  });

  it("una cuenta de movimiento no se distribuye: no tiene hijas", () => {
    expect(resolveDistributionParent(CULTURA_MANOR_SOURCE, ["4.1.1.2"])).toBeNull();
  });

  it("una cuenta que la fuente no trae no se distribuye", () => {
    expect(resolveDistributionParent(CULTURA_MANOR_SOURCE, ["9.9"])).toBeNull();
    expect(resolveDistributionParent(undefined, [])).toBeNull();
  });

  it("un estado segmentado distribuye la raíz 6 como cualquier otra", () => {
    expect(resolveDistributionParent(CULTURA_MANOR_SEGMENTADO_SOURCE, ["6"])).toEqual({
      code: "6.1",
      label: "Gastos Financieros",
    });
  });
});

describe("qué hijas se dibujan", () => {
  it("las ordena de mayor a menor, y una negativa se queda", () => {
    const series = childSeries(CULTURA_MANOR_SOURCE, ["4.1.1", "4.1.4", "4.1.8"]);
    const { series: drawn, grouped, idle } = foldDistribution(series);

    expect(drawn.map((entry) => entry.key.code)).toEqual(["4.1.1", "4.1.8", "4.1.4"]);
    expect(grouped).toBe(0);
    expect(idle).toBe(0);
  });

  it("deja fuera las que no se mueven en todo el tramo, y las cuenta", () => {
    const { series, idle } = foldDistribution([
      fakeSeries("a", 100),
      fakeSeries("b", 0),
      fakeSeries("c", null),
    ]);

    expect(series.map((entry) => entry.key.code)).toEqual(["a"]);
    expect(idle).toBe(2);
  });

  it("pliega la cola en «Otros» ordenando ANTES de cortar", () => {
    // The largest one goes last in the array: cutting by input order would leave it out.
    const entries = [
      ...Array.from({ length: 9 }, (_, index) => fakeSeries(`chica-${index}`, 10)),
      fakeSeries("grande", 1000),
    ];
    const { series, grouped } = foldDistribution(entries, 4);

    expect(series.map((entry) => entry.key.code)).toEqual([
      "grande",
      "chica-0",
      "chica-1",
      DISTRIBUTION_OTHERS_CODE,
    ]);
    expect(grouped).toBe(7);
    // 7 accounts × 10 per month.
    expect(series[3].points.map((point) => point.value)).toEqual([70, 70, 70]);
  });

  it("un periodo que ninguna plegada cubre sigue vacío en «Otros»", () => {
    const sinCobertura: Series = {
      ...fakeSeries("tardía", null),
      points: [
        { period: { year: 2026, frequency: "mensual", index: 0 }, value: null },
        { period: { year: 2026, frequency: "mensual", index: 1 }, value: 5 },
        { period: { year: 2026, frequency: "mensual", index: 2 }, value: null },
      ],
    };
    const { series } = foldDistribution(
      [fakeSeries("a", 100), fakeSeries("b", 90), sinCobertura],
      2,
    );

    expect(series[1].key.code).toBe(DISTRIBUTION_OTHERS_CODE);
    expect(series[1].points.map((point) => point.value)).toEqual([90, 95, 90]);
  });

  it("por defecto corta en los pasos de su escala, no en las ranuras de identidad", () => {
    const entries = Array.from({ length: 12 }, (_, index) => fakeSeries(`c-${index}`, 100 - index));
    const { series, grouped } = foldDistribution(entries);

    expect(series).toHaveLength(CHART_DISTRIBUTION_MAX);
    expect(series.at(-1)?.key.code).toBe(DISTRIBUTION_OTHERS_CODE);
    expect(grouped).toBe(12 - (CHART_DISTRIBUTION_MAX - 1));
  });

  it("sin cobertura no queda ninguna hija que dibujar", () => {
    const series = childSeries(CENTRO_VACIO_SOURCE, ["4.1.1", "4.1.4", "4.1.8"]);

    expect(foldDistribution(series).series).toEqual([]);
  });
});

describe("qué parte del total es cada segmento", () => {
  /** A total tailored to the case's children, so the percentages can be read by eye. */
  function fakeTotal(monthly: (number | null)[]): Series {
    return {
      ...fakeSeries("4.1", null),
      label: "Ventas",
      points: monthly.map((value, index) => ({
        period: { year: 2026, frequency: "mensual" as const, index },
        value,
      })),
    };
  }

  it("reparte el total de la línea, nombrando la cuenta que se distribuye", () => {
    const shares = distributionShares(
      [fakeSeries("a", 250), fakeSeries("b", 750)],
      fakeTotal([1000, 1000, 1000]),
      "Ventas",
    );

    expect(shares.map((share) => share.values[0])).toEqual([25, 75]);
    expect(shares.every((share) => share.baseLabel === "Ventas")).toBe(true);
    // The id is the child series': the label and the tooltip recognise it by it.
    expect(shares[0].seriesId).toBe("a|c|2026");
  });

  it("un periodo sin cobertura y un total en cero dan vacío, nunca 0 %", () => {
    const [share] = distributionShares(
      [
        {
          ...fakeSeries("a", 100),
          points: [
            { period: { year: 2026, frequency: "mensual", index: 0 }, value: 100 },
            { period: { year: 2026, frequency: "mensual", index: 1 }, value: null },
            { period: { year: 2026, frequency: "mensual", index: 2 }, value: 50 },
          ],
        },
      ],
      fakeTotal([200, 400, 0]),
      "Ventas",
    );

    expect(share.values).toEqual([50, null, null]);
  });

  it("una hija negativa ocupa un porcentaje negativo: es la que saca el neto del borde", () => {
    const shares = distributionShares(
      [fakeSeries("4.1.1", 1200), fakeSeries("4.1.4", -200)],
      fakeTotal([1000, 1000, 1000]),
      "Ventas",
    );

    expect(shares.map((share) => share.values[0])).toEqual([120, -20]);
  });
});

describe("el color sigue al tamaño, no a la cuenta", () => {
  it("da a cada segmento el paso de su lugar en la pila", () => {
    const drawn = foldDistribution([fakeSeries("a", 10), fakeSeries("b", 90)]).series;
    const colorOf = distributionColor(drawn);

    // «b» is the largest, so it goes at the bottom and takes the darkest step.
    expect(colorOf(drawn[0].key)).toBe(CHART_DISTRIBUTION_RAMP[0]);
    expect(colorOf({ code: "b", centerId: "c", year: 2026 })).toBe(CHART_DISTRIBUTION_RAMP[0]);
    expect(colorOf({ code: "a", centerId: "c", year: 2026 })).toBe(CHART_DISTRIBUTION_RAMP[1]);
  });

  it("«Otros» se lleva el neutro: no es un puesto de la escala, es lo que sobra", () => {
    const entries = Array.from({ length: 9 }, (_, index) => fakeSeries(`c-${index}`, 100 - index));
    const drawn = foldDistribution(entries).series;

    expect(distributionColor(drawn)(drawn.at(-1)!.key)).toBe(CHART_NEUTRAL);
  });

  it("una cuenta que no se dibuja no toma un paso", () => {
    const drawn = foldDistribution([fakeSeries("a", 10)]).series;

    expect(distributionColor(drawn)({ code: "fuera", centerId: "c", year: 2026 })).toBe(
      CHART_NEUTRAL,
    );
  });
});
