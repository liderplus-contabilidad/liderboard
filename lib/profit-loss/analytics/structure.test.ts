import { describe, expect, it } from "vitest";
import { CENTRO_PRINCIPAL_SOURCE, CULTURA_MANOR_SOURCE, makeSeries, makeSource } from "./fixtures";
import { buildSeries } from "./series";
import {
  toPareto,
  toPctOfAccount,
  toPctOfContainer,
  toPctOfRevenue,
  toPieSlices,
  type AmountEntry,
} from "./structure";
import type { AnalyticsSource, Series } from "./types";

const ARRENDAMIENTO = "5.1.5.12";

function seriesOf(code: string, source: AnalyticsSource): Series {
  return buildSeries([source], {
    codes: [code],
    centerIds: [source.centerId],
    years: [source.year],
    frequency: "mensual",
  }).series[0];
}

describe("toPctOfAccount", () => {
  const sources = [CULTURA_MANOR_SOURCE, CENTRO_PRINCIPAL_SOURCE];

  it("divides by a base that is not the revenue root", () => {
    const pct = toPctOfAccount(seriesOf(ARRENDAMIENTO, CULTURA_MANOR_SOURCE), sources, "5");
    // 8.000 dentro de unos costos de 20.121.
    expect(pct.points[0].value ?? 0).toBeCloseTo(39.76, 2);
  });

  it("divides a series that does not hang from the base", () => {
    // Un gasto sobre los ingresos: el caso normal del análisis vertical, no una excepción.
    const pct = toPctOfAccount(seriesOf(ARRENDAMIENTO, CULTURA_MANOR_SOURCE), sources, "4");
    expect(ARRENDAMIENTO.startsWith("4")).toBe(false);
    expect(pct.points[0].value ?? 0).toBeCloseTo(31.71, 2);
  });

  it("returns everything null when the base is not in the source", () => {
    const pct = toPctOfAccount(seriesOf(ARRENDAMIENTO, CULTURA_MANOR_SOURCE), sources, "9.9.9");
    expect(pct.points.every((point) => point.value === null)).toBe(true);
  });

  it("divides each center by its own base", () => {
    const manor = toPctOfAccount(seriesOf(ARRENDAMIENTO, CULTURA_MANOR_SOURCE), sources, "5");
    const principal = toPctOfAccount(
      seriesOf(ARRENDAMIENTO, CENTRO_PRINCIPAL_SOURCE),
      sources,
      "5",
    );
    // Los dos centros están ~100× separados en absoluto; sobre su propia base son el mismo peso.
    expect(manor.points[0].value ?? 0).toBeCloseTo(principal.points[0].value ?? 0, 6);
  });

  it("keeps the key and the container", () => {
    const series = seriesOf(ARRENDAMIENTO, CULTURA_MANOR_SOURCE);
    const pct = toPctOfAccount(series, sources, "5");
    expect(pct.key).toEqual(series.key);
    expect(pct.container).toEqual(series.container);
  });

  it("propagates the uncovered periods", () => {
    const pct = toPctOfAccount(seriesOf(ARRENDAMIENTO, CULTURA_MANOR_SOURCE), sources, "5");
    expect(pct.points[7].value).toBeNull();
  });
});

describe("toPctOfRevenue", () => {
  const sources = [CULTURA_MANOR_SOURCE, CENTRO_PRINCIPAL_SOURCE];

  it("expresses an account as a share of its own revenue", () => {
    const pct = toPctOfRevenue(seriesOf(ARRENDAMIENTO, CULTURA_MANOR_SOURCE), sources);
    // 8.000 sobre ingresos de 25.229.
    expect(pct.points[0].value ?? 0).toBeCloseTo(31.71, 2);
  });

  it("divides each center by its own revenue, not by the consolidated one", () => {
    const manor = toPctOfRevenue(seriesOf(ARRENDAMIENTO, CULTURA_MANOR_SOURCE), sources);
    const principal = toPctOfRevenue(seriesOf(ARRENDAMIENTO, CENTRO_PRINCIPAL_SOURCE), sources);

    const manorRevenue = CULTURA_MANOR_SOURCE.valuesByCode.get("4")?.[0] as number;
    const principalRevenue = CENTRO_PRINCIPAL_SOURCE.valuesByCode.get("4")?.[0] as number;
    expect(manor.points[0].value ?? 0).toBeCloseTo((8000 / manorRevenue) * 100, 6);
    expect(principal.points[0].value ?? 0).toBeCloseTo((80 / principalRevenue) * 100, 6);

    // The two centers are ~100× apart in absolute terms; normalized they are both readable
    // on the same axis. Against the consolidated revenue the small one would round to zero.
    expect(manorRevenue / principalRevenue).toBeGreaterThan(90);
    expect(principal.points[0].value ?? 0).toBeGreaterThan(25);
  });

  it("returns null for a period with no revenue instead of Infinity", () => {
    const noRevenue = makeSource({
      centerId: "solo-gastos",
      centerName: "Solo Gastos",
      omit: ["4.1.1.1.1.1", "4.1.1.2", "4.1.1.3", "4.1.1.5", "4.1.1.6", "4.1.4", "4.1.8.4"],
    });
    const pct = toPctOfRevenue(seriesOf(ARRENDAMIENTO, noRevenue), [noRevenue]);
    expect(noRevenue.valuesByCode.get("4")?.[0]).toBe(0);
    expect(pct.points.every((point) => point.value === null)).toBe(true);
  });

  it("propagates the uncovered periods", () => {
    const pct = toPctOfRevenue(seriesOf(ARRENDAMIENTO, CULTURA_MANOR_SOURCE), sources);
    expect(pct.points[7].value).toBeNull();
  });

  it("returns null when the series has no source in the list", () => {
    const pct = toPctOfRevenue(seriesOf(ARRENDAMIENTO, CULTURA_MANOR_SOURCE), []);
    expect(pct.points.every((point) => point.value === null)).toBe(true);
  });
});

describe("toPctOfContainer", () => {
  it("expresses an account as a share of its parent", () => {
    const pct = toPctOfContainer(seriesOf("4.1.1.1", CULTURA_MANOR_SOURCE));
    // 17.338 dentro de 24.465.
    expect(pct.points[0].value ?? 0).toBeCloseTo(70.87, 2);
  });

  it("returns everything null for a root account", () => {
    const root = seriesOf("4", CULTURA_MANOR_SOURCE);
    expect(root.container).toBeNull();
    expect(toPctOfContainer(root).points.every((point) => point.value === null)).toBe(true);
  });

  it("returns null where the parent is zero", () => {
    const series = makeSeries([50, 30], { container: [100, 0] });
    expect(
      toPctOfContainer(series)
        .points.slice(0, 2)
        .map((p) => p.value),
    ).toEqual([50, null]);
  });

  it("keeps the key and the container", () => {
    const series = seriesOf("4.1.1.1", CULTURA_MANOR_SOURCE);
    const pct = toPctOfContainer(series);
    expect(pct.key).toEqual(series.key);
    expect(pct.container).toEqual(series.container);
  });
});

describe("toPareto", () => {
  const gastos: AmountEntry[] = [
    { code: "5.1.5.7", label: "Mantenimiento", value: 4134 },
    { code: "5.1.5.12", label: "Arrendamiento Operativo", value: 56000 },
    { code: "5.1.5.9", label: "Consumo Suministros de Vajilla", value: 1440 },
    { code: "5.1.5.3", label: "Publicidad", value: 16874 },
    { code: "5.1.5.14", label: "Servicios Básicos", value: 720 },
  ];

  it("orders from largest to smallest and accumulates the concentration", () => {
    const result = toPareto(gastos);
    expect(result.entries.map((entry) => entry.code)).toEqual([
      "5.1.5.12",
      "5.1.5.3",
      "5.1.5.7",
      "5.1.5.9",
      "5.1.5.14",
    ]);
    expect(result.entries[1].cumulativePct).toBeGreaterThan(85);
    expect(result.entries[4].cumulativePct).toBeCloseTo(100, 6);
    expect(result.total).toBe(79168);
  });

  it("sets aside the entries that are not positive", () => {
    const result = toPareto([
      { code: "5.1.5.12", label: "Arrendamiento", value: 56000 },
      { code: "4.1.1.6", label: "Ventas Teléfono", value: 0 },
      { code: "4.1.4", label: "Descuentos sobre Ventas", value: -507 },
    ]);
    expect(result.entries).toHaveLength(1);
    expect(result.excluded.map((entry) => entry.code)).toEqual(["4.1.1.6", "4.1.4"]);
    expect(result.total).toBe(56000);
    expect(result.entries[0].cumulativePct).toBeCloseTo(100, 6);
  });

  it("does not divide by zero when every entry is zero", () => {
    const result = toPareto([
      { code: "5.1", label: "Gastos", value: 0 },
      { code: "5.2", label: "Otros", value: 0 },
    ]);
    expect(result.entries).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.excluded).toHaveLength(2);
  });
});

describe("toPieSlices", () => {
  const nine: AmountEntry[] = Array.from({ length: 9 }, (_, i) => ({
    code: `4.1.${i + 1}`,
    label: `Cuenta ${i + 1}`,
    value: (9 - i) * 100,
  }));

  it("groups everything past the cap into «Otros»", () => {
    const result = toPieSlices(nine, { maxSlices: 6 });
    expect(result.slices).toHaveLength(6);
    expect(result.slices.slice(0, 5).map((slice) => slice.value)).toEqual([
      900, 800, 700, 600, 500,
    ]);
    const otros = result.slices[5];
    expect(otros.label).toBe("Otros");
    expect(otros.value).toBe(400 + 300 + 200 + 100);
  });

  it("excludes a negative entry, which would draw a negative angle", () => {
    const result = toPieSlices([
      { code: "4.1.1.2", label: "Ventas Restaurante", value: 6500 },
      { code: "4.1.4", label: "Rebaja y/o Descuentos sobre Ventas", value: -507 },
    ]);
    expect(result.slices.map((slice) => slice.code)).toEqual(["4.1.1.2"]);
    expect(result.excluded).toEqual([
      {
        code: "4.1.4",
        label: "Rebaja y/o Descuentos sobre Ventas",
        value: -507,
        reason: "negativo",
      },
    ]);
  });

  it("excludes an entry at zero", () => {
    const result = toPieSlices([
      { code: "4.1.1.2", label: "Ventas Restaurante", value: 6500 },
      { code: "4.1.1.6", label: "Ventas Teléfono", value: 0 },
    ]);
    expect(result.excluded[0]).toMatchObject({ code: "4.1.1.6", reason: "cero" });
  });

  it("adds no «Otros» when there are fewer entries than the cap", () => {
    const result = toPieSlices(nine.slice(0, 3), { maxSlices: 6 });
    expect(result.slices).toHaveLength(3);
    expect(result.slices.some((slice) => slice.label === "Otros")).toBe(false);
  });

  it("adds no «Otros» when the entries exactly fill the cap", () => {
    const result = toPieSlices(nine.slice(0, 6), { maxSlices: 6 });
    expect(result.slices).toHaveLength(6);
    expect(result.slices.some((slice) => slice.label === "Otros")).toBe(false);
  });

  it("makes the percentages add up to 100", () => {
    for (const entries of [nine, nine.slice(0, 3), nine.slice(0, 6)]) {
      const result = toPieSlices(entries, { maxSlices: 6 });
      const total = result.slices.reduce((sum, slice) => sum + slice.pct, 0);
      expect(Math.abs(total - 100)).toBeLessThan(0.01);
    }
  });

  it("returns no slices when nothing is drawable", () => {
    const result = toPieSlices([{ code: "4.1.4", label: "Descuentos", value: -507 }]);
    expect(result.slices).toEqual([]);
    expect(result.total).toBe(0);
  });
});
