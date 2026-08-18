import { describe, expect, it } from "vitest";
import { CULTURA_MANOR_SOURCE, makeSeries, makeSource } from "../analytics/fixtures";
import type { Series } from "../analytics/types";
import { ancestorPath, buildAccountDetail, periodNoun } from "./account-detail";

/** Ene–Jul with movement, Ago–Dic uncovered — the shape of the real 2026 files. */
function covered(values: number[]): (number | null)[] {
  return [...values, ...Array.from({ length: 12 - values.length }, () => null)];
}

function detailOf(values: (number | null)[], options: Parameters<typeof makeSeries>[1] = {}) {
  return buildAccountDetail({
    series: makeSeries(values, options),
    source: CULTURA_MANOR_SOURCE,
    frequency: "mensual",
  });
}

describe("periodNoun", () => {
  it("names the periods of each frequency in Spanish", () => {
    expect(periodNoun("mensual")).toBe("Meses");
    expect(periodNoun("trimestral")).toBe("Trimestres");
    expect(periodNoun("semestral")).toBe("Semestres");
  });

  it("falls back to the generic noun for the annual view, which has a single column", () => {
    expect(periodNoun("anual")).toBe("Periodos");
  });

  it("gives the singular for copy that names one period", () => {
    expect(periodNoun("mensual", { singular: true })).toBe("Mes");
    expect(periodNoun("trimestral", { singular: true })).toBe("Trimestre");
    expect(periodNoun("anual", { singular: true })).toBe("Periodo");
  });
});

describe("ancestorPath", () => {
  it("lists the ancestors from the root down to the direct parent", () => {
    expect(ancestorPath(CULTURA_MANOR_SOURCE, "4.1.1.1.1.1")).toEqual([
      "Ingresos",
      "Ventas",
      "Ventas Alojamiento y Servicios",
      "Habitaciones",
      "Habitaciones Estándar",
    ]);
  });

  it("is empty for a root account", () => {
    expect(ancestorPath(CULTURA_MANOR_SOURCE, "4")).toEqual([]);
  });

  it("is empty for a code the source does not have", () => {
    expect(ancestorPath(CULTURA_MANOR_SOURCE, "9.9")).toEqual([]);
  });
});

describe("buildAccountDetail · identidad", () => {
  it("takes the name and the path from the source, not from the series label", () => {
    const detail = detailOf(covered([1, 2, 3, 4, 5, 6, 7]), {
      code: "4.1.8.4",
      label: "Servicio de Lavandería Externa · Cultura Manor",
    });

    expect(detail.code).toBe("4.1.8.4");
    expect(detail.name).toBe("Servicio de Lavandería Externa");
    expect(detail.path).toEqual(["Ingresos", "Ventas", "Otros Servicios"]);
  });

  it("reports the depth and marks a leaf as imputable", () => {
    const leaf = detailOf(covered([1]), { code: "4.1.8.4" });

    expect(leaf.level).toBe(4);
    expect(leaf.imputable).toBe(true);
  });

  it("marks an account with children as a group", () => {
    const group = detailOf(covered([1]), { code: "4.1.1" });

    expect(group.level).toBe(3);
    expect(group.imputable).toBe(false);
  });

  it("reports level 1 for a root account", () => {
    expect(detailOf(covered([1]), { code: "4" }).level).toBe(1);
  });
});

describe("buildAccountDetail · cobertura", () => {
  it("sums only the covered periods and never reads a gap as zero", () => {
    const detail = detailOf(covered([-32, 0, -475, 0, 0, 0, 0]));

    expect(detail.total).toBe(-507);
    expect(detail.coveredPeriods).toBe(7);
  });

  it("counts a period with movement, and a real zero as covered but not active", () => {
    const detail = detailOf(covered([-32, 0, -475, 0, 0, 0, 0]));

    expect(detail.activePeriods).toBe(2);
    expect(detail.coveredPeriods).toBe(7);
  });

  it("reports no coverage at all for a series that is entirely uncovered", () => {
    const detail = detailOf(Array.from({ length: 12 }, () => null));

    expect(detail.total).toBe(0);
    expect(detail.coveredPeriods).toBe(0);
    expect(detail.activePeriods).toBe(0);
  });
});

describe("buildAccountDetail · promedio", () => {
  it("averages over the ACTIVE periods, not over the covered ones", () => {
    const detail = detailOf(covered([-32, 0, -475, 0, 0, 0, 0]));

    expect(detail.averageActive).toBe(-253.5);
  });

  it("has no average when nothing moved — never zero", () => {
    const detail = detailOf(covered([0, 0, 0, 0, 0, 0, 0]));

    expect(detail.averageActive).toBeNull();
  });
});

describe("buildAccountDetail · periodo más alto", () => {
  it("names the covered period with the highest value", () => {
    const detail = detailOf(covered([1000, 2000, 20047, 500, 0, 0, 300]));

    expect(detail.best).toEqual({ label: "Mar", value: 20047 });
  });

  it("has no highest period when every value is negative or zero", () => {
    const detail = detailOf(covered([-32, 0, -475, 0, 0, 0, 0]));

    expect(detail.best).toBeNull();
  });

  it("ignores an uncovered period that would otherwise be the maximum", () => {
    const detail = detailOf([100, 200, null, null, null, null, null, null, null, null, null, null]);

    expect(detail.best).toEqual({ label: "Feb", value: 200 });
  });
});

describe("buildAccountDetail · peso dentro del padre", () => {
  it("divides the account total by the rolled-up parent total", () => {
    const detail = detailOf(covered([-507, 0, 0, 0, 0, 0, 0]), {
      container: covered([50700, 0, 0, 0, 0, 0, 0]),
    });

    expect(detail.containerLabel).toBe("Ventas Alojamiento y Servicios");
    expect(detail.shareOfContainer).toBeCloseTo(-1, 10);
  });

  it("has no share for a root account", () => {
    const detail = detailOf(covered([1000]), { code: "4" });

    expect(detail.shareOfContainer).toBeNull();
    expect(detail.containerLabel).toBeNull();
  });

  it("has no share when the parent totals zero, instead of dividing by zero", () => {
    const detail = detailOf(covered([1000]), { container: covered([0]) });

    expect(detail.shareOfContainer).toBeNull();
  });
});

describe("buildAccountDetail · frecuencias", () => {
  it("labels the periods of the active frequency", () => {
    const series: Series = makeSeries([12000, 9000, null, null], { frequency: "trimestral" });
    const detail = buildAccountDetail({
      series,
      source: CULTURA_MANOR_SOURCE,
      frequency: "trimestral",
    });

    expect(detail.periodNoun).toBe("Trimestres");
    expect(detail.coveredPeriods).toBe(2);
    expect(detail.best).toEqual({ label: "T1", value: 12000 });
  });

  it("works against an annual source, where the axis is a single Total column", () => {
    const series: Series = makeSeries([25229], { frequency: "anual", code: "4" });
    const detail = buildAccountDetail({
      series,
      source: makeSource({ baseFrequency: "anual" }),
      frequency: "anual",
    });

    expect(detail.coveredPeriods).toBe(1);
    expect(detail.total).toBe(25229);
  });
});

/* --------------------------------------------- los dos pesos sobre el estado */

describe("el peso de la cuenta sobre el ESTADO, no sobre su padre", () => {
  const totals = { expenses: 1_000, revenue: 4_000 };
  const conTotales = (values: (number | null)[]) =>
    buildAccountDetail({
      series: makeSeries(values),
      source: CULTURA_MANOR_SOURCE,
      frequency: "mensual",
      totals,
    });

  it("divide por las RAÍCES y no por el padre inmediato", () => {
    // 200 sobre 1.000 de gasto y sobre 4.000 de ingreso. Son dos preguntas distintas de la del
    // padre, y por eso conviven en la ficha en vez de sustituirla.
    const detail = conTotales(covered([200]));

    expect(detail.total).toBe(200);
    expect(detail.shareOfExpenses).toBeCloseTo(20, 6);
    expect(detail.shareOfRevenue).toBeCloseTo(5, 6);
  });

  it("sin totales no inventa las cifras: quedan en null y el panel no las escribe", () => {
    // Es lo que deja intacta a toda llamada que no las pide, la ficha de un ingreso incluida.
    const detail = detailOf(covered([200]));

    expect(detail.shareOfExpenses).toBeNull();
    expect(detail.shareOfRevenue).toBeNull();
  });

  it("un denominador sin cobertura da null, jamás 0 %", () => {
    const detail = buildAccountDetail({
      series: makeSeries(covered([200])),
      source: CULTURA_MANOR_SOURCE,
      frequency: "mensual",
      totals: { expenses: null, revenue: 0 },
    });

    expect(detail.shareOfExpenses).toBeNull();
    expect(detail.shareOfRevenue).toBeNull();
  });

  it("suma sobre lo CUBIERTO, así que un mes sin cargar no diluye el peso", () => {
    // La regla del motor llega hasta aquí: cinco meses cargados de 100 pesan 500 sobre el total
    // del mismo tramo, no 500 sobre un año que nadie reportó.
    const detail = conTotales(covered([100, 100, 100, 100, 100]));

    expect(detail.coveredPeriods).toBe(5);
    expect(detail.shareOfExpenses).toBeCloseTo(50, 6);
  });
});
