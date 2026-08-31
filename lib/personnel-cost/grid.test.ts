import { describe, expect, it } from "vitest";
import { readPersonnelCost } from "./derive";
import { GOLDEN_COVERAGE, goldenYear } from "./fixtures";
import { buildPersonnelGrid, type PersonnelGrid } from "./grid";

/** Un centavo, la misma tolerancia que `derive.test.ts`: el libro redondea donde el motor no. */
function expectToTheCent(actual: number | null | undefined, expected: number): void {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(0.03);
}

const SPAN = GOLDEN_COVERAGE;

function grid(
  options: Partial<Parameters<typeof buildPersonnelGrid>[1]> = {},
  years = [goldenYear()],
  span: readonly number[] = SPAN,
): PersonnelGrid {
  return buildPersonnelGrid(readPersonnelCost(years, span), {
    groups: [],
    hideEmptyRows: false,
    ...options,
  });
}

describe("La tabla habla en COLUMNAS que cargan su año", () => {
  it("un año son sus meses, su Total y su porcentaje", () => {
    const { columns } = grid();
    expect(columns.map((column) => column.label)).toEqual([
      "Ene",
      "Feb",
      "Mar",
      "Abr",
      "May",
      "Jun",
      "Total",
      "% vs ventas",
    ]);
    expect(columns.every((column) => column.year === 2026)).toBe(true);
  });

  it("un mes no cubierto se dice con un hueco, no con un cero", () => {
    const built = grid({}, [goldenYear({ coverage: [0, 1, 2] })], [0, 1, 2, 3]);
    const row = built.rows.find((entry) => entry.key === "grand");
    expect(row?.cells.find((cell) => cell.key === "grand:2026:m3")).toBeUndefined();
    expect(built.months).toEqual([0, 1, 2]);
  });

  it("VARIOS años dejan de hablar en meses: cada ejercicio es su Total y su porcentaje", () => {
    const { columns, blocks, comparing } = grid({}, [goldenYear({ year: 2025 }), goldenYear()]);
    expect(comparing).toBe(true);
    // Dos ejercicios × (Total + %) más el consolidado: seis columnas, no veintiocho.
    expect(columns).toHaveLength(6);
    expect(columns.some((column) => column.kind === "month")).toBe(false);
    expect(blocks.map((block) => block.label)).toEqual(["2025", "2026", "Consolidado"]);
    expect(blocks.map((block) => block.span)).toEqual([2, 2, 2]);
  });
});

describe("El consolidado", () => {
  const built = grid({}, [goldenYear({ year: 2025 }), goldenYear()]);
  const cellOf = (rowKey: string, columnKey: string) =>
    built.rows.find((row) => row.key === rowKey)?.cells.find((cell) => cell.key === columnKey);

  it("cierra la tabla y no lleva año", () => {
    const last = built.columns.slice(-2);
    expect(last.map((column) => column.year)).toEqual([null, null]);
    expect(last.map((column) => column.kind)).toEqual(["total", "share"]);
  });

  it("SUMA los tramos en cada nivel de la tabla", () => {
    expectToTheCent(cellOf("grand", "grand:consolidado:total")?.value, 721764.13 * 2);
    expectToTheCent(
      cellOf("group:afiliados", "group:afiliados:consolidado:total")?.value,
      231825.63 * 2,
    );
    expectToTheCent(
      cellOf("section:planta", "section:planta:consolidado:total")?.value,
      396223.94 * 2,
    );
  });

  it("divide por la suma de las ventas y NUNCA promedia los porcentajes de al lado", () => {
    // Dos ejercicios con las mismas ventas dan el mismo 50.1 %; lo que se comprueba es de dónde sale.
    const share = cellOf("grand", "grand:consolidado:share")?.value;
    expect(share).toBeCloseTo(50.1, 1);
    const y2025 = cellOf("grand", "grand:2025:share")?.value as number;
    const y2026 = cellOf("grand", "grand:2026:share")?.value as number;
    const total = (cellOf("grand", "grand:consolidado:total")?.value ?? 0) as number;
    const revenue = 1441884.42 * 2;
    expect(share).toBeCloseTo((total / revenue) * 100, 6);
    expect(share).not.toBe((y2025 + y2026) / 2 + 1);
  });
});

describe("Las filas calculadas", () => {
  it("cada grupo cierra en dólares Y en porcentaje, que es lo que el libro no dice", () => {
    const { rows } = grid();
    const subtotal = rows.find((row) => row.key === "group:no-afiliados");
    expect(subtotal?.label).toBe("Subtotal no afiliados");
    expect(subtotal?.cells.find((cell) => cell.kind === "total")?.value).toBeCloseTo(164398.31, 2);
    expect(subtotal?.cells.find((cell) => cell.kind === "share")?.value).toBeCloseTo(11.4, 1);
  });

  it("la sección cierra JUSTO DESPUÉS del último grupo que la compone", () => {
    const keys = grid()
      .rows.filter((row) => row.kind !== "concept")
      .map((row) => row.key);
    expect(keys).toEqual([
      "group:afiliados",
      "group:no-afiliados",
      "section:planta",
      "group:honorarios-medicos",
      "grand",
    ]);
  });

  it("una sección de UN solo grupo no se repite: ese subtotal carga los dos nombres", () => {
    const row = grid().rows.find((entry) => entry.key === "group:honorarios-medicos");
    expect(row?.label).toBe("Externos · subtotal honorarios médicos");
    expect(row?.cells.find((cell) => cell.kind === "share")?.value).toBeCloseTo(22.6, 1);
    expect(grid().rows.some((entry) => entry.key === "section:externos")).toBe(false);
  });

  it("«Planta» lleva escrito qué suma", () => {
    const planta = grid().rows.find((row) => row.key === "section:planta");
    expect(planta?.hint).toBe("Afiliados + no afiliados");
    expect(planta?.cells.find((cell) => cell.kind === "share")?.value).toBeCloseTo(27.5, 1);
  });

  it("acotar a UN grupo no repite su subtotal tres veces", () => {
    const { rows } = grid({ groups: ["afiliados"] });
    expect(rows.filter((row) => row.kind !== "concept").map((row) => row.key)).toEqual([
      "group:afiliados",
    ]);
  });

  it("acotar a los dos grupos de planta dibuja su sección pero no la de externos", () => {
    const keys = grid({ groups: ["afiliados", "no-afiliados"] }).rows.map((row) => row.key);
    expect(keys).toContain("section:planta");
    expect(keys).not.toContain("section:externos");
    expect(keys).toContain("grand");
  });
});

describe("La banda del grupo", () => {
  it("la abre la primera fila y abarca los conceptos MÁS su subtotal", () => {
    const { rows } = grid({ groups: ["afiliados"] });
    expect(rows[0].group).toBe("afiliados");
    expect(rows[0].groupSpan).toBe(5);
    expect(rows.slice(1).every((row) => row.groupSpan === 0)).toBe(true);
  });

  it("se recalcula DESPUÉS de esconder las filas en cero, no antes", () => {
    const { rows } = grid({ groups: ["no-afiliados"], hideEmptyRows: true });
    // Nueve conceptos, uno de ellos («Farmacia-Bioquímico-Planta») en cero los seis meses.
    expect(rows[0].groupSpan).toBe(9);
    expect(rows.filter((row) => row.kind === "concept")).toHaveLength(8);
  });
});

describe("Ocultar filas en cero", () => {
  it("cuenta lo que retiene, para poder decirlo", () => {
    const built = grid({ hideEmptyRows: true });
    expect(built.hiddenRows).toBe(2);
    expect(built.rows.some((row) => row.key === "concept:honorarios-farmacia-planta")).toBe(false);
  });

  it("una cuenta ausente del plan no es una fila en cero: se distingue", () => {
    const accounts = new Map(goldenYear().accounts);
    accounts.delete("5.3.03.01.03");
    const built = grid({}, [goldenYear({ accounts })]);
    const row = built.rows.find((entry) => entry.key === "concept:honorarios-enfermeria-externos");
    expect(row?.missing).toBe(true);
    expect(row?.moves).toBe(false);
  });
});

describe("La captura vive EN la tabla", () => {
  it("sólo la fila de la familia escribe, y sólo en los meses cargados", () => {
    const built = grid({}, [goldenYear({ coverage: [0, 1, 2] })]);
    const familia = built.rows.find((row) => row.key === "concept:familia");
    const editable = familia?.cells.filter((cell) => cell.edit !== null) ?? [];
    expect(editable).toHaveLength(3);
    expect(editable.map((cell) => cell.edit?.monthIndex)).toEqual([0, 1, 2]);
    expect(editable.every((cell) => cell.edit?.year === 2026)).toBe(true);
  });

  it("ninguna otra fila escribe, ni el Total ni el porcentaje de la que sí", () => {
    const built = grid();
    const writable = built.rows.filter((row) => row.cells.some((cell) => cell.edit !== null));
    expect(writable.map((row) => row.key)).toEqual(["concept:familia"]);
    const familia = writable[0];
    expect(
      familia.cells.filter((cell) => cell.kind !== "month").every((cell) => cell.edit === null),
    ).toBe(true);
  });

  it("comparando ejercicios no hay dónde escribir, porque no hay columna de mes", () => {
    const built = grid({}, [goldenYear({ year: 2025 }), goldenYear()]);
    expect(built.rows.every((row) => row.cells.every((cell) => cell.edit === null))).toBe(true);
    // Y por eso la vista lo dice: se captura con un solo año marcado.
    expect(built.comparing).toBe(true);
  });
});
