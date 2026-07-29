import { describe, expect, it } from "vitest";
import {
  CENTRO_PRINCIPAL_SOURCE,
  CENTRO_VACIO_SOURCE,
  CULTURA_MANOR_2025_SOURCE,
  CULTURA_MANOR_SOURCE,
  SIN_CENTRO_SOURCE,
  makeSource,
} from "./fixtures";
import { MAX_SERIES, buildSeries, signFor } from "./series";
import { seriesKeyId, type Series } from "./types";

const HABITACIONES = "4.1.1.1.1.1";
const RESTAURANTE = "4.1.1.2";
const EVENTOS = "4.1.1.3";
const LAVANDERIA = "4.1.1.5";
const ARRENDAMIENTO = "5.1.5.12";

const MONTHLY_SOURCES = [CULTURA_MANOR_SOURCE, CENTRO_PRINCIPAL_SOURCE, CENTRO_VACIO_SOURCE];

function values(series: Series): (number | null)[] {
  return series.points.map((point) => point.value);
}

describe("identidad de una serie", () => {
  it("distinguishes the same account in two centers", () => {
    const bundle = buildSeries(MONTHLY_SOURCES, {
      codes: ["4.1.1.1"],
      centerIds: ["cultura-manor", "centro-de-costo-principal"],
      years: [2026],
      frequency: "mensual",
    });
    expect(bundle.series).toHaveLength(2);
    expect(bundle.series.map((s) => s.key.centerId)).toEqual([
      "cultura-manor",
      "centro-de-costo-principal",
    ]);
    const [first, second] = bundle.series;
    expect(seriesKeyId(first.key)).not.toBe(seriesKeyId(second.key));
  });

  it("makes the same account of two years two different series", () => {
    const bundle = buildSeries([CULTURA_MANOR_SOURCE, CULTURA_MANOR_2025_SOURCE], {
      codes: ["4.1.1.1"],
      centerIds: ["cultura-manor"],
      years: [2025, 2026],
      frequency: "mensual",
    });
    expect(bundle.series.map((s) => s.key.year)).toEqual([2025, 2026]);
  });
});

describe("cobertura de los puntos", () => {
  it("leaves the months the file never reached as null", () => {
    const [series] = buildSeries([CULTURA_MANOR_SOURCE], {
      codes: [HABITACIONES],
      centerIds: ["cultura-manor"],
      years: [2026],
      frequency: "mensual",
    }).series;
    expect(values(series).slice(0, 7)).toEqual(Array.from({ length: 7 }, () => 17338));
    expect(values(series).slice(7)).toEqual([null, null, null, null, null]);
  });

  it("keeps a real zero of a seasonal account inside a month with activity", () => {
    const [series] = buildSeries([CULTURA_MANOR_SOURCE], {
      codes: [EVENTOS],
      centerIds: ["cultura-manor"],
      years: [2026],
      frequency: "mensual",
    }).series;
    // February booked no events, but the hotel did move that month: a 0, never a hole.
    expect(series.points[1].value).toBe(0);
    expect(series.points[0].value).toBe(300);
  });

  it("returns every point as null for a source with no movement at all", () => {
    const [series] = buildSeries([CENTRO_VACIO_SOURCE], {
      codes: [HABITACIONES],
      centerIds: ["centro-vacio"],
      years: [2026],
      frequency: "mensual",
    }).series;
    expect(values(series).every((value) => value === null)).toBe(true);
  });
});

describe("construcción de series", () => {
  it("is the cartesian product of codes × centers × years, accounts first", () => {
    const bundle = buildSeries(MONTHLY_SOURCES, {
      codes: [HABITACIONES, RESTAURANTE],
      centerIds: ["cultura-manor", "centro-de-costo-principal", "centro-vacio"],
      years: [2026],
      frequency: "mensual",
    });
    expect(bundle.series).toHaveLength(6);
    expect(bundle.series.map((s) => `${s.key.code}@${s.key.centerId}`)).toEqual([
      `${HABITACIONES}@cultura-manor`,
      `${HABITACIONES}@centro-de-costo-principal`,
      `${HABITACIONES}@centro-vacio`,
      `${RESTAURANTE}@cultura-manor`,
      `${RESTAURANTE}@centro-de-costo-principal`,
      `${RESTAURANTE}@centro-vacio`,
    ]);
    expect(bundle.warnings).toEqual([]);
  });

  it("skips a combination with no source and warns naming the center and the year", () => {
    const bundle = buildSeries([CENTRO_PRINCIPAL_SOURCE], {
      codes: [HABITACIONES],
      centerIds: ["centro-de-costo-principal"],
      years: [2025],
      frequency: "mensual",
    });
    expect(bundle.series).toEqual([]);
    expect(bundle.warnings).toHaveLength(1);
    expect(bundle.warnings[0]).toContain("Centro de Costo Principal");
    expect(bundle.warnings[0]).toContain("2025");
  });

  it("skips an account a center does not report and warns", () => {
    const bundle = buildSeries(MONTHLY_SOURCES, {
      codes: [LAVANDERIA],
      centerIds: ["cultura-manor", "centro-de-costo-principal"],
      years: [2026],
      frequency: "mensual",
    });
    expect(bundle.series.map((s) => s.key.centerId)).toEqual(["cultura-manor"]);
    expect(bundle.warnings).toHaveLength(1);
    expect(bundle.warnings[0]).toContain(LAVANDERIA);
    expect(bundle.warnings[0]).toContain("Centro de Costo Principal");
  });

  it("unifies the X axis across years, ordered by (year, index)", () => {
    const bundle = buildSeries([CULTURA_MANOR_SOURCE, CULTURA_MANOR_2025_SOURCE], {
      codes: [HABITACIONES],
      centerIds: ["cultura-manor"],
      years: [2026, 2025],
      frequency: "trimestral",
    });
    expect(bundle.periods.map((p) => `${p.year}-T${p.index + 1}`)).toEqual([
      "2025-T1",
      "2025-T2",
      "2025-T3",
      "2025-T4",
      "2026-T1",
      "2026-T2",
      "2026-T3",
      "2026-T4",
    ]);
    // A series only carries the periods of its own year, so overlaying years lines up by index.
    expect(bundle.series.every((s) => s.points.every((p) => p.period.year === s.key.year))).toBe(
      true,
    );
  });

  it("restricts the X axis to the requested periods", () => {
    const bundle = buildSeries([CULTURA_MANOR_SOURCE], {
      codes: [HABITACIONES],
      centerIds: ["cultura-manor"],
      years: [2026],
      frequency: "mensual",
      periods: [
        { year: 2026, frequency: "mensual", index: 0 },
        { year: 2026, frequency: "mensual", index: 2 },
      ],
    });
    expect(bundle.periods.map((p) => p.index)).toEqual([0, 2]);
    expect(values(bundle.series[0])).toEqual([17338, 17338]);
  });
});

describe("total del contenedor", () => {
  it("carries the rolled-up parent of an account with a parent", () => {
    const [series] = buildSeries([CULTURA_MANOR_SOURCE], {
      codes: [RESTAURANTE],
      centerIds: ["cultura-manor"],
      years: [2026],
      frequency: "mensual",
    }).series;
    expect(series.container?.code).toBe("4.1.1");
    expect(series.container?.label).toBe("Ventas Alojamiento y Servicios");
    expect(series.container?.points[0].value).toBe(24465);
  });

  it("leaves a root account without a container", () => {
    const [series] = buildSeries([CULTURA_MANOR_SOURCE], {
      codes: ["4"],
      centerIds: ["cultura-manor"],
      years: [2026],
      frequency: "mensual",
    }).series;
    expect(series.container).toBeNull();
  });

  it("respects coverage in the container too", () => {
    const [series] = buildSeries([CULTURA_MANOR_SOURCE], {
      codes: [RESTAURANTE],
      centerIds: ["cultura-manor"],
      years: [2026],
      frequency: "mensual",
    }).series;
    expect(series.container?.points[7].value).toBeNull();
  });
});

describe("etiqueta de serie", () => {
  it("uses only the account name with a single center and a single year", () => {
    const bundle = buildSeries([CULTURA_MANOR_SOURCE], {
      codes: [HABITACIONES, RESTAURANTE],
      centerIds: ["cultura-manor"],
      years: [2026],
      frequency: "mensual",
    });
    expect(bundle.series.map((s) => s.label)).toEqual([
      "Ventas Habitaciones",
      "Ventas Restaurante",
    ]);
  });

  it("adds the center when the query spans several centers", () => {
    const bundle = buildSeries(MONTHLY_SOURCES, {
      codes: [HABITACIONES],
      centerIds: ["cultura-manor", "centro-de-costo-principal"],
      years: [2026],
      frequency: "mensual",
    });
    expect(bundle.series.map((s) => s.label)).toEqual([
      "Ventas Habitaciones · Cultura Manor",
      "Ventas Habitaciones · Centro de Costo Principal",
    ]);
  });

  it("adds center and year when the query spans several of both", () => {
    const principal2025 = makeSource({
      centerId: "centro-de-costo-principal",
      centerName: "Centro de Costo Principal",
      year: 2025,
      months: 12,
      scale: 0.01,
    });
    const bundle = buildSeries(
      [CULTURA_MANOR_SOURCE, CULTURA_MANOR_2025_SOURCE, CENTRO_PRINCIPAL_SOURCE, principal2025],
      {
        codes: [HABITACIONES],
        centerIds: ["cultura-manor", "centro-de-costo-principal"],
        years: [2025, 2026],
        frequency: "mensual",
      },
    );
    expect(bundle.series.map((s) => s.label)).toEqual([
      "Ventas Habitaciones · Cultura Manor · 2025",
      "Ventas Habitaciones · Cultura Manor · 2026",
      "Ventas Habitaciones · Centro de Costo Principal · 2025",
      "Ventas Habitaciones · Centro de Costo Principal · 2026",
    ]);
  });
});

describe("signFor", () => {
  it("is +1 for income, -1 for costs and non-operating expenses, 0 for any other root", () => {
    expect(signFor("4.1.1.1")).toBe(1);
    expect(signFor(ARRENDAMIENTO)).toBe(-1);
    // The segmented block is an expense like any other: it subtracts.
    expect(signFor("6.1")).toBe(-1);
    expect(signFor("9.1")).toBe(0);
  });

  it("does not invert the values of an expense account", () => {
    const [series] = buildSeries([CULTURA_MANOR_SOURCE], {
      codes: [ARRENDAMIENTO],
      centerIds: ["cultura-manor"],
      years: [2026],
      frequency: "mensual",
    }).series;
    // Expenses are stored positive in the source system; applying the sign is the caller's call.
    expect(series.points[0].value).toBe(8000);
  });
});

describe("tope de series", () => {
  const codes = [...CENTRO_PRINCIPAL_SOURCE.valuesByCode.keys()];
  const twoCenters = ["cultura-manor", "centro-de-costo-principal"];

  it("keeps every series of a query below the cap", () => {
    const bundle = buildSeries(MONTHLY_SOURCES, {
      codes: codes.slice(0, 6),
      centerIds: twoCenters,
      years: [2026],
      frequency: "mensual",
    });
    expect(bundle.series).toHaveLength(12);
    expect(bundle.truncated).toBe(0);
    expect(bundle.warnings).toEqual([]);
  });

  it("truncates above the cap and reports how many it dropped", () => {
    const bundle = buildSeries(MONTHLY_SOURCES, {
      codes: codes.slice(0, 20),
      centerIds: twoCenters,
      years: [2026],
      frequency: "mensual",
    });
    expect(bundle.series).toHaveLength(MAX_SERIES);
    expect(bundle.truncated).toBe(40 - MAX_SERIES);
    expect(bundle.warnings.some((w) => w.includes(String(MAX_SERIES)))).toBe(true);
  });

  it("honours a lower cap from the query", () => {
    const bundle = buildSeries(MONTHLY_SOURCES, {
      codes: codes.slice(0, 6),
      centerIds: twoCenters,
      years: [2026],
      frequency: "mensual",
      limit: 8,
    });
    expect(bundle.series).toHaveLength(8);
    expect(bundle.truncated).toBe(4);
  });

  it("truncates deterministically", () => {
    const query = {
      codes: codes.slice(0, 20),
      centerIds: twoCenters,
      years: [2026],
      frequency: "mensual" as const,
    };
    const first = buildSeries(MONTHLY_SOURCES, query).series.map((s) => seriesKeyId(s.key));
    const second = buildSeries(MONTHLY_SOURCES, query).series.map((s) => seriesKeyId(s.key));
    expect(second).toEqual(first);
  });
});

describe("la agregación nunca desagrega", () => {
  it("skips an annual source queried monthly and explains why", () => {
    const bundle = buildSeries([SIN_CENTRO_SOURCE], {
      codes: [HABITACIONES],
      centerIds: ["sin-centro"],
      years: [2026],
      frequency: "mensual",
    });
    expect(bundle.series).toEqual([]);
    expect(bundle.warnings).toHaveLength(1);
    expect(bundle.warnings[0]).toContain("Sin centro de costo");
    expect(bundle.warnings[0]).toContain("anual");
  });

  it("reads an annual source at its own frequency", () => {
    const bundle = buildSeries([SIN_CENTRO_SOURCE], {
      codes: [HABITACIONES],
      centerIds: ["sin-centro"],
      years: [2026],
      frequency: "anual",
    });
    expect(bundle.periods).toHaveLength(1);
    expect(bundle.series[0].points[0].value).toBe(17338 * 7);
  });

  it("sums the three months of a quarter", () => {
    const bundle = buildSeries([CULTURA_MANOR_SOURCE], {
      codes: [HABITACIONES],
      centerIds: ["cultura-manor"],
      years: [2026],
      frequency: "trimestral",
    });
    // T3 is covered by July alone, T4 never happened.
    expect(values(bundle.series[0])).toEqual([17338 * 3, 17338 * 3, 17338, null]);
  });
});

describe("advertencias", () => {
  it("are Spanish sentences that name the center, the account or the year", () => {
    const bundle = buildSeries([CULTURA_MANOR_SOURCE, SIN_CENTRO_SOURCE], {
      codes: [LAVANDERIA, HABITACIONES],
      centerIds: ["cultura-manor", "sin-centro", "centro-de-costo-principal"],
      years: [2026],
      frequency: "mensual",
    });
    expect(bundle.warnings.length).toBeGreaterThan(0);
    for (const warning of bundle.warnings) {
      expect(warning).toMatch(/^[A-ZÁÉÍÓÚÑ].*\.$/u);
      expect(warning).toMatch(
        /Cultura Manor|Sin centro de costo|centro-de-costo-principal|4\.1\./u,
      );
    }
    // The same reason is reported once, not once per combination.
    expect(new Set(bundle.warnings).size).toBe(bundle.warnings.length);
  });
});
