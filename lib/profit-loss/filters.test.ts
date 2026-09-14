import { describe, expect, it } from "vitest";
import { periodsForYear } from "./analytics/period";
import { makeSource } from "./analytics/fixtures";
import {
  CONSOLIDADO_ID,
  canEditActiveCenter,
  canEditActiveYear,
  clearFilters,
  emptyFilters,
  resolveActiveCenterId,
  resolveVisibleYears,
  sanitizeFilters,
  seedCenterIds,
  withAllYears,
  withCenterToggled,
  withCentersCleared,
  withCodesCleared,
  withCodeToggled,
  withPresetCleared,
  withPresetSelected,
  withPeriodsCleared,
  withPeriodToggled,
  withYearsCleared,
  withYearToggled,
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
      preset: null,
    });
  });
});

describe("una vista predeterminada y las cuentas marcadas son excluyentes", () => {
  const VISTA = "lineas-de-negocio";

  it("elegir una vista borra las marcas de cuenta", () => {
    const marked = withCodeToggled(makeFilters(), HABITACIONES, [HABITACIONES]);
    const view = withPresetSelected(marked, VISTA);
    expect(view.preset).toBe(VISTA);
    expect(view.codes).toEqual([]);
  });

  it("marcar una cuenta deselecciona la vista", () => {
    const view = withPresetSelected(makeFilters(), VISTA);
    const marked = withCodeToggled(view, HABITACIONES, [HABITACIONES]);
    expect(marked.preset).toBeNull();
    expect(marked.codes).toEqual([HABITACIONES]);
  });

  it("elegir una vista SIEMBRA los centros y los periodos que reparte, y quitarla los limpia", () => {
    // What is drawn and what is marked are the same: an establishment or a month is removed by
    // unmarking it where the user already knows to look, and switching the view off leaves behind no
    // chips they did not make.
    const meses = [
      { frequency: "mensual" as const, index: 0 },
      { frequency: "mensual" as const, index: 1 },
    ];
    const view = withPresetSelected(makeFilters(), VISTA, ["quito", "cuenca"], meses);
    expect(view.centerIds).toEqual(["quito", "cuenca"]);
    expect(view.periods).toEqual(meses);
    const off = withPresetSelected(view, VISTA, ["quito", "cuenca"], meses);
    expect([off.centerIds, off.periods]).toEqual([[], []]);
    expect([withPresetCleared(view).centerIds, withPresetCleared(view).periods]).toEqual([[], []]);
  });

  it("elegir la que ya está puesta la quita, y quitarla no reintroduce marcas", () => {
    const off = withPresetSelected(withPresetSelected(makeFilters(), VISTA), VISTA);
    expect(off).toEqual(makeFilters());
    expect(withPresetCleared(withPresetSelected(makeFilters(), VISTA))).toEqual(makeFilters());
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
    // The Datos table memoizes its columns against `filters.periods`, and this runs with a context
    // rebuilt on every edit: a new object here re-renders the whole statement.
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

describe("una vista que se deja ACOTAR por cuentas", () => {
  const RUBROS = ["5.1.1", "5.1.2", "5.2.1"];

  it("entrar en ella borra las marcas de cuenta: ninguna vista las siembra", () => {
    // The expense annex seeded them —its lines ARE accounts of the plan—, and it did not work out:
    // they are all the movement ones of the expense tree, over a hundred in a real plan, that is, over
    // a hundred chips.
    const conMarcas = { ...emptyFilters(), codes: ["4.1"] };
    const next = withPresetSelected(conMarcas, "anexo");

    expect(next.preset).toBe("anexo");
    expect(next.codes).toEqual([]);
  });

  it("marcar un rubro ACOTA el reparto en vez de apagar la vista", () => {
    // Without `keepPreset`, narrowing would switch the whole view off — the opposite of what marks are
    // for. Only a view whose categories ARE accounts of the plan can declare it.
    const conVista = withPresetSelected(emptyFilters(), "anexo");
    const next = withCodeToggled(conVista, "5.1.2", RUBROS, { keepPreset: true });

    expect(next.preset).toBe("anexo");
    expect(next.codes).toEqual(["5.1.2"]);
  });

  it("sin esa salida sigue siendo excluyente, que es la regla de «Ventas»", () => {
    const conVista = withPresetSelected(emptyFilters(), "lineas");
    const next = withCodeToggled(conVista, "4.1", ["4.1"]);

    expect(next.preset).toBeNull();
    expect(next.codes).toEqual(["4.1"]);
  });

  it("apagarla limpia las marcas que se hubieran puesto dentro", () => {
    const conVista = withCodeToggled(withPresetSelected(emptyFilters(), "anexo"), "5.1.2", RUBROS, {
      keepPreset: true,
    });
    const apagada = withPresetSelected(conVista, "anexo");

    expect(apagada.preset).toBeNull();
    expect(apagada.codes).toEqual([]);
  });
});

describe("el año a la vista", () => {
  const LOADED = [2024, 2025, 2026];

  it("sin marcas resuelve al más reciente, no a todos", () => {
    // The declared exception Ventas and Costo de personal already make: Datos speaks in columns
    // that carry their year, and three exercises side by side is a table nobody opens on.
    expect(resolveVisibleYears(makeFilters(), LOADED)).toEqual([2026]);
  });

  it("una marca huérfana cuenta como ninguna", () => {
    expect(resolveVisibleYears(makeFilters({ years: [2023] }), LOADED)).toEqual([2026]);
  });

  it("varias marcas se tienden ascendentes, sin sumar", () => {
    expect(resolveVisibleYears(makeFilters({ years: [2026, 2024] }), LOADED)).toEqual([2024, 2026]);
  });

  it("sin años cargados no hay nada a la vista", () => {
    expect(resolveVisibleYears(makeFilters(), [])).toEqual([]);
    expect(resolveVisibleYears(makeFilters({ years: [2026] }), [])).toEqual([]);
  });

  it("«Todos los años» MARCA todos, porque vacío ya no significa todos", () => {
    const all = withAllYears(makeFilters(), LOADED);
    expect(all.years).toEqual(LOADED);
    expect(resolveVisibleYears(all, LOADED)).toEqual(LOADED);
    // Clearing goes back to the most recent, not to «all».
    expect(resolveVisibleYears(withYearsCleared(all), LOADED)).toEqual([2026]);
  });

  it("marcar un segundo año se hace SOBRE el resuelto", () => {
    // The bar toggles against what its checkboxes show (the resolved list), so marking 2025 while
    // 2026 is resolved ADDS it instead of replacing what was already on screen.
    const visible = resolveVisibleYears(makeFilters(), LOADED);
    const next = makeFilters({
      years: withYearToggled({ ...makeFilters(), years: visible }, 2025, LOADED).years,
    });
    expect(resolveVisibleYears(next, LOADED)).toEqual([2025, 2026]);
    // And unmarking the only visible year cannot leave zero: it resolves right back.
    const none = withYearToggled({ ...makeFilters(), years: [2026] }, 2026, LOADED);
    expect(none.years).toEqual([]);
    expect(resolveVisibleYears(none, LOADED)).toEqual([2026]);
  });

  it("el saneamiento NO resuelve el año: sin nada que podar devuelve el mismo objeto", () => {
    // The resolution lives in `resolveVisibleYears` and not here on purpose: this runs against a
    // context rebuilt on every edit, and a resolved `[2026]` in place of `[]` would be a new object
    // on every edit — which is exactly what re-renders the whole statement.
    const vacio = makeFilters();
    expect(sanitizeFilters(vacio, makeContext({ loadedYears: LOADED }))).toBe(vacio);
    expect(sanitizeFilters(vacio, makeContext({ loadedYears: LOADED })).years).toEqual([]);
  });

  it("Datos abre editable: exactamente un año a la vista sin marcar ninguno", () => {
    expect(canEditActiveYear(makeFilters(), LOADED)).toBe(true);
    expect(canEditActiveYear(makeFilters({ years: [2025, 2026] }), LOADED)).toBe(false);
    expect(canEditActiveYear(makeFilters(), [])).toBe(false);
  });
});
