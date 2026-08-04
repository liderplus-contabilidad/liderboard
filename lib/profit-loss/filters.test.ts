import { describe, expect, it } from "vitest";
import { periodsForYear } from "./analytics/period";
import { makeSource } from "./analytics/fixtures";
import {
  CONSOLIDADO_ID,
  canEditActiveCenter,
  clearFilters,
  emptyFilters,
  resolveActiveCenterId,
  sanitizeFilters,
  seedCenterIds,
  withCenterToggled,
  withCentersCleared,
  withCodesCleared,
  withCodeToggled,
  withPeriodsCleared,
  withPeriodToggled,
  type FilterView,
  type PygFilters,
} from "./filters";

const HABITACIONES = "4.1.1.1.1.1";
const RESTAURANTE = "4.1.1.2";
const LAVANDERIA = "4.1.1.5";

const MANOR_CODES = [...makeSource().valuesByCode.keys()];
const PRINCIPAL_CODES = [
  ...makeSource({
    centerId: "centro-de-costo-principal",
    scale: 0.01,
    omit: [LAVANDERIA],
  }).valuesByCode.keys(),
];
// The Consolidado sums the monthly centers, so it reports everything any of them does.
const CONSOLIDADO_CODES = MANOR_CODES;

const VIEWS: FilterView[] = [
  { id: CONSOLIDADO_ID, editable: false, codes: CONSOLIDADO_CODES },
  { id: "cultura-manor", editable: true, codes: MANOR_CODES },
  { id: "centro-de-costo-principal", editable: true, codes: PRINCIPAL_CODES },
  { id: "sin-centro", editable: false, codes: MANOR_CODES },
];

function makeContext(overrides: Partial<Parameters<typeof sanitizeFilters>[1]> = {}) {
  return {
    views: VIEWS,
    year: 2026,
    frequency: "mensual" as const,
    ...overrides,
  };
}

function makeFilters(overrides: Partial<PygFilters> = {}): PygFilters {
  return { ...emptyFilters(), ...overrides };
}

describe("emptyFilters", () => {
  it("starts with nothing marked", () => {
    expect(emptyFilters()).toEqual({
      codes: [],
      centerIds: [],
      clientIds: [],
      years: [],
      periods: [],
    });
  });
});

describe("toggles keep universe order, not click order", () => {
  it("adds an account in the order the file declares it", () => {
    const universe = [HABITACIONES, RESTAURANTE];
    const picked = withCodeToggled(
      withCodeToggled(makeFilters(), RESTAURANTE, universe),
      HABITACIONES,
      universe,
    );
    expect(picked.codes).toEqual([HABITACIONES, RESTAURANTE]);
  });

  it("removes an entry already picked", () => {
    const universe = ["cultura-manor", "centro-de-costo-principal"];
    const picked = withCenterToggled(
      makeFilters({ centerIds: ["cultura-manor"] }),
      "cultura-manor",
      universe,
    );
    expect(picked.centerIds).toEqual([]);
  });

  it("orders periods by the calendar axis regardless of click order", () => {
    const universe = periodsForYear(2026, "mensual");
    const picked = withPeriodToggled(
      withPeriodToggled(makeFilters(), universe[2], universe),
      universe[0],
      universe,
    );
    expect(picked.periods.map((p) => p.index)).toEqual([0, 2]);
  });

  it("clears only the codes on the account filter's own footer", () => {
    const filters = makeFilters({ codes: [HABITACIONES], centerIds: ["cultura-manor"] });
    expect(withCodesCleared(filters)).toEqual({ ...filters, codes: [] });
  });

  it("clears only the centers on the Consolidado shortcut", () => {
    const filters = makeFilters({ codes: [HABITACIONES], centerIds: ["cultura-manor"] });
    expect(withCentersCleared(filters)).toEqual({ ...filters, centerIds: [] });
  });

  it("clears only the periods on the period filter's own footer", () => {
    const filters = makeFilters({
      codes: [HABITACIONES],
      periods: [{ year: 2026, frequency: "mensual", index: 0 }],
    });
    expect(withPeriodsCleared(filters)).toEqual({ ...filters, periods: [] });
  });

  it("clears everything on Quitar todo", () => {
    expect(clearFilters()).toEqual(emptyFilters());
  });
});

describe("filtro de centros de costo", () => {
  it("resolves no center marked to the Consolidado", () => {
    expect(resolveActiveCenterId(makeFilters(), VIEWS)).toBe(CONSOLIDADO_ID);
    expect(canEditActiveCenter(makeFilters(), VIEWS)).toBe(false);
  });

  it("resolves one marked center to itself, editable", () => {
    const filters = makeFilters({ centerIds: ["cultura-manor"] });
    expect(resolveActiveCenterId(filters, VIEWS)).toBe("cultura-manor");
    expect(canEditActiveCenter(filters, VIEWS)).toBe(true);
  });

  it("resolves several marked centers to the Consolidado, read-only", () => {
    const filters = makeFilters({ centerIds: ["cultura-manor", "centro-de-costo-principal"] });
    expect(resolveActiveCenterId(filters, VIEWS)).toBe(CONSOLIDADO_ID);
    expect(canEditActiveCenter(filters, VIEWS)).toBe(false);
  });

  it("'Sin centro de costo' is one more option, resolved read-only since it is annual", () => {
    const filters = makeFilters({ centerIds: ["sin-centro"] });
    expect(resolveActiveCenterId(filters, VIEWS)).toBe("sin-centro");
    expect(canEditActiveCenter(filters, VIEWS)).toBe(false);
  });

  it("a lone statement resolves to its own view with nothing marked", () => {
    const lone: FilterView[] = [{ id: "unico", editable: true, codes: MANOR_CODES }];
    expect(resolveActiveCenterId(makeFilters(), lone)).toBe("unico");
    expect(canEditActiveCenter(makeFilters(), lone)).toBe(true);
  });

  it("seeds the initial center selection from the persisted activeCenterId", () => {
    expect(seedCenterIds("cultura-manor")).toEqual(["cultura-manor"]);
    expect(seedCenterIds(CONSOLIDADO_ID)).toEqual([]);
    expect(seedCenterIds(undefined)).toEqual([]);
  });
});

describe("saneamiento de los filtros", () => {
  it("drops an account the resolved center does not report and keeps the rest", () => {
    const filters = makeFilters({
      codes: [HABITACIONES, LAVANDERIA, RESTAURANTE],
      centerIds: ["centro-de-costo-principal"],
    });
    const sanitized = sanitizeFilters(filters, makeContext());

    expect(sanitized.codes).toEqual([HABITACIONES, RESTAURANTE]);
  });

  it("drops a center that left the workspace", () => {
    const filters = makeFilters({ centerIds: ["cultura-manor", "centro-que-ya-no-existe"] });
    const sanitized = sanitizeFilters(filters, makeContext());

    expect(sanitized.centerIds).toEqual(["cultura-manor"]);
  });

  it("keeps the codes when moving to a coarser frequency and drops only stale periods", () => {
    const filters = makeFilters({
      codes: [HABITACIONES, RESTAURANTE],
      periods: [
        { year: 2026, frequency: "mensual", index: 0 },
        { year: 2026, frequency: "mensual", index: 9 },
      ],
    });
    const sanitized = sanitizeFilters(filters, makeContext({ frequency: "trimestral" }));

    expect(sanitized.codes).toEqual([HABITACIONES, RESTAURANTE]);
    expect(sanitized.periods).toEqual([]);
  });

  it("keeps periods that still fall on the new axis", () => {
    const filters = makeFilters({
      periods: [{ year: 2026, frequency: "mensual", index: 3 }],
    });
    const sanitized = sanitizeFilters(filters, makeContext());

    expect(sanitized.periods).toEqual([{ year: 2026, frequency: "mensual", index: 3 }]);
  });

  it("devuelve el MISMO objeto cuando no hay nada que podar", () => {
    // La tabla de Datos memoiza sus columnas contra `filters.periods`, y esto corre con un
    // contexto reconstruido en cada edición: un objeto nuevo aquí re-renderiza el estado entero.
    const vacio = makeFilters();
    expect(sanitizeFilters(vacio, makeContext())).toBe(vacio);

    const conMarcas = makeFilters({
      codes: [HABITACIONES, RESTAURANTE],
      centerIds: ["cultura-manor"],
      periods: [{ year: 2026, frequency: "mensual", index: 3 }],
    });
    expect(sanitizeFilters(conMarcas, makeContext())).toBe(conMarcas);
  });

  it("devuelve un objeto nuevo en cuanto poda algo", () => {
    const filters = makeFilters({ centerIds: ["cultura-manor", "centro-que-ya-no-existe"] });
    expect(sanitizeFilters(filters, makeContext())).not.toBe(filters);
  });

  it("empties everything a different workspace's views cannot resolve", () => {
    const filters = makeFilters({
      codes: [HABITACIONES, RESTAURANTE],
      centerIds: ["cultura-manor"],
      periods: [{ year: 2026, frequency: "mensual", index: 0 }],
    });
    const otherWorkspace = makeContext({
      views: [{ id: "otro", editable: true, codes: ["9.9.9"] }],
    });

    const sanitized = sanitizeFilters(filters, otherWorkspace);

    expect(sanitized.codes).toEqual([]);
    expect(sanitized.centerIds).toEqual([]);
  });

  it("resolves against the Consolidado when 2+ centers stay marked after pruning", () => {
    const filters = makeFilters({
      codes: [LAVANDERIA],
      centerIds: ["cultura-manor", "centro-de-costo-principal"],
    });
    // Lavandería exists on the Consolidado (it sums Manor, which reports it), so it survives —
    // the account list is checked against the RESOLVED center, not either marked one alone.
    const sanitized = sanitizeFilters(filters, makeContext());

    expect(sanitized.codes).toEqual([LAVANDERIA]);
  });
});
