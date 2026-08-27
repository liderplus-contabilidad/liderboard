import { describe, expect, it } from "vitest";
import { makeDataset, CENTRO_VACIO_SOURCE, CULTURA_MANOR_SOURCE } from "../analytics/fixtures";
import { periodRangeLabel, periodsForYear } from "../analytics/period";
import { buildAnalyticsSource } from "../analytics/source";
import type { AnalyticsSource } from "../analytics/types";
import { buildAccountTree, computeResult, computeRollups } from "../derive";
import type { PygDataset } from "../types";
import { buildWaterfall, RESULT_CODE, type WaterfallStep } from "./waterfall";

const MENSUAL = { frequency: "mensual" } as const;

/**
 * Cultura Manor, Ene–Jul, at a glance. Income nets the −507 of `4.1.4` and February books no
 * events, which is why the total is not seven identical months.
 */
const INCOME = 176_303;
const GASTOS_GENERALES = 77_847;
const GASTOS_PERSONAL = 63_000;
const RESULT = INCOME - GASTOS_GENERALES - GASTOS_PERSONAL;

interface Row {
  code: string;
  name: string;
  amount?: number;
}

/**
 * A source over an invented chart of accounts with a single month of movement, so every sum is
 * the amount itself and the expected numbers can be read off the rows. It goes through
 * `buildAnalyticsSource` like every other source — the tree, the rollups and the coverage are
 * the engine's, never re-implemented here.
 */
function sourceOf(rows: Row[]): AnalyticsSource {
  const dataset: PygDataset = {
    ...makeDataset(),
    id: "inventado",
    accounts: rows.map((row) => ({
      code: row.code,
      name: row.name,
      values: Array.from({ length: 12 }, (_, month) => (month === 0 ? (row.amount ?? 0) : 0)),
    })),
  };
  return buildAnalyticsSource(dataset);
}

/** Three expense groups whose amounts are the ones the spec names. */
const TRES_GASTOS = sourceOf([
  { code: "4", name: "Ingresos" },
  { code: "4.1", name: "Ventas", amount: 100_000 },
  { code: "5", name: "Costos y Gastos" },
  { code: "5.1", name: "Gastos Operacionales" },
  { code: "5.1.1", name: "Arrendamiento Operativo", amount: 56_000 },
  { code: "5.1.2", name: "Sueldos", amount: 16_874 },
  { code: "5.1.3", name: "Publicidad", amount: 4_134 },
]);

/** Twelve groups: eight are drawn and the remaining four fold into «Otros gastos». */
const DOCE_GASTOS = sourceOf([
  { code: "4", name: "Ingresos" },
  { code: "4.1", name: "Ventas", amount: 100_000 },
  { code: "5", name: "Costos y Gastos" },
  { code: "5.1", name: "Gastos Operacionales" },
  ...Array.from({ length: 12 }, (_, index) => ({
    code: `5.1.${index + 1}`,
    name: `Gasto ${index + 1}`,
    amount: (12 - index) * 1_000,
  })),
]);

/**
 * A chart of accounts like the real one: the root opens into two branches and one takes 80% of the
 * expense, with the rent hidden inside it.
 */
const RAMA_PESADA = sourceOf([
  { code: "4", name: "Ingresos" },
  { code: "4.1", name: "Ventas", amount: 200_000 },
  { code: "5", name: "Costos y Gastos" },
  { code: "5.1", name: "Costos de Venta y Producción" },
  { code: "5.1.1", name: "Materia Prima", amount: 20_000 },
  { code: "5.1.2", name: "Arrendamiento Operativo", amount: 60_000 },
  { code: "5.2", name: "Gastos", amount: 19_000 },
]);

/** Three even groups hanging off a single-child chain: there is nothing to open. */
const RAMAS_PAREJAS = sourceOf([
  { code: "4", name: "Ingresos" },
  { code: "4.1", name: "Ventas", amount: 200_000 },
  { code: "5", name: "Costos y Gastos" },
  { code: "5.1", name: "Gastos Operacionales" },
  { code: "5.1.1", name: "Materia Prima", amount: 35_000 },
  { code: "5.1.2", name: "Sueldos", amount: 33_000 },
  { code: "5.1.3", name: "Intereses", amount: 32_000 },
]);

/** Expenses beyond income: the result closes below zero and a delta crosses it on the way. */
const EN_PERDIDA = sourceOf([
  { code: "4", name: "Ingresos" },
  { code: "4.1", name: "Ventas", amount: 10_000 },
  { code: "5", name: "Costos y Gastos" },
  { code: "5.1", name: "Gastos Operacionales" },
  { code: "5.1.1", name: "Sueldos", amount: 20_000 },
  { code: "5.1.2", name: "Publicidad", amount: 5_000 },
]);

function deltas(steps: WaterfallStep[]): WaterfallStep[] {
  return steps.filter((step) => step.kind === "delta");
}

/** The «Utilidad o Pérdida» row of the Datos tab, over the whole year of a dataset. */
function resultFromTable(dataset: PygDataset): number {
  const { roots } = buildAccountTree(dataset.accounts);
  const { values } = computeResult(computeRollups(roots));
  return values.reduce((sum, value) => sum + value, 0);
}

describe("modelo de escalones", () => {
  it("empieza en el total de ingresos y termina en el resultado, los dos anclados en cero", () => {
    const { steps } = buildWaterfall(CULTURA_MANOR_SOURCE, MENSUAL);
    const last = steps[steps.length - 1];

    expect(steps[0]).toMatchObject({ kind: "total", code: "4", value: INCOME, start: 0 });
    expect(last).toMatchObject({ kind: "total", code: RESULT_CODE, value: RESULT, start: 0 });
    expect(last.end).toBe(RESULT);
  });

  it("hace arrancar cada escalón intermedio donde cerró el anterior", () => {
    const { steps } = buildWaterfall(TRES_GASTOS, MENSUAL);

    expect(deltas(steps)).toHaveLength(3);
    steps.slice(1, -1).forEach((step, index) => {
      expect(step.kind).toBe("delta");
      expect(step.start).toBe(steps[index].end);
      expect(step.end).toBe(step.start + step.value);
    });
  });

  it("nombra el resultado según su signo", () => {
    expect(buildWaterfall(TRES_GASTOS, MENSUAL).steps.at(-1)?.label).toBe("Utilidad");
    expect(buildWaterfall(EN_PERDIDA, MENSUAL).steps.at(-1)?.label).toBe("Pérdida");
  });
});

describe("el último escalón cierra en el resultado", () => {
  it("cuadra con la aritmética de computeResult", () => {
    const dataset = makeDataset();
    const { steps } = buildWaterfall(buildAnalyticsSource(dataset), MENSUAL);

    expect(steps.at(-1)?.end).toBe(resultFromTable(dataset));
  });

  it("sigue cuadrando cuando la cola se agrupa en «Otros gastos»", () => {
    const { steps, grouped } = buildWaterfall(DOCE_GASTOS, MENSUAL);

    expect(grouped).toBe(4);
    // 100,000 of revenue minus 78,000 of expense, grouped or not.
    expect(steps.at(-1)?.end).toBe(22_000);
    expect(steps[0].value + deltas(steps).reduce((sum, step) => sum + step.value, 0)).toBe(22_000);
  });

  it("cierra bajo cero cuando los gastos superan a los ingresos", () => {
    const { steps } = buildWaterfall(EN_PERDIDA, MENSUAL);
    const last = steps.at(-1);

    expect(last).toMatchObject({ kind: "total", value: -15_000, start: 0, end: -15_000 });
    // The step that crosses zero keeps its arithmetic: 10,000 − 20,000.
    expect(deltas(steps)[0]).toMatchObject({ value: -20_000, start: 10_000, end: -10_000 });
  });
});

describe("el signo sale de signFor", () => {
  it("hace bajar un gasto que el archivo guarda en positivo", () => {
    const step = deltas(buildWaterfall(TRES_GASTOS, MENSUAL).steps)[0];

    expect(step).toMatchObject({ code: "5.1.1", value: -56_000 });
    expect(step.end).toBeLessThan(step.start);
  });

  it("no invierte dos veces un descuento sobre ventas", () => {
    const { steps } = buildWaterfall(CULTURA_MANOR_SOURCE, MENSUAL);
    // `4.1.4` is worth −507 a month: 179,852 of gross sales minus 3,549 of discounts.
    const bruto = 179_852;
    const descuentos = 3_549;

    expect(steps[0].value).toBe(bruto - descuentos);
    expect(steps[0].value).not.toBe(bruto + descuentos);
  });
});

describe("agrupación legible", () => {
  it("salta la cadena redundante de un solo hijo", () => {
    const { steps } = buildWaterfall(RAMAS_PAREJAS, MENSUAL);

    // The tree is 5 → 5.1 → {5.1.1, 5.1.2, 5.1.3}: the steps are the siblings, not the single child
    // that hangs them.
    expect(deltas(steps).map((step) => step.code)).toEqual(["5.1.1", "5.1.2", "5.1.3"]);
  });

  it("abre el grupo que se lleva la mayor parte del gasto", () => {
    const { steps } = buildWaterfall(RAMA_PESADA, MENSUAL);

    // «Costos de Venta y Producción» takes 80%: a single bar explains nothing, so what is inside is
    // drawn and the rent appears by its name.
    expect(deltas(steps).map((step) => step.code)).toEqual(["5.1.2", "5.1.1", "5.2"]);
    expect(steps.at(-1)?.end).toBe(200_000 - 99_000);
  });

  it("no abre un grupo que ya se explica solo", () => {
    const { steps } = buildWaterfall(RAMAS_PAREJAS, MENSUAL);

    // The largest weighs a third of the expense: opening it would be a comb for no reason.
    expect(deltas(steps)).toHaveLength(3);
  });

  it("deja de abrir cuando el grupo pesado es una cuenta de movimiento", () => {
    const { steps } = buildWaterfall(TRES_GASTOS, MENSUAL);

    // Arrendamiento takes 72% but has no children: there is nothing to open.
    expect(deltas(steps).map((step) => step.code)).toEqual(["5.1.1", "5.1.2", "5.1.3"]);
  });

  it("pone el gasto más grande primero", () => {
    const { steps } = buildWaterfall(TRES_GASTOS, MENSUAL);

    expect(deltas(steps).map((step) => step.value)).toEqual([-56_000, -16_874, -4_134]);
  });

  it("agrupa la cola en «Otros gastos»", () => {
    const { steps } = buildWaterfall(DOCE_GASTOS, MENSUAL);
    const tail = deltas(steps).at(-1);

    expect(deltas(steps)).toHaveLength(9);
    // 4,000 + 3,000 + 2,000 + 1,000, the four that fell outside the cap of eight.
    expect(tail).toMatchObject({ label: "Otros gastos", value: -10_000 });
  });

  it("no dibuja un grupo que vale cero en el rango sumado", () => {
    const source = sourceOf([
      { code: "4", name: "Ingresos" },
      { code: "4.1", name: "Ventas", amount: 100_000 },
      { code: "5", name: "Costos y Gastos" },
      { code: "5.1", name: "Gastos Operacionales" },
      { code: "5.1.1", name: "Sueldos", amount: 20_000 },
      { code: "5.1.2", name: "Cuenta sin movimiento", amount: 0 },
    ]);

    expect(deltas(buildWaterfall(source, MENSUAL).steps).map((step) => step.code)).toEqual([
      "5.1.1",
    ]);
  });
});

describe("la cascada resume los periodos cubiertos", () => {
  it("suma los siete periodos de un archivo que llega hasta julio", () => {
    const { steps, periods } = buildWaterfall(CULTURA_MANOR_SOURCE, MENSUAL);

    expect(periods).toHaveLength(7);
    // Twelve months of revenue would be worth 302,448; the cascade does not count the ones with no
    // coverage.
    expect(steps[0].value).toBe(INCOME);
  });

  it("declara el rango que sumó, no el año del archivo", () => {
    const { periods } = buildWaterfall(CULTURA_MANOR_SOURCE, MENSUAL);

    // The dataset is called «Ene–Dic 2026»; the coverage says otherwise and it is the one that leads.
    expect(periodRangeLabel(periods)).toBe("Ene–Jul");
  });

  it("suma solo los periodos que la selección dejó en el eje", () => {
    const { steps, periods } = buildWaterfall(CULTURA_MANOR_SOURCE, {
      frequency: "mensual",
      periods: periodsForYear(2026, "mensual").slice(0, 2),
    });

    expect(periods).toHaveLength(2);
    // A complete January plus a February with no Ventas Eventos.
    expect(steps[0].value).toBe(25_229 + 24_929);
  });

  it("suma el mismo dinero leída por trimestre", () => {
    const { steps, periods } = buildWaterfall(CULTURA_MANOR_SOURCE, { frequency: "trimestral" });

    expect(periodRangeLabel(periods)).toBe("T1–T3");
    expect(steps[0].value).toBe(INCOME);
    expect(steps.at(-1)?.end).toBe(RESULT);
  });

  it("no dibuja cascada cuando ningún periodo tiene cobertura", () => {
    const { steps, periods } = buildWaterfall(CENTRO_VACIO_SOURCE, MENSUAL);

    expect(steps).toEqual([]);
    expect(periods).toEqual([]);
    expect(periodRangeLabel(periods)).toBe("");
  });

  it("avisa cuando la fuente no se puede leer a esa frecuencia", () => {
    const anual = buildAnalyticsSource(makeDataset({ baseFrequency: "anual" }));
    const { steps, warnings } = buildWaterfall(anual, MENSUAL);

    expect(steps).toEqual([]);
    expect(warnings).toHaveLength(1);
  });
});
