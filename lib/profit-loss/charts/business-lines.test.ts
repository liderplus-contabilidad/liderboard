import { describe, expect, it } from "vitest";
import { buildAnalyticsSource } from "../analytics/source";
import { buildSeries } from "../analytics/series";
import type { AnalyticsSource, Series, SeriesPoint } from "../analytics/types";
import type { AccountRow, PygDataset } from "../types";
import {
  buildBusinessLines,
  describeBusinessLines,
  columnsByCategory,
  columnsByCenter,
  readByPeriod,
  readTotal,
  selectBusinessLines,
  sumBusinessLines,
} from "./business-lines";

/**
 * The hotel's REAL chart of accounts, transcribed from its screenshots — with the five traps that
 * make it difficult and that no structural reading resolves on its own:
 *
 * - `Ventas Restaurante` hanging off `Habitaciones Sencillas`: it is HOSPEDAJE, because the line is
 *   defined by the branch and not by the leaf's name.
 * - `Ventas Eventos` hanging off `Venta de Hospedaje`: it is NOT hospedaje even though the plan nests
 *   it there.
 * - Restaurante and bar mixed under a single Alimentos y Bebidas account, with a `Sin desglosar` that
 *   no list of words picks up.
 * - Lavandería and Tours DUPLICATED in two different branches and at different depths.
 * - `Servicios de Lavandería` hidden under a parent called «Otros Ingresos de Actividades
 *   Ordinarias», and a `Rebaja y/o Descuentos` that has an income item inside it.
 */
const HOTEL: [string, string, number?][] = [
  ["4", "Ingresos"],
  ["4.1", "Ingresos de Actividades Ordinarias"],
  ["4.1.1", "Venta de Hospedaje"],
  ["4.1.1.1", "Venta de Hospedaje Tarifa 0%"],
  ["4.1.1.1.1", "Venta de Hospedaje Tarifa 0%"],
  ["4.1.1.1.1.0", "Sin desglosar", 100],
  ["4.1.1.1.1.1", "Ventas Habitaciones", 17],
  ["4.1.1.2", "Venta de Hospedaje Tarifa 15%"],
  ["4.1.1.2.1", "Habitaciones Sencillas"],
  ["4.1.1.2.1.0", "Sin desglosar", 17],
  ["4.1.1.2.1.1", "Ventas Restaurante", 4],
  ["4.1.1.2.2", "Habitaciones Dobles", 18],
  ["4.1.1.2.3", "Suites", 7],
  ["4.1.1.3", "Ventas Eventos", 2],
  ["4.1.1.4", "Ventas Restauracion Colectiva", 6],
  ["4.1.1.5", "Ventas Lavanderia", 323],
  ["4.1.1.6", "Ventas Telefono", 0],
  ["4.1.1.7", "Venta Parqueadero", 0],
  ["4.1.2", "Venta de Alimentos y Bebidas"],
  ["4.1.2.1", "Venta de Alimentos Tarifa 0%", 3],
  ["4.1.2.2", "Venta de Alimentos y Bebidas Tarifa 15%"],
  ["4.1.2.2.1", "Venta de Alimentos", 9],
  ["4.1.2.2.2", "Venta de Bebidas", 4],
  ["4.1.2.2.3", "Venta de Desayunos", 3],
  ["4.1.2.2.4", "Sin desglosar", 2],
  ["4.1.3", "Venta de Servicios de Tours", 6407],
  ["4.1.4", "Rebajas y Descuentos sobre Ventas", -2073],
  ["4.1.5", "Venta de Servicios Tours", 1525],
  ["4.1.7", "Rebaja y/o Descuentos sobre Ventas"],
  ["4.1.7.2", "Otros Ingresos", 26],
  ["4.1.8", "Otros Ingresos de Actividades ordinarias"],
  ["4.1.8.4", "Ventas Otros Servicios", 795],
  ["4.1.11", "Otros Ingresos de Actividades Ordinarias"],
  ["4.1.11.1", "Servicios de Lavandería", 581],
  ["4.2", "Otros Ingresos de Actividades Ordinarias"],
  ["4.2.4", "Comisiones Tours", 40],
  ["4.3", "Otros Ingresos Financieros"],
  ["4.3.2", "Intereses Financieros", 9],
  ["5", "Costos y Gastos"],
  ["5.1", "Costo de Servicios de Hospedaje"],
  ["5.1.1", "Lavandería y Lencería", 4],
];

/**
 * A REAL plan of another hotel that does NOT write «hospedaje» anywhere: it calls its branch
 * `Ingresos de Actividades Ordinarias` —just like the section— and hangs what it sells underneath.
 * The node is recognised by its children, not by its label.
 */
const HOTEL_SIN_LA_PALABRA: [string, string, number?][] = [
  ["4", "Ingresos"],
  ["4.1", "Ingresos de Actividades Ordinarias"],
  ["4.1.1", "Ingresos de Actividades Ordinarias"],
  ["4.1.1.1", "Ventas Habitaciones", 108],
  ["4.1.1.2", "Ventas Restaurante", 21],
  ["4.1.1.3", "Ventas Eventos", 2],
  ["4.1.1.5", "Ventas Lavanderia", 1],
  ["4.1.4", "Rebaja y/o Descuentos sobre Ventas", -5],
  ["4.1.8", "Otros Ingresos de Actividades ordinarias"],
  ["4.1.8.4", "Ventas Otros Servicios", 4],
];

/** A plan that is not a hotel's: no account names hospedaje or alojamiento. */
const COMERCIO: [string, string, number?][] = [
  ["4", "Ingresos"],
  ["4.1", "Ventas"],
  ["4.1.1", "Ventas de Mercadería", 100],
  ["4.1.2", "Ventas de Servicios", 40],
  ["5", "Costos y Gastos"],
  ["5.1", "Costo de Ventas", 60],
];

function makeSource(chart: readonly [string, string, number?][]): AnalyticsSource {
  const accounts: AccountRow[] = chart.map(([code, name, amount]) => ({
    code,
    name,
    values: Array.from({ length: 12 }, () => amount ?? 0),
  }));
  const dataset: PygDataset = {
    id: "hotel-2026",
    clientId: "cliente-de-prueba",
    fileName: "hotel-2026.xlsx",
    uploadedAt: 0,
    companyName: "ANDINA HOTELES Y TURISMO S.A.",
    periodLabel: "Ene–Dic 2026",
    year: 2026,
    baseFrequency: "mensual",
    role: "center",
    centerId: "quito",
    costCenterName: "C. C. QUITO",
    accounts,
    resultFromFile: [],
    warnings: [],
  };
  return buildAnalyticsSource(dataset);
}

const source = makeSource(HOTEL);

function lineByLabel(label: string) {
  return buildBusinessLines(source).lines.find((line) => line.label === label);
}

/** Each line's annual total, by the same path as the card. */
function totals(): Map<string, number | null> {
  const set = buildBusinessLines(source);
  const bundle = buildSeries([source], {
    codes: set.lines.flatMap((line) => line.codes),
    centerIds: ["quito"],
    years: [2026],
    frequency: "anual",
    limit: Number.MAX_SAFE_INTEGER,
  });
  return new Map(
    sumBusinessLines(bundle.series, set.lines).series.map((entry) => [
      entry.label,
      entry.points[0]?.value ?? null,
    ]),
  );
}

describe("buildBusinessLines", () => {
  it("son las cinco categorías de la firma más el resto, en ese orden", () => {
    expect(buildBusinessLines(source).lines.map((line) => line.label)).toEqual([
      "Hospedaje",
      "Restaurante",
      "Lavandería",
      "Bar",
      "Tours",
      "Otros ingresos ordinarios",
    ]);
  });

  it("funde en Hospedaje las dos ramas de tarifa enteras, y solo esas", () => {
    expect(lineByLabel("Hospedaje")?.codes).toEqual(["4.1.1.1", "4.1.1.2"]);
    // 100 + 17 (tarifa 0%) + 17 + 4 + 18 + 7 (tarifa 15%) × 12 months.
    expect(totals().get("Hospedaje")).toBe((100 + 17 + 17 + 4 + 18 + 7) * 12);
  });

  it("cuenta como hospedaje una `Ventas Restaurante` colgada dentro de Habitaciones Sencillas", () => {
    // The whole branch is hospedaje: the cut is one of DEPTH and not of name.
    expect(lineByLabel("Restaurante")?.codes).not.toContain("4.1.1.2.1.1");
  });

  it("saca de Hospedaje lo que el plan colgó ahí y es otro negocio", () => {
    // Eventos is none of the five: it falls into the rest. Lavandería is one of them.
    expect(lineByLabel("Otros ingresos ordinarios")?.codes).toContain("4.1.1.3");
    expect(lineByLabel("Lavandería")?.codes).toContain("4.1.1.5");
  });

  it("junta las cuentas DUPLICADAS de una categoría, estén donde estén del plan", () => {
    // Lavandería lives in two branches and at different depths; Tours, in three and one outside 4.1.
    expect(lineByLabel("Lavandería")?.codes).toEqual(["4.1.1.5", "4.1.11.1"]);
    expect(totals().get("Lavandería")).toBe((323 + 581) * 12);
    expect(lineByLabel("Tours")?.codes).toEqual(["4.1.3", "4.1.5", "4.2.4"]);
  });

  it("encuentra una categoría escondida bajo un padre llamado «Otros Ingresos»", () => {
    // `4.1.11` does not say lavandería; its only child does, and that is why it is descended into.
    expect(lineByLabel("Lavandería")?.codes).toContain("4.1.11.1");
    expect(lineByLabel("Otros ingresos ordinarios")?.codes).not.toContain("4.1.11");
  });

  it("parte Alimentos y Bebidas en Bar y el RESTO, que es Restaurante", () => {
    expect(lineByLabel("Bar")?.codes).toEqual(["4.1.2.2.2"]);
    expect(lineByLabel("Restaurante")?.codes).toEqual([
      "4.1.1.4",
      "4.1.2.1",
      "4.1.2.2.1",
      "4.1.2.2.3",
      "4.1.2.2.4",
    ]);
  });

  it("no pierde nada de Alimentos y Bebidas: Restaurante y Bar la suman entera", () => {
    const byLine = totals();
    const restauracionColectiva = 6 * 12;
    const fnb = (3 + 9 + 4 + 3 + 2) * 12;
    expect(
      (byLine.get("Restaurante") ?? 0) + (byLine.get("Bar") ?? 0) - restauracionColectiva,
    ).toBe(fnb);
  });

  it("deja fuera rebajas y descuentos, y lo dice", () => {
    const set = buildBusinessLines(source);
    expect(set.excluded.map((entry) => entry.label)).toEqual([
      "Rebajas y Descuentos sobre Ventas",
      "Rebaja y/o Descuentos sobre Ventas",
    ]);
    expect(set.lines.every((line) => !line.codes.includes("4.1.4"))).toBe(true);
    expect(describeBusinessLines(set)).toContain("Rebajas y Descuentos sobre Ventas");
  });

  it("recoge en el resto lo que no es ninguna de las cinco", () => {
    // Eventos, the telephone and the car park (both at zero) and the «Ventas Otros Servicios».
    expect(lineByLabel("Otros ingresos ordinarios")?.codes).toEqual([
      "4.1.1.3",
      "4.1.1.6",
      "4.1.1.7",
      "4.1.8.4",
    ]);
    expect(totals().get("Otros ingresos ordinarios")).toBe((2 + 795) * 12);
  });

  it("entra en la hermana que el PLAN declara ordinaria, y solo en esa", () => {
    // `4.2 Otros Ingresos de Actividades Ordinarias` brings `Comisiones Tours`, which the
    // accountant's report counts as Tours; `4.3 Otros Ingresos Financieros` does not declare it and is
    // left out.
    expect(lineByLabel("Tours")?.codes).toEqual(["4.1.3", "4.1.5", "4.2.4"]);
    expect(totals().get("Tours")).toBe((6407 + 1525 + 40) * 12);
    const codes = buildBusinessLines(source).lines.flatMap((line) => line.codes);
    expect(codes.some((code) => code.startsWith("4.3"))).toBe(false);
    expect(buildBusinessLines(source).sectionLabels).toEqual([
      "Ingresos de Actividades Ordinarias",
      "Otros Ingresos de Actividades Ordinarias",
    ]);
  });

  it("no confunde el costo de hospedaje de la raíz 5 con el nodo de ingresos", () => {
    expect(buildBusinessLines(source).sectionCodes[0]).toBe("4.1");
    const codes = buildBusinessLines(source).lines.flatMap((line) => line.codes);
    expect(codes.some((code) => code.startsWith("5"))).toBe(false);
  });

  it("cabe siempre en la paleta: seis categorías contra ocho ranuras", () => {
    expect(buildBusinessLines(source).lines.length).toBeLessThanOrEqual(8);
  });

  it("reconoce el nodo por sus HIJAS cuando el plan no escribe «hospedaje»", () => {
    // And it does not take the whole section for the business: `4.1` also has a child that sells
    // rooms, but a match by label is always preferred and, failing that, the shallowest one that is
    // not the section — here `4.1.1`, whose parent is the section.
    const otro = buildBusinessLines(makeSource(HOTEL_SIN_LA_PALABRA));
    expect(otro.sectionLabels).toEqual(["Ingresos de Actividades Ordinarias"]);
    expect(otro.lines.map((line) => `${line.label}: ${line.codes.join(",")}`)).toEqual([
      "Hospedaje: 4.1.1.1",
      "Restaurante: 4.1.1.2",
      "Lavandería: 4.1.1.5",
      "Otros ingresos ordinarios: 4.1.1.3,4.1.8.4",
    ]);
    expect(otro.excluded.map((entry) => entry.label)).toEqual([
      "Rebaja y/o Descuentos sobre Ventas",
    ]);
  });

  it("no declara líneas con un plan que no es de hotelería", () => {
    expect(buildBusinessLines(makeSource(COMERCIO)).lines).toEqual([]);
    expect(buildBusinessLines(undefined).lines).toEqual([]);
  });
});

/* ------------------------------------------------------------------ the sum */

function pointsOf(values: (number | null)[]): SeriesPoint[] {
  return values.map((value, index) => ({
    period: { year: 2026, frequency: "mensual" as const, index },
    value,
  }));
}

function seriesOf(code: string, values: (number | null)[]): Series {
  return {
    key: { code, centerId: "quito", year: 2026 },
    label: code,
    points: pointsOf(values),
    container: null,
  };
}

describe("el cuadre contra el estado", () => {
  const set = buildBusinessLines(source);

  it("dice cuánto suman las líneas y por qué no es lo que declara el estado", () => {
    // It is the first computation anyone does on seeing six bars, and doing it by hand against
    // another tab is what turns a correct reading into a suspicion.
    const note = describeBusinessLines(set, {
      lines: 204_045.51,
      section: 201_998.26,
      excluded: -2_047.25,
      idle: 0,
    });
    expect(note).toContain("Las 6 líneas suman $204,045.51");
    expect(note).toContain("el estado declara $201,998.26");
    expect(note).toContain("-$2,047.25");
    expect(note).not.toContain("sin clasificar");
  });

  it("cuando cuadra al centavo, lo AFIRMA en vez de callar", () => {
    expect(
      describeBusinessLines(set, {
        lines: 201_998.26,
        section: 201_998.264,
        excluded: 0,
        idle: 0,
      }),
    ).toContain("que es lo que el estado declara");
  });

  it("si lo excluido no explica la diferencia, dice cuánto queda sin clasificar", () => {
    const note = describeBusinessLines(set, {
      lines: 100,
      section: 150,
      excluded: 0,
      idle: 0,
    });
    expect(note).toContain("$50.00 sin clasificar");
  });
});

/**
 * The LEGEND: switching a category off and back on, the same gesture as the legend of months.
 *
 * What can be wrong is not which columns are drawn —that is visible— but the BALANCE: the note claims
 * how much the lines add up to against what the statement declares, and with one switched off that
 * subtraction stops closing. Without counting it, the note would declare thousands «unclassified»,
 * which is precisely the warning that something is wrong in the reading.
 */
describe("apagar una línea en la leyenda", () => {
  const set = buildBusinessLines(source);

  it("la aparta sin borrarla: sale de las barras y sigue en el conjunto", () => {
    const selected = selectBusinessLines(set, ["bar"]);
    expect(selected.lines.map((line) => line.label)).not.toContain("Bar");
    expect(selected.hidden.map((line) => line.label)).toEqual(["Bar"]);
    // Nothing else moves: what is excluded and the section it is squared against are the same.
    expect(selected.excluded).toEqual(set.excluded);
    expect(selected.sectionCodes).toEqual(set.sectionCodes);
  });

  it("una marca huérfana —de un plan que ya no está abierto— vale como ninguna", () => {
    // The same defence as the rest of the module: emptying the screen would be worse than not
    // narrowing.
    expect(selectBusinessLines(set, ["spa"]).lines).toEqual(set.lines);
  });

  it("el cuadre cuenta lo apagado como parte de la diferencia, no como sin clasificar", () => {
    const note = describeBusinessLines(selectBusinessLines(set, ["bar"]), {
      lines: 200_000,
      section: 201_998.26,
      excluded: -2_047.25,
      hidden: 4_045.51,
      idle: 0,
    });
    expect(note).toContain("$4,045.51");
    expect(note).not.toContain("sin clasificar");
  });

  it("NOMBRA las apagadas: una barra que falta se lee como un dato que falta", () => {
    const note = describeBusinessLines(selectBusinessLines(set, ["bar", "tours"]), {
      lines: null,
      section: null,
      excluded: null,
      idle: 0,
    });
    expect(note).toContain("Apagadas en la leyenda: Bar, Tours.");
  });

  it("sin ninguna apagada la nota no cambia ni una letra", () => {
    expect(describeBusinessLines(selectBusinessLines(set, []))).toBe(describeBusinessLines(set));
  });
});

describe("sumBusinessLines", () => {
  const lines = [
    { id: "hospedaje", label: "Hospedaje", codes: ["a", "b"] },
    { id: "bar", label: "Bar", codes: ["c"] },
  ];

  it("suma las cuentas de cada línea periodo a periodo", () => {
    const summed = sumBusinessLines(
      [seriesOf("a", [10, 20]), seriesOf("b", [1, 2]), seriesOf("c", [5, 5])],
      lines,
    );
    expect(summed.series.map((entry) => entry.points.map((point) => point.value))).toEqual([
      [11, 22],
      [5, 5],
    ]);
  });

  it("un periodo que ninguna cuenta cubre sigue siendo un hueco, nunca un cero", () => {
    const summed = sumBusinessLines(
      [seriesOf("a", [10, null]), seriesOf("b", [null, null]), seriesOf("c", [1, 1])],
      lines,
    );
    // The first is covered by a single account and is worth that one's; the second is covered by none.
    expect(summed.series[0].points.map((point) => point.value)).toEqual([10, null]);
  });

  it("quita las líneas que no se mueven en todo el tramo, y las cuenta", () => {
    // The real plan declares `Venta Parqueadero` and `Ventas Telefono` at zero all year: a legend of
    // invisible bars buries the one that matters.
    const withIdle = [
      { id: "hospedaje", label: "Hospedaje", codes: ["a"] },
      { id: "bar", label: "Bar", codes: ["z"] },
      { id: "tours", label: "Tours", codes: ["n"] },
    ];
    const summed = sumBusinessLines(
      [seriesOf("a", [3, 4]), seriesOf("z", [0, 0]), seriesOf("n", [null, null])],
      withIdle,
    );
    expect(summed.series.map((entry) => entry.label)).toEqual(["Hospedaje"]);
    expect(summed.idle).toBe(2);
    expect(
      describeBusinessLines(buildBusinessLines(source), {
        lines: null,
        section: null,
        excluded: null,
        idle: summed.idle,
      }),
    ).toContain("2 categorías quedaron fuera por no tener movimiento");
  });

  it("descarta la línea cuyas cuentas no están en la tanda, en vez de dibujarla en cero", () => {
    const summed = sumBusinessLines([seriesOf("c", [5, 5])], lines);
    expect(summed.series.map((entry) => entry.label)).toEqual(["Bar"]);
  });
});

/* --------------------------------------------------------------- the rotated axis */

describe("las tres lecturas del eje girado", () => {
  const lines = [
    { id: "hospedaje", label: "Hospedaje", codes: ["h"] },
    { id: "bar", label: "Bar", codes: ["b"] },
  ];
  const summed = (values: Record<string, (number | null)[]>) =>
    sumBusinessLines(
      Object.entries(values).map(([code, points]) => seriesOf(code, points)),
      lines,
    ).series;

  it("por TOTAL: una barra por categoría con la suma del tramo", () => {
    const reading = readTotal(columnsByCategory(summed({ h: [10, 20], b: [1, 2] })), "Ene–Feb");
    expect(reading.categories).toEqual(["Hospedaje", "Bar"]);
    expect(reading.series).toEqual([{ id: "total", label: "Ene–Feb", values: [30, 3] }]);
  });

  it("por PERIODO: lee por el ÍNDICE del eje, no por la posición en la lista", () => {
    // A year loaded up to the second month has two marks out of twelve columns: if `readByPeriod`
    // counted positions, the second would read column 1 of the axis instead of its own.
    const reading = readByPeriod(
      columnsByCategory(summed({ h: [10, null, 30], b: [1, null, 3] })),
      [
        { index: 0, label: "Ene" },
        { index: 2, label: "Mar" },
      ],
    );
    expect(reading.categories).toEqual(["Hospedaje", "Bar"]);
    expect(reading.series).toEqual([
      { id: "periodo-0", label: "Ene", values: [10, 1] },
      { id: "periodo-2", label: "Mar", values: [30, 3] },
    ]);
  });

  it("por CENTRO: una columna por (categoría, establecimiento), agrupadas por categoría", () => {
    // It is the shape of the accountant's sheet: under each activity, one row per sucursal. And the
    // pair that does not move opens NO column — a hotel with no bar would leave an empty column for
    // every month.
    const columns = columnsByCenter(
      [
        { id: "isamar", label: "ISAMAR", summed: summed({ h: [10, 20] }) },
        { id: "cartago", label: "CARTAGO", summed: summed({ h: [1, 1], b: [5, 5] }) },
      ],
      lines,
    );
    expect(columns.map((column) => `${column.group} · ${column.label}`)).toEqual([
      "Hospedaje · ISAMAR",
      "Hospedaje · CARTAGO",
      "Bar · CARTAGO",
    ]);
    // The category travels separately so the axis writes it ONCE over its columns.
    expect(readTotal(columns, "Ene–Feb").groups).toEqual([
      { label: "Hospedaje", span: 2 },
      { label: "Bar", span: 1 },
    ]);
    expect(readTotal(columnsByCategory([]), "Ene–Feb").groups).toBeUndefined();
  });

  it("por CENTRO: los meses siguen siendo las barras de cada columna", () => {
    const columns = columnsByCenter(
      [
        { id: "isamar", label: "ISAMAR", summed: summed({ h: [10, 20] }) },
        { id: "cartago", label: "CARTAGO", summed: summed({ h: [1, 1], b: [5, 5] }) },
      ],
      lines,
    );
    const reading = readByPeriod(columns, [
      { index: 0, label: "Ene" },
      { index: 1, label: "Feb" },
    ]);
    expect(reading.series).toEqual([
      { id: "periodo-0", label: "Ene", values: [10, 1, 5] },
      { id: "periodo-1", label: "Feb", values: [20, 1, 5] },
    ]);
  });
});
