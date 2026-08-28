import { describe, expect, it } from "vitest";
import type { AmountEntry } from "../analytics/structure";
import type { AnalyticsSource } from "../analytics/types";
import {
  ANNEX_MAX_SLICES,
  annexPlanOf,
  buildExpenseDistribution,
  DECLARED_ANNEX_ROWS,
  describeExpenseDistribution,
  residualCodes,
  shareOf,
} from "./expense-distribution";

/**
 * The figures are those of the real annex the firm brought (Hospital General Privado Durán, from 01
 * January to 30 June 2026): 1,120,438.68 of expense against 1,441,884.42 of revenue. Checking against
 * that file is the only thing that says the two percentage columns mean what their header promises.
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
  { code: "5.3.03.09", label: "Seguros y Reaseguros", value: 16_045.0 },
  { code: "5.3.03.12", label: "Gastos de Viaje Nacionales", value: 268.36 },
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
    // The ones rounded to whole numbers that are read in their PORCENTAJE column.
    const redondeado = (code: string) => Math.round(categoryOf(code).shareOfExpenses as number);

    expect(redondeado("5.3.03.01")).toBe(27); // Honorarios Médicos
    expect(redondeado("5.2.01.01")).toBe(15); // Costos de Ventas Medicinas e Insumos
    expect(redondeado("5.5.01.01")).toBe(14); // Empleados Administración
    expect(redondeado("5.5.01.02")).toBe(8); // Otros Gastos Operacionales
    expect(redondeado("5.3.03.19")).toBe(7); // Depreciaciones
    expect(redondeado("5.3.03.17")).toBe(7); // Otros Gastos
    expect(redondeado("5.3.03.14")).toBe(2); // Servicios Básicos
    expect(redondeado("5.3.03.12")).toBe(0); // Gastos de Viaje Nacionales
  });

  it("los porcentajes sobre el gasto suman 100", () => {
    const total = buildExpenseDistribution(ANEXO, TOTALES).categories.reduce(
      (sum, category) => sum + (category.shareOfExpenses ?? 0),
      0,
    );

    expect(total).toBeCloseTo(100, 6);
  });

  it("la segunda columna mide contra el INGRESO, no contra el gasto", () => {
    // Honorarios Médicos is 27.4 % of the expense but only 21.3 % of what the hospital billed. They
    // are the annex's two questions and they cannot be answered with a single denominator.
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
    expect(categories.at(-1)?.code).toBe("5.3.03.12");
  });

  it("deja fuera las cuentas paradas y las CUENTA en vez de nombrarlas", () => {
    // A statement declares every account of its plan whether it moves or not; the annex only lists
    // the ones that do.
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
    // The revenue does give a base, so that column is kept: they are two independent questions.
    expect(categories.every((category) => category.shareOfRevenue !== null)).toBe(true);
  });
});

describe("el denominador es el rollup, no la suma de lo que hay en pantalla", () => {
  it("un subconjunto de categorías suma menos de 100 %, y eso es lo correcto", () => {
    // It is the same rule the ficha follows with its parent account and the 100 % stack: choosing
    // three of eight children falls short on purpose, because the total is not «what is visible».
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
    // Without that line, «Otros» reads as one more account of the plan instead of as a fold.
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

/**
 * THE DECLARED ANNEX. The plan is transcribed by its SHAPE from MicroPlus' real tree —the codes with
 * their nesting and the labels the file itself writes—, never from `.context/`: `parse.fixtures.ts`'
 * rule. What is tested is that the list chooses and names, which is the only thing that can be wrong
 * here; the figures are tested by the block above.
 */
const CLINICA: Array<[string, string]> = [
  ["5", "COSTOS Y GASTOS"],
  ["5.2", "COSTOS DE VENTAS"],
  ["5.2.01", "COSTOS DE VENTAS MEDICINAS E INSUMOS"],
  ["5.2.01.01", "COSTOS DE VENTAS MEDICINAS E INSUMOS"],
  ["5.2.01.01.01", "Costo de ventas medicamentos 0%"],
  ["5.2.01.02", "COSTO ALIMENTACION"],
  ["5.2.01.02.01", "Costo Alimentacion, Viveres, Pacientes , Empleados"],
  // An annex line with GRANDCHILDREN: `5.2.02` hangs sections that in turn hang accounts.
  ["5.2.02", "MANO DE OBRA DIRECTA / FARMACIA/ LABORATORIO/MANO DE OBRA DIRECTA"],
  ["5.2.02.01", "SUELDOS Y SALARIOS Y DEMAS REMUNERACIONES / FARMACIA/ LABORATORIO"],
  ["5.2.02.01.01", "Sueldos y Salarios"],
  ["5.2.02.02", "APORTES A LA SEGURIDAD SOCIAL (Incluído Fondo Res / FARMACIA"],
  ["5.2.02.02.01", "Aporte Patronal"],
  // A branch the annex does NOT list: in the real file it does not move.
  ["5.2.03", "(-) DESCUENTO EN COMPRAS"],
  ["5.2.03.01", "DESCUENTO EN COMPRAS"],
  ["5.2.03.01.01", "Descuento en Compras"],
  ["5.2.04", "OTROS GASTOS DIRECTOS"],
  ["5.2.04.01", "HONORARIOS MEDICOS-PLANTA"],
  ["5.2.04.01.01", "Honorarios Médicos-Planta"],
  ["5.3", "COSTOS INDIRECTOS"],
  // With GREAT-GRANDCHILDREN: three levels below the line.
  ["5.3.02", "MANO DE OBRA INDIRECTA /ADMISIONES / CAJA / INFORMACION"],
  ["5.3.02.01", "MANO DE OBRA INDIRECTA /ADMISIONES / CAJA / INFORMACION"],
  ["5.3.02.01.01", "SUELDOS, SALARIOS Y DEMAS REMUNERACIONES / ADMISIONES"],
  ["5.3.02.01.01.01", "Sueldos y Salarios"],
  ["5.3.03", "OTROS GASTOS INDIRECTOS"],
  ["5.3.03.01", "HONORARIOS MEDICOS"],
  ["5.3.03.01.01", "Honorarios Medicos-Externos"],
  ["5.3.03.02", "REMUNERACIONES A OTROS TRABAJADORES AUTONOMOS"],
  ["5.3.03.02.01", "Trabajos Ocasionales"],
  ["5.3.03.04", "MANTENIMIENTO Y REPARACIONES"],
  ["5.3.03.04.01", "Mantenimiento y Reparaciones de Edificio e Instala"],
  ["5.3.03.06", "PROMOCION Y PUBLICIDAD"],
  ["5.3.03.06.01", "Promoción y Publicidad"],
  ["5.3.03.07", "COMBUSTIBLES"],
  ["5.3.03.07.01", "Combustibles - Gasolina- Diesel"],
  ["5.3.03.09", "SEGUROS Y REASEGUROS (Primas y Cesiones)"],
  ["5.3.03.09.01", "Seguros Contratados Instalaciones"],
  ["5.3.03.12", "GASTOS DE VIAJE NACIONALES"],
  ["5.3.03.12.02", "GASTOS DE VIAJE NACIONALES"],
  ["5.3.03.12.02.01", "Pasajes Aereos Nacionales"],
  ["5.3.03.14", "AGUA, ENERGIA, LUZ Y TELECOMUNICACIONES"],
  ["5.3.03.14.01", "Luz"],
  ["5.3.03.17", "OTROS GASTOS"],
  ["5.3.03.17.01", "Suministros de Oficina"],
  ["5.3.03.19", "DEPRECIACIONES"],
  ["5.3.03.19.01", "Gasto Dep. Edificios"],
  ["5.5", "GASTOS"],
  ["5.5.01", "GASTOS ADMINISTRATIVOS"],
  ["5.5.01.01", "GASTOS NOMINA /ADMINISTRACION"],
  ["5.5.01.01.01", "SUELDOS, SALARIOS Y DEMAS REMUNERACIONES / ADMINISTRACION"],
  ["5.5.01.01.01.01", "Sueldos y Salarios"],
  ["5.5.01.02", "OTROS GASTOS OPERACIONALES"],
  ["5.5.01.02.01", "HONORARIOS, COMISIONES Y DIETAS"],
  ["5.5.01.02.01.01", "Honorarios Asesoria Contable"],
  ["5.5.02", "GASTOS NO OPERACIONALES"],
  ["5.5.02.01", "GASTOS FINANCIEROS"],
  ["5.5.02.01.01", "INTERESES FINANCIEROS"],
  ["5.5.02.01.01.01", "Intereses Entidades Financieras"],
  ["5.5.03", "OTROS GASTOS NO OPERACIONALES"],
  ["5.5.03.01", "GASTOS NO DEDUCIBLES"],
  ["5.5.03.01.01", "Intereses y Multas (SRI-IESS-ATS-ATM)"],
];

/** Another MicroPlus plan: the same two roots and not one of the codes the annex declares. */
const OTRA_EMPRESA: Array<[string, string]> = [
  ["5", "Costos y Gastos"],
  ["5.1", "Costo de Servicios de Salud"],
  ["5.1.01", "Honorarios Médicos"],
  ["5.1.01.01", "Honorarios Medicina General"],
  ["5.1.02", "Insumos y Medicamentos"],
  ["5.1.02.01", "Medicamentos"],
];

function planSource(rows: ReadonlyArray<readonly [string, string]>): AnalyticsSource {
  const present = new Set(rows.map(([code]) => code));
  const parentOf = (code: string): string | undefined => {
    const parts = code.split(".");
    for (let cut = parts.length - 1; cut > 0; cut -= 1) {
      const candidate = parts.slice(0, cut).join(".");
      if (present.has(candidate)) {
        return candidate;
      }
    }
    return undefined;
  };
  return {
    centerId: "clinica",
    centerName: "Clínica",
    year: 2026,
    baseFrequency: "mensual",
    valuesByCode: new Map(rows.map(([code]) => [code, [1]])),
    namesByCode: new Map(rows.map(([code, name]) => [code, name])),
    parentByCode: new Map(
      rows.flatMap(([code]) => {
        const parent = parentOf(code);
        return parent ? [[code, parent] as [string, string]] : [];
      }),
    ),
    coverage: new Set([0]),
  };
}

const codesOf = (plan: ReturnType<typeof annexPlanOf>) => plan?.rows.map((row) => row.code);

describe("el anexo que la clínica declara", () => {
  it("el plan real lo abre y el reparto son sus diecisiete rubros", () => {
    const plan = annexPlanOf(planSource(CLINICA));

    expect(codesOf(plan)).toEqual(DECLARED_ANNEX_ROWS.map((row) => row.code));
    expect(plan?.residual).toBe(true);
  });

  it("entran los rubros que tienen NIETOS, que es por lo que es una lista y no una regla", () => {
    // Six of the seventeen are not «the deepest ancestor with children» — the structural rule that was
    // tried first would have split them into their sections and sunk them into «Otros».
    const codes = codesOf(annexPlanOf(planSource(CLINICA))) ?? [];

    expect(codes).toEqual(expect.arrayContaining(["5.2.02", "5.3.02", "5.3.03.12", "5.5.01.01"]));
    expect(codes).not.toContain("5.2.02.01");
    expect(codes).not.toContain("5.3.02.01");
    expect(codes).not.toContain("5.3.03.12.02");
  });

  it("otro plan de cuentas no la abre, aunque salga del mismo sistema", () => {
    expect(annexPlanOf(planSource(OTRA_EMPRESA))).toBeNull();
    expect(annexPlanOf(undefined)).toBeNull();
  });

  it("que falte un rubro no cierra la puerta; que falte la mayoría, sí", () => {
    const sinUno = CLINICA.filter(([code]) => !code.startsWith("5.5.03"));
    expect(codesOf(annexPlanOf(planSource(sinUno)))).toHaveLength(16);

    const soloDosRamas = CLINICA.filter(([code]) => code.startsWith("5.2") || code === "5");
    expect(annexPlanOf(planSource(soloDosRamas))).toBeNull();
  });

  it("marcar una sección deja sus rubros y apaga el residuo", () => {
    const plan = annexPlanOf(planSource(CLINICA), ["5.3.03"]);

    expect(codesOf(plan)).toEqual([
      "5.3.03.01",
      "5.3.03.04",
      "5.3.03.06",
      "5.3.03.07",
      "5.3.03.09",
      "5.3.03.12",
      "5.3.03.14",
      "5.3.03.17",
      "5.3.03.19",
    ]);
    // A piece of the annex does not drag the rest of the expense into one bar: the column adds up to
    // less than 100 %, which is what says a piece is being looked at.
    expect(plan?.residual).toBe(false);
  });

  it("marcar por debajo de sus rubros no deja ninguno, y entonces no hay anexo", () => {
    expect(codesOf(annexPlanOf(planSource(CLINICA), ["5.3.03.01.01"]))).toEqual([]);
    expect(codesOf(annexPlanOf(planSource(CLINICA), ["4"]))).toEqual([]);
  });
});

describe("cómo se dibuja el anexo declarado", () => {
  const PLAN = { rows: [...DECLARED_ANNEX_ROWS], residual: true };

  it("el rótulo declarado pisa al que trae el plan de cuentas", () => {
    // The file calls these three something else; the annex names them as its own sheet does.
    const { categories } = buildExpenseDistribution(
      [
        { code: "5.2.02", label: "MANO DE OBRA DIRECTA / FARMACIA/ LABORATORIO", value: 100 },
        { code: "5.3.03.14", label: "AGUA, ENERGIA, LUZ Y TELECOMUNICACIONES", value: 90 },
        { code: "5.5.01.01", label: "GASTOS NOMINA /ADMINISTRACION", value: 80 },
      ],
      { expenses: 270, revenue: 1_000 },
      { annex: PLAN },
    );

    expect(categories.map((entry) => entry.label)).toEqual([
      "EMPLEADOS M.O.D. / FARMACIA/ LABORATORIO",
      "SERVICIOS BASICOS",
      "EMPLEADOS ADMINISTRACION",
    ]);
  });

  it("dibuja los diecisiete sin plegar la cola por tamaño", () => {
    const reparto = buildExpenseDistribution(ANEXO, TOTALES, { annex: PLAN });

    expect(reparto.categories).toHaveLength(17);
    expect(reparto.maxSlices).toBe(17);
    // The seventeen add up to the whole expense, so nothing is missing and «Otros» is not drawn.
    expect(reparto.residual).toBe(false);
    expect(reparto.categories.map((entry) => entry.code)).not.toContain("otros");
  });

  it("un «Otros» en cero no se cuenta como cuenta parada", () => {
    // The breakdown covers the whole expense, so the residue is zero — and it is not an account.
    const reparto = buildExpenseDistribution(ANEXO, TOTALES, { annex: PLAN });

    expect(reparto.idle).toBe(0);
    expect(
      describeExpenseDistribution(reparto, { format: (value) => String(value) }),
    ).not.toContain("no se movió");
  });

  it("«Otros» es lo que falta para el total del gasto, no una suma de cuentas", () => {
    const reparto = buildExpenseDistribution(
      ANEXO,
      { expenses: GASTO_TOTAL + 5_000, revenue: INGRESO_TOTAL },
      { annex: PLAN },
    );
    const otros = reparto.categories.find((entry) => entry.code === "otros");

    expect(otros?.value).toBeCloseTo(5_000, 2);
    expect(reparto.residual).toBe(true);
    expect(describeExpenseDistribution(reparto, { format: (value) => String(value) })).toContain(
      "«Otros» es el resto del gasto que el anexo no nombra",
    );
    // And with it inside, the column closes at 100 % again.
    const suma = reparto.categories.reduce(
      (total, entry) => total + (entry.shareOfExpenses ?? 0),
      0,
    );
    expect(suma).toBeCloseTo(100, 6);
  });

  it("acotado por marcas no arrastra el resto del gasto a «Otros»", () => {
    const reparto = buildExpenseDistribution(ANEXO.slice(0, 3), TOTALES, {
      annex: { rows: [...DECLARED_ANNEX_ROWS], residual: false },
    });

    expect(reparto.categories).toHaveLength(3);
    expect(reparto.residual).toBe(false);
  });

  it("sin ningún rubro que nombrar no hay anexo, hay cuentas", () => {
    const reparto = buildExpenseDistribution(
      [{ code: "5.3.03.01.01", label: "Honorarios Medicos-Externos", value: 100 }],
      TOTALES,
      { annex: { rows: [], residual: true } },
    );

    expect(reparto.categories[0]?.label).toBe("Honorarios Medicos-Externos");
    expect(reparto.maxSlices).toBe(ANNEX_MAX_SLICES);
  });

  it("sin plan declarado el reparto es el de siempre", () => {
    const reparto = buildExpenseDistribution(ANEXO, TOTALES);

    expect(reparto.maxSlices).toBe(ANNEX_MAX_SLICES);
    expect(reparto.residual).toBe(false);
    expect(reparto.categories).toHaveLength(17);
  });
});

describe("lo que «Otros» agrupa", () => {
  const planOf = (rows: Array<[string, string]>) => {
    const source = planSource(rows);
    const plan = annexPlanOf(source);
    if (!plan) {
      throw new Error("El plan no abre el anexo");
    }
    return { source, plan };
  };

  it("para en el nivel más alto que el anexo no nombra, no en las hojas", () => {
    const { source, plan } = planOf(CLINICA);

    expect(residualCodes(source, plan)).toEqual(["5.2.03", "5.2.04", "5.3.03.02"]);
  });

  it("un rubro declarado se salta con toda su rama", () => {
    const { source, plan } = planOf(CLINICA);
    const fuera = residualCodes(source, plan);

    // `5.2.02` is declared and hangs sections with accounts of their own: neither it nor anything
    // under it may show up, or the residual would count the same dollar twice.
    expect(fuera).not.toContain("5.2.02");
    expect(fuera.some((code) => code.startsWith("5.2.02."))).toBe(false);
  });

  it("una raíz de gasto sin ningún rubro declarado sale entera", () => {
    const { source, plan } = planOf([
      ...CLINICA,
      ["6", "GASTOS NO OPERACIONALES"],
      ["6.1", "GASTOS NO OPERACIONALES"],
      ["6.1.01", "Intereses"],
    ]);

    expect(residualCodes(source, plan)).toEqual(["5.2.03", "5.2.04", "5.3.03.02", "6"]);
  });

  it("lo enumerado suma exactamente el residuo que el anexo resta", () => {
    const { source, plan } = planOf(CLINICA);
    const fuera = residualCodes(source, plan).map((code, index) => ({
      code,
      label: code,
      value: 1_000 * (index + 1),
    }));
    const residuo = fuera.reduce((total, entry) => total + entry.value, 0);
    const reparto = buildExpenseDistribution(
      [...ANEXO, ...fuera],
      { expenses: GASTO_TOTAL + residuo, revenue: INGRESO_TOTAL },
      { annex: plan },
    );

    expect(reparto.categories.find((entry) => entry.label === "Otros")?.value).toBeCloseTo(
      residuo,
      2,
    );
  });
});
