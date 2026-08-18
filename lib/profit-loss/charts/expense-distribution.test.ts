import { describe, expect, it } from "vitest";
import type { AmountEntry } from "../analytics/structure";
import {
  buildExpenseDistribution,
  describeExpenseDistribution,
  shareOf,
} from "./expense-distribution";

/**
 * Las cifras son las del anexo real que trajo la firma (Hospital General Privado Durán, del 01 de
 * enero al 30 de junio de 2026): 1.120.438,68 de gasto contra 1.441.884,42 de ingreso. Comprobar
 * contra ese archivo es lo único que dice que las dos columnas de porcentaje significan lo que su
 * cabecera promete.
 */
const GASTO_TOTAL = 1_120_438.68;
const INGRESO_TOTAL = 1_441_884.42;

const ANEXO: AmountEntry[] = [
  { code: "5.2.01.01", label: "Costos de Ventas Medicinas e Insumos", value: 168_282.44 },
  { code: "5.2.01.02", label: "Costo Alimentación", value: 7_881.11 },
  { code: "5.2.02", label: "Empleados M.O.D. / Farmacia / Laboratorio", value: 37_973.19 },
  { code: "5.3.02", label: "Empleados M.O.I. / Admisiones / Caja", value: 40_919.04 },
  { code: "5.3.03.01", label: "Honorarios Médicos", value: 307_005.37 },
  { code: "5.3.03.04", label: "Mantenimiento y Reparaciones", value: 44_094.43 },
  { code: "5.3.03.06", label: "Promoción y Publicidad", value: 42_608.16 },
  { code: "5.3.03.07", label: "Combustibles", value: 1_214.81 },
  { code: "5.3.03.12", label: "Seguros y Reaseguros", value: 16_045.0 },
  { code: "5.3.03.13", label: "Gastos de Viaje Nacionales", value: 268.36 },
  { code: "5.3.03.14", label: "Servicios Básicos", value: 17_956.63 },
  { code: "5.3.03.17", label: "Otros Gastos", value: 81_086.25 },
  { code: "5.3.03.19", label: "Depreciaciones", value: 83_799.76 },
  { code: "5.5.01.01", label: "Empleados Administración", value: 152_951.84 },
  { code: "5.5.01.02", label: "Otros Gastos Operacionales", value: 94_886.27 },
  { code: "5.5.02.01", label: "Gastos Financieros", value: 22_632.71 },
  { code: "5.5.03.01", label: "Gastos No Deducibles", value: 833.31 },
];

const TOTALES = { expenses: GASTO_TOTAL, revenue: INGRESO_TOTAL };

function categoryOf(code: string) {
  const found = buildExpenseDistribution(ANEXO, TOTALES).categories.find(
    (category) => category.code === code,
  );
  if (!found) {
    throw new Error(`El anexo no trae ${code}`);
  }
  return found;
}

describe("el anexo real cuadra", () => {
  it("las diecisiete categorías suman el total declarado", () => {
    const sum = ANEXO.reduce((total, entry) => total + entry.value, 0);

    expect(sum).toBeCloseTo(GASTO_TOTAL, 2);
  });

  it("reproduce los porcentajes que imprime el archivo del contador", () => {
    // Los redondeados a entero que se leen en su columna PORCENTAJE.
    const redondeado = (code: string) => Math.round(categoryOf(code).shareOfExpenses as number);

    expect(redondeado("5.3.03.01")).toBe(27); // Honorarios Médicos
    expect(redondeado("5.2.01.01")).toBe(15); // Costos de Ventas Medicinas e Insumos
    expect(redondeado("5.5.01.01")).toBe(14); // Empleados Administración
    expect(redondeado("5.5.01.02")).toBe(8); // Otros Gastos Operacionales
    expect(redondeado("5.3.03.19")).toBe(7); // Depreciaciones
    expect(redondeado("5.3.03.17")).toBe(7); // Otros Gastos
    expect(redondeado("5.3.03.14")).toBe(2); // Servicios Básicos
    expect(redondeado("5.3.03.13")).toBe(0); // Gastos de Viaje Nacionales
  });

  it("los porcentajes sobre el gasto suman 100", () => {
    const total = buildExpenseDistribution(ANEXO, TOTALES).categories.reduce(
      (sum, category) => sum + (category.shareOfExpenses ?? 0),
      0,
    );

    expect(total).toBeCloseTo(100, 6);
  });

  it("la segunda columna mide contra el INGRESO, no contra el gasto", () => {
    // Honorarios Médicos es el 27,4 % del gasto pero solo el 21,3 % de lo que el hospital facturó.
    // Son las dos preguntas del anexo y no se pueden responder con un solo denominador.
    const honorarios = categoryOf("5.3.03.01");

    expect(honorarios.shareOfExpenses).toBeCloseTo(27.4, 1);
    expect(honorarios.shareOfRevenue).toBeCloseTo(21.3, 1);
  });

  it("dice qué parte del ingreso se fue en gastos, que es como abre el anexo", () => {
    const { expensesOverRevenue } = buildExpenseDistribution(ANEXO, TOTALES);

    expect(expensesOverRevenue).toBeCloseTo(77.7, 1);
  });
});

describe("el orden y lo que se deja fuera", () => {
  it("ordena de mayor a menor, no en orden de archivo", () => {
    const { categories } = buildExpenseDistribution(ANEXO, TOTALES);

    expect(categories.slice(0, 3).map((category) => category.code)).toEqual([
      "5.3.03.01",
      "5.2.01.01",
      "5.5.01.01",
    ]);
    expect(categories.at(-1)?.code).toBe("5.3.03.13");
  });

  it("deja fuera las cuentas paradas y las CUENTA en vez de nombrarlas", () => {
    // Un estado declara cada cuenta de su plan se mueva o no; el anexo solo lista las que sí.
    const conParadas = [
      ...ANEXO,
      { code: "5.3.03.20", label: "Venta Parqueadero", value: 0 },
      { code: "5.3.03.21", label: "Ventas Teléfono", value: 0 },
    ];
    const distribution = buildExpenseDistribution(conParadas, TOTALES);

    expect(distribution.categories).toHaveLength(ANEXO.length);
    expect(distribution.idle).toBe(2);
  });

  it("CONSERVA una categoría negativa: en un reparto de gastos eso es un hallazgo", () => {
    const conNota = [...ANEXO, { code: "5.3.03.22", label: "Nota de Crédito", value: -4_000 }];
    const distribution = buildExpenseDistribution(conNota, TOTALES);

    const nota = distribution.categories.at(-1);
    expect(nota?.code).toBe("5.3.03.22");
    expect(nota?.shareOfExpenses).toBeLessThan(0);
    expect(distribution.idle).toBe(0);
  });
});

describe("un porcentaje que no se puede calcular no es cero", () => {
  it("sin cobertura del denominador da null, nunca 0 %", () => {
    expect(shareOf(100, null)).toBeNull();
  });

  it("un denominador en cero da null en vez de dividir por cero", () => {
    expect(shareOf(100, 0)).toBeNull();
  });

  it("un cliente sin ingresos deja la columna del ingreso vacía y la del gasto entera", () => {
    const { categories, expensesOverRevenue } = buildExpenseDistribution(ANEXO, {
      expenses: GASTO_TOTAL,
      revenue: 0,
    });

    expect(categories.every((category) => category.shareOfRevenue === null)).toBe(true);
    expect(categories.every((category) => category.shareOfExpenses !== null)).toBe(true);
    expect(expensesOverRevenue).toBeNull();
  });

  it("sin gasto cubierto no hay reparto que porcentuar", () => {
    const { categories } = buildExpenseDistribution(ANEXO, {
      expenses: null,
      revenue: INGRESO_TOTAL,
    });

    expect(categories.every((category) => category.shareOfExpenses === null)).toBe(true);
    // El ingreso sí da base, así que esa columna se conserva: son dos preguntas independientes.
    expect(categories.every((category) => category.shareOfRevenue !== null)).toBe(true);
  });
});

describe("el denominador es el rollup, no la suma de lo que hay en pantalla", () => {
  it("un subconjunto de categorías suma menos de 100 %, y eso es lo correcto", () => {
    // Es la misma regla que sigue la ficha con su cuenta padre y la pila del 100 %: elegir tres de
    // ocho hijas se queda corto a propósito, porque el total no es «lo que se ve».
    const tres = ANEXO.slice(0, 3);
    const total = buildExpenseDistribution(tres, TOTALES).categories.reduce(
      (sum, category) => sum + (category.shareOfExpenses ?? 0),
      0,
    );

    expect(total).toBeLessThan(100);
    expect(total).toBeCloseTo(19.1, 1);
  });
});

describe("la nota al pie", () => {
  const format = (value: number) => `$${value.toFixed(2)}`;

  it("cuadra el reparto contra el ingreso, con centavos", () => {
    const note = describeExpenseDistribution(buildExpenseDistribution(ANEXO, TOTALES), { format });

    expect(note).toContain("17 rubros");
    expect(note).toContain("$1120438.68");
    expect(note).toContain("77.7 % de los ingresos");
  });

  it("dice cuántos rubros agrupó «Otros» y dónde están enteros", () => {
    // Sin esa línea, «Otros» se lee como una cuenta más del plan en vez de como un pliegue.
    const note = describeExpenseDistribution(buildExpenseDistribution(ANEXO, TOTALES), {
      grouped: 3,
      format,
    });

    expect(note).toContain("«Otros» agrupa 3 rubros más pequeños");
    expect(note).toContain("la tabla lista uno a uno");
  });

  it("no promete un cuadre cuando no hay gasto que cuadrar", () => {
    const note = describeExpenseDistribution(
      buildExpenseDistribution([], { expenses: null, revenue: null }),
      { format },
    );

    expect(note).toBeUndefined();
  });
});
