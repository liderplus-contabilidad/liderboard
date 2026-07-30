import { describe, expect, it } from "vitest";
import {
  clearMarks,
  picksLabel,
  pickLabel,
  describeSelection,
  emptyFilters,
  hasMarks,
  isWholeYearRange,
  periodLabel,
  periodPhrase,
  rangeLabel,
  sanitizeFilters,
  toPeriod,
  UNRESOLVED_YEAR,
  wholeYearRange,
  withCenterToggled,
  withPickToggled,
  withPicksCleared,
  withPeriodMode,
  withRangeCleared,
  withRangeEdge,
} from "./filters";
import type { DateRef, PeriodPick } from "./analytics/types";

const UNIVERSE = { centerIds: ["manor", "norte"], years: [2025, 2026] };
const date = (year: number, monthIndex: number, day: number): DateRef => ({
  year,
  monthIndex,
  day,
});
const resolved = () => sanitizeFilters(emptyFilters(), UNIVERSE);
const dia = (year: number, monthIndex: number, day: number): PeriodPick => ({
  kind: "dia",
  year,
  monthIndex,
  day,
});
const mes = (year: number, monthIndex: number): PeriodPick => ({ kind: "mes", year, monthIndex });

describe("OccupancyFilters", () => {
  it("arranca en rango, sobre todo el año y sin sucursal marcada", () => {
    const filters = emptyFilters();
    expect(filters.periodMode).toBe("rango");
    expect(filters.centerIds).toEqual([]);
    expect(hasMarks(filters)).toBe(false);
  });

  it("mantiene el orden del universo, no el de los clics", () => {
    let filters = emptyFilters();
    filters = withCenterToggled(filters, "norte", UNIVERSE.centerIds);
    filters = withCenterToggled(filters, "manor", UNIVERSE.centerIds);
    expect(filters.centerIds).toEqual(["manor", "norte"]);
  });

  it("desmarca lo ya marcado", () => {
    let filters = withCenterToggled(emptyFilters(), "manor", UNIVERSE.centerIds);
    filters = withCenterToggled(filters, "manor", UNIVERSE.centerIds);
    expect(filters.centerIds).toEqual([]);
  });

  it("poda la sucursal que dejó de existir", () => {
    const stale = { ...emptyFilters(), centerIds: ["manor", "vieja"] };
    expect(sanitizeFilters(stale, UNIVERSE).centerIds).toEqual(["manor"]);
  });

  it("«quitar todo» conserva la métrica y el eje: no son marcas, son la lente", () => {
    const marked = {
      ...resolved(),
      metric: "adr" as const,
      scope: "dia" as const,
      centerIds: ["manor"],
    };
    const cleared = clearMarks(marked);
    expect(cleared.metric).toBe("adr");
    expect(cleared.scope).toBe("dia");
    expect(hasMarks(cleared)).toBe(false);
  });
});

describe("el año que haya", () => {
  it("el rango por defecto se resuelve al año más nuevo del espacio", () => {
    expect(emptyFilters().range.from.year).toBe(UNRESOLVED_YEAR);
    const filters = resolved();
    expect(filters.range.from.year).toBe(2026);
    expect(isWholeYearRange(filters.range)).toBe(true);
  });

  it("un año que el espacio no tiene se mueve al más nuevo que sí", () => {
    const stale = { ...emptyFilters(), range: wholeYearRange(2019) };
    expect(sanitizeFilters(stale, UNIVERSE).range.from.year).toBe(2026);
  });

  it("un año que sí existe se respeta", () => {
    const filters = { ...emptyFilters(), range: wholeYearRange(2025) };
    expect(sanitizeFilters(filters, UNIVERSE).range.from.year).toBe(2025);
  });

  it("sin años cargados no inventa ninguno", () => {
    const filters = sanitizeFilters(emptyFilters(), { centerIds: [], years: [] });
    expect(filters.range.from.year).toBe(UNRESOLVED_YEAR);
  });
});

describe("rango", () => {
  it("mover un extremo ES un rango, y normaliza los extremos al revés", () => {
    let filters = withPickToggled(resolved(), dia(2026, 0, 4));
    expect(filters.periodMode).toBe("comparar");
    filters = withRangeEdge(filters, "from", date(2026, 5, 0));
    expect(filters.periodMode).toBe("rango");
    filters = withRangeEdge(filters, "to", date(2026, 1, 4));
    expect(filters.range.from).toEqual(date(2026, 1, 4));
    expect(filters.range.to).toEqual(date(2026, 5, 0));
  });

  it("recorta a una fecha real: no hay 31 de febrero", () => {
    const filters = withRangeEdge(resolved(), "from", date(2026, 1, 30));
    expect(filters.range.from.day).toBe(27);
  });

  it("puede cruzar años", () => {
    let filters = withRangeEdge(resolved(), "from", date(2025, 10, 0));
    filters = withRangeEdge(filters, "to", date(2026, 1, 27));
    const period = toPeriod(filters);
    expect(period.mode).toBe("rango");
    expect(filters.range.from.year).toBe(2025);
    expect(filters.range.to.year).toBe(2026);
  });

  it("«todo el año» vuelve al año en que estaba el tramo", () => {
    let filters = withRangeEdge(resolved(), "from", date(2025, 5, 0));
    filters = withRangeCleared(filters);
    expect(isWholeYearRange(filters.range)).toBe(true);
    expect(filters.range.from.year).toBe(2025);
  });

  it("un tramo que no es todo el año sí acota", () => {
    expect(hasMarks(withRangeEdge(resolved(), "from", date(2026, 2, 0)))).toBe(true);
  });
});

describe("comparación de periodos", () => {
  it("elegir un día ES ese modo, y deja el eje como estaba", () => {
    const filters = withPickToggled(resolved(), dia(2026, 0, 4));
    expect(filters.periodMode).toBe("comparar");
    expect(filters.picks).toEqual([dia(2026, 0, 4)]);
    // «Ver por» no ofrece «Día»: una tabla del año día a día serían 365 filas.
    expect(filters.scope).toBe("mensual");
  });

  it("un MES entero también es un periodo suelto, y una sola columna", () => {
    const filters = withPickToggled(resolved(), mes(2026, 2));
    expect(filters.picks).toEqual([mes(2026, 2)]);
    expect(toPeriod(filters)).toEqual({ mode: "comparar", picks: [mes(2026, 2)] });
  });

  it("días y meses conviven en la misma comparación", () => {
    let filters = withPickToggled(resolved(), mes(2026, 6));
    filters = withPickToggled(filters, dia(2026, 0, 4));
    expect(filters.picks).toEqual([dia(2026, 0, 4), mes(2026, 6)]);
  });

  it("quedan en orden de calendario y el mismo dos veces se quita", () => {
    let filters = withPickToggled(resolved(), dia(2026, 2, 11));
    filters = withPickToggled(filters, dia(2025, 0, 4));
    expect(filters.picks).toEqual([dia(2025, 0, 4), dia(2026, 2, 11)]);
    filters = withPickToggled(filters, dia(2025, 0, 4));
    expect(filters.picks).toEqual([dia(2026, 2, 11)]);
  });

  it("un día y su mes son dos periodos distintos, no el mismo", () => {
    let filters = withPickToggled(resolved(), mes(2026, 0));
    filters = withPickToggled(filters, dia(2026, 0, 0));
    expect(filters.picks).toHaveLength(2);
  });

  it("cambiar de modalidad no pierde lo elegido", () => {
    let filters = withPickToggled(resolved(), dia(2026, 0, 4));
    filters = withPeriodMode(filters, "rango");
    expect(filters.picks).toEqual([dia(2026, 0, 4)]);
    expect(toPeriod(filters).mode).toBe("rango");
    filters = withPeriodMode(filters, "comparar");
    expect(toPeriod(filters)).toEqual({ mode: "comparar", picks: [dia(2026, 0, 4)] });
  });

  it("quitar los periodos los vacía sin tocar el tramo", () => {
    const filters = withPicksCleared(withPickToggled(resolved(), dia(2026, 0, 4)));
    expect(filters.picks).toEqual([]);
    expect(isWholeYearRange(filters.range)).toBe(true);
  });
});

describe("rangeLabel", () => {
  it("todo el año es el año", () => {
    expect(rangeLabel(wholeYearRange(2026))).toBe("Año 2026");
  });

  it("un mes entero es el mes", () => {
    expect(rangeLabel({ from: date(2026, 1, 0), to: date(2026, 1, 27) })).toBe("Febrero 2026");
  });

  it("dentro de un mes nombra el mes una sola vez", () => {
    expect(rangeLabel({ from: date(2026, 0, 0), to: date(2026, 0, 19) })).toBe(
      "del 1 al 20 de enero de 2026",
    );
    expect(rangeLabel({ from: date(2026, 0, 4), to: date(2026, 0, 4) })).toBe("5 de enero de 2026");
  });

  it("dentro de un año dice el año una sola vez", () => {
    expect(rangeLabel({ from: date(2026, 2, 19), to: date(2026, 3, 9) })).toBe(
      "del 20 de marzo al 10 de abril de 2026",
    );
  });

  it("cruzando años dice los dos", () => {
    expect(rangeLabel({ from: date(2025, 10, 0), to: date(2026, 1, 27) })).toBe(
      "del 1 de noviembre de 2025 al 28 de febrero de 2026",
    );
  });
});

describe("picksLabel", () => {
  it("lista los periodos y a partir del cuarto los cuenta", () => {
    expect(picksLabel([])).toBe("Sin periodos elegidos");
    expect(picksLabel([dia(2026, 0, 4)])).toBe("5 ene 2026");
    expect(picksLabel([dia(2025, 0, 4), mes(2026, 2)])).toBe("5 ene 2025 · Marzo 2026");
    expect(picksLabel([dia(2026, 0, 0), dia(2026, 0, 1), dia(2026, 0, 2), dia(2026, 0, 3)])).toBe(
      "1 ene 2026 · 2 ene 2026 · 3 ene 2026 y 1 más",
    );
  });

  it("un día dice su día y un mes su mes: es lo que los distingue", () => {
    expect(pickLabel(dia(2026, 11, 24))).toBe("25 dic 2026");
    expect(pickLabel(mes(2026, 11))).toBe("Diciembre 2026");
  });
});

describe("periodLabel y periodPhrase", () => {
  it("dicen el tramo o las fechas, según la modalidad", () => {
    const filters = resolved();
    expect(periodLabel(filters)).toBe("Año 2026");
    expect(periodLabel(withPickToggled(filters, dia(2026, 0, 4)))).toBe("5 ene 2026");
  });

  it("bajan a minúsculas para el medio de una frase", () => {
    expect(periodPhrase(resolved())).toBe("año 2026");
    expect(periodPhrase(withRangeEdge(resolved(), "from", date(2026, 2, 19)))).toBe(
      "del 20 de marzo al 31 de diciembre de 2026",
    );
  });
});

describe("describeSelection", () => {
  it("resume la selección en una frase", () => {
    const filters = withPickToggled(resolved(), dia(2026, 0, 4));
    expect(describeSelection(filters, ["Cultura Manor"])).toBe("5 ene 2026 · Cultura Manor");
  });

  it("nombra lo que no está marcado como «todas»", () => {
    expect(describeSelection(resolved(), [])).toBe("Año 2026 · todas las sucursales");
  });
});
