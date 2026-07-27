import { describe, expect, it } from "vitest";
import { emptyDataset } from "../derive";
import type { OccupancyDataset } from "../types";
import { buildOccupancySeries } from "./series";
import type { OccupancyQuery } from "./types";

/** A sucursal-year with the given days filled in on the given months. */
function dataset(
  centerId: string,
  year: number,
  months: Record<number, { available?: number[]; revenue?: number[]; sold?: number[] }>,
): OccupancyDataset {
  const built = emptyDataset(year, "HOTEL A", { id: centerId, name: centerId.toUpperCase() });
  for (const [index, values] of Object.entries(months)) {
    const month = built.months[Number(index)];
    month.fromFile = true;
    const put = (target: number[], source?: number[]) =>
      (source ?? []).forEach((value, day) => {
        target[day] = value;
      });
    put(month.inputs.available, values.available);
    put(month.inputs.revenue, values.revenue);
    put(month.inputs.sold, values.sold);
  }
  return built;
}

const query = (over: Partial<OccupancyQuery> = {}): OccupancyQuery => ({
  metric: "occupancy",
  centerIds: ["a"],
  years: [2026],
  scope: "mensual",
  months: [],
  days: [],
  ...over,
});

describe("buildOccupancySeries · eje agrupado", () => {
  /** Ene 10/40, Feb 20/60, Mar 30/100, Abr 5/50 — T1 spans three months, T2 only one. */
  const filled = () =>
    dataset("a", 2026, {
      0: { sold: [10], available: [40], revenue: [300] },
      1: { sold: [20], available: [60], revenue: [400] },
      2: { sold: [30], available: [100], revenue: [500] },
      3: { sold: [5], available: [50], revenue: [200] },
    });

  it("dibuja cuatro columnas T1–T4 sobre el año entero", () => {
    const bundle = buildOccupancySeries([filled()], query({ scope: "trimestral" }));
    expect(bundle.axis.map((point) => point.label)).toEqual(["T1", "T2", "T3", "T4"]);
    expect(bundle.axis[0].monthIndexes).toEqual([0, 1, 2]);
  });

  it("dibuja dos columnas S1–S2", () => {
    const bundle = buildOccupancySeries([filled()], query({ scope: "semestral" }));
    expect(bundle.axis.map((point) => point.label)).toEqual(["S1", "S2"]);
  });

  it("colapsa el año en una sola columna", () => {
    const bundle = buildOccupancySeries([filled()], query({ scope: "anual" }));
    expect(bundle.axis).toHaveLength(1);
    expect(bundle.axis[0].monthIndexes).toHaveLength(12);
  });

  it("una razón es la razón de las sumas del periodo, no la media de sus meses", () => {
    // T1: 60 vendidas / 200 disponibles = 0,30 — no la media de 0,25, 0,33 y 0,30.
    const bundle = buildOccupancySeries([filled()], query({ scope: "trimestral" }));
    expect(bundle.series[0].values[0]).toBeCloseTo(0.3, 10);

    const adr = buildOccupancySeries([filled()], query({ scope: "trimestral", metric: "adr" }));
    expect(adr.series[0].values[0]).toBeCloseTo(20, 10); // 1200 / 60
  });

  it("un total suma sus meses en vez de promediarlos", () => {
    const bundle = buildOccupancySeries([filled()], query({ scope: "trimestral", metric: "sold" }));
    expect(bundle.series[0].values[0]).toBe(60);
    expect(bundle.series[0].values[1]).toBe(5);
  });

  it("dibuja un trimestre cubierto sólo a medias con lo que tiene", () => {
    const partial = dataset("a", 2026, { 0: { sold: [10], available: [40] } });
    const bundle = buildOccupancySeries([partial], query({ scope: "trimestral" }));
    expect(bundle.series[0].values[0]).toBeCloseTo(0.25, 10); // T1 = enero
    expect(bundle.series[0].values[1]).toBeNull(); // T2 no llegó nunca
  });

  it("marcar meses acota el eje agrupado y rotula lo que la columna contiene", () => {
    const whole = buildOccupancySeries(
      [filled()],
      query({ scope: "trimestral", months: [0, 1, 2] }),
    );
    expect(whole.axis.map((p) => p.label)).toEqual(["T1"]);

    // Dos tercios de T1 no son T1: la columna dice qué meses lleva dentro.
    const partial = buildOccupancySeries(
      [filled()],
      query({ scope: "trimestral", months: [0, 1] }),
    );
    expect(partial.axis.map((p) => p.label)).toEqual(["Ene · Feb"]);
    expect(partial.series[0].values[0]).toBeCloseTo(30 / 100, 10);
  });
});

describe("buildOccupancySeries · eje", () => {
  it("dibuja los doce meses cuando no hay periodo marcado", () => {
    const bundle = buildOccupancySeries([dataset("a", 2026, {})], query());
    expect(bundle.axis).toHaveLength(12);
    expect(bundle.axis[0].label).toBe("Ene");
    expect(bundle.axis[11].label).toBe("Dic");
  });

  it("acota el eje mensual a los meses marcados", () => {
    const bundle = buildOccupancySeries([dataset("a", 2026, {})], query({ months: [2, 6] }));
    expect(bundle.axis.map((point) => point.label)).toEqual(["Mar", "Jul"]);
  });

  it("recorre el año día a día cuando el alcance es diario y no hay mes marcado", () => {
    const bundle = buildOccupancySeries([dataset("a", 2026, {})], query({ scope: "dia" }));
    expect(bundle.axis).toHaveLength(365);
    expect(bundle.axis[0].label).toBe("1 ene");
    expect(bundle.axis[364].label).toBe("31 dic");
  });

  it("acota el eje diario al mes marcado", () => {
    const bundle = buildOccupancySeries(
      [dataset("a", 2026, {})],
      query({ scope: "dia", months: [2] }),
    );
    expect(bundle.axis).toHaveLength(31);
    expect(bundle.axis[0]).toMatchObject({ label: "1 mar", monthIndexes: [2], day: 0 });
  });

  it("usa el febrero más largo de los años comparados", () => {
    const bundle = buildOccupancySeries(
      [dataset("a", 2026, {}), dataset("a", 2028, {})],
      query({ years: [2026, 2028], scope: "dia", months: [1] }),
    );
    // 2028 es bisiesto: el eje llega al 29 y 2026 deja ese punto vacío.
    expect(bundle.axis).toHaveLength(29);
    expect(bundle.series[0].values[28]).toBeNull();
  });
});

describe("buildOccupancySeries · agregación", () => {
  const enero = dataset("a", 2026, {
    0: { available: [10, 10, 10], revenue: [900, 400, 0], sold: [9, 4, 0] },
  });

  it("agrega una métrica de ratio como ratio de sumas", () => {
    const bundle = buildOccupancySeries([enero], query({ metric: "adr", months: [0] }));
    // 1300 / 13, no el promedio de 100 y 100 y nada.
    expect(bundle.series[0].values[0]).toBeCloseTo(100, 10);
  });

  it("suma una métrica de total", () => {
    const bundle = buildOccupancySeries([enero], query({ metric: "revenue", months: [0] }));
    expect(bundle.series[0].values[0]).toBe(1300);
  });

  it("da el valor del día cuando el alcance es diario", () => {
    const bundle = buildOccupancySeries(
      [enero],
      query({ metric: "occupancy", scope: "dia", months: [0] }),
    );
    expect(bundle.series[0].values[0]).toBeCloseTo(0.9, 10);
    expect(bundle.series[0].values[1]).toBeCloseTo(0.4, 10);
  });

  it("deja vacío un mes sin datos en vez de dibujar un cero", () => {
    const bundle = buildOccupancySeries([enero], query({ metric: "revenue" }));
    expect(bundle.series[0].values[0]).toBe(1300);
    expect(bundle.series[0].values[7]).toBeNull();
  });

  it("da null en vez de infinito cuando el divisor es cero", () => {
    const cerrado = dataset("a", 2026, { 0: { available: [0, 0, 0], sold: [0, 0, 0] } });
    const bundle = buildOccupancySeries([cerrado], query({ metric: "occupancy", months: [0] }));
    expect(bundle.series[0].values[0]).toBeNull();
  });

  it("un día sin ventas dentro de un mes con datos es un cero real", () => {
    const bundle = buildOccupancySeries(
      [enero],
      query({ metric: "sold", scope: "dia", months: [0] }),
    );
    expect(bundle.series[0].values[2]).toBe(0);
  });
});

describe("buildOccupancySeries · series", () => {
  const manor26 = dataset("manor", 2026, { 0: { sold: [9], available: [10] } });
  const manor25 = dataset("manor", 2025, { 0: { sold: [5], available: [10] } });
  const norte26 = dataset("norte", 2026, { 0: { sold: [2], available: [10] } });

  it("cruza las sucursales marcadas con los años marcados", () => {
    const bundle = buildOccupancySeries(
      [manor26, manor25, norte26],
      query({ centerIds: ["manor", "norte"], years: [2025, 2026], months: [0] }),
    );
    // Solo las combinaciones que existen: Norte no tiene 2025.
    expect(bundle.series.map((s) => s.label)).toEqual([
      "MANOR · 2025",
      "MANOR · 2026",
      "NORTE · 2026",
    ]);
  });

  it("nombra la serie solo con la sucursal cuando hay un único año", () => {
    const bundle = buildOccupancySeries(
      [manor26, norte26],
      query({ centerIds: ["manor", "norte"], months: [0] }),
    );
    expect(bundle.series.map((s) => s.label)).toEqual(["MANOR", "NORTE"]);
  });

  it("corta en el tope de la paleta y dice cuántas dejó fuera", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      dataset(`c${i}`, 2026, { 0: { sold: [1], available: [2] } }),
    );
    const bundle = buildOccupancySeries(
      many,
      query({ centerIds: many.map((_, i) => `c${i}`), months: [0] }),
    );
    expect(bundle.series).toHaveLength(8);
    expect(bundle.truncated).toBe(2);
    expect(bundle.warnings.join(" ")).toMatch(/2 series/i);
  });

  it("no dibuja nada cuando la selección no existe en el espacio", () => {
    const bundle = buildOccupancySeries([manor26], query({ centerIds: ["fantasma"] }));
    expect(bundle.series).toEqual([]);
  });
});

describe("buildOccupancySeries · días marcados", () => {
  const manor26 = dataset("manor", 2026, {
    0: {
      available: [10, 10, 10, 10, 10],
      sold: [9, 5, 4, 3, 2],
      revenue: [900, 500, 400, 300, 200],
    },
  });
  const manor25 = dataset("manor", 2025, {
    0: {
      available: [10, 10, 10, 10, 10],
      sold: [4, 2, 2, 1, 1],
      revenue: [400, 200, 200, 100, 100],
    },
  });

  it("acota el eje a los días marcados del mes marcado", () => {
    const bundle = buildOccupancySeries(
      [manor26],
      query({ centerIds: ["manor"], scope: "dia", months: [0], days: [4] }),
    );
    expect(bundle.axis.map((point) => point.label)).toEqual(["5 ene"]);
  });

  it("compara el mismo día entre dos años", () => {
    const bundle = buildOccupancySeries(
      [manor26, manor25],
      query({
        centerIds: ["manor"],
        years: [2025, 2026],
        scope: "dia",
        months: [0],
        days: [4],
      }),
    );
    expect(bundle.axis).toHaveLength(1);
    expect(bundle.series.map((s) => [s.label, s.values[0]])).toEqual([
      ["MANOR · 2025", 0.1],
      ["MANOR · 2026", 0.2],
    ]);
  });

  it("un día marcado vale para cada mes marcado", () => {
    const conMarzo = dataset("manor", 2026, {
      0: { available: [10, 10, 10, 10, 10], sold: [9, 5, 4, 3, 2] },
      2: { available: [10, 10, 10, 10, 10], sold: [1, 1, 1, 1, 8] },
    });
    const bundle = buildOccupancySeries(
      [conMarzo],
      query({ centerIds: ["manor"], scope: "dia", months: [0, 2], days: [4] }),
    );
    expect(bundle.axis.map((point) => point.label)).toEqual(["5 ene", "5 mar"]);
    expect(bundle.series[0].values).toEqual([0.2, 0.8]);
  });

  it("ignora un día que el mes no tiene", () => {
    const bundle = buildOccupancySeries(
      [dataset("manor", 2026, { 1: { available: [10], sold: [5] } })],
      query({ centerIds: ["manor"], scope: "dia", months: [1], days: [28, 30] }),
    );
    // Febrero de 2026 llega al 28: el día 31 no existe y el 29 tampoco.
    expect(bundle.axis).toEqual([]);
  });
});
