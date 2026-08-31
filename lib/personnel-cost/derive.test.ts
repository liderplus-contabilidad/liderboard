import { describe, expect, it } from "vitest";
import { PERSONNEL_ACCOUNT_CODES, PERSONNEL_CONCEPTS } from "./accounts";
import { readPersonnelCost, readPersonnelYear, shareOf, sumOf } from "./derive";
import {
  GOLDEN_CONCEPT_TOTALS,
  GOLDEN_COVERAGE,
  GOLDEN_MONTHLY_TOTAL,
  goldenYear,
} from "./fixtures";

/** El tramo completo del ejercicio cargado. */
const SPAN = GOLDEN_COVERAGE;

/**
 * Un centavo, la misma tolerancia con la que `upload/microplus.ts` valida la fila `RESULTADO:` del
 * archivo — y por el mismo motivo, sólo que aquí el que redondea es el libro y no el motor.
 *
 * El comparativo suma veintiún sumandos por columna, y en dos de ellas el Excel escribe un centavo
 * menos que la suma exacta: abril da $117,730.55 y la celda dice $117,730.54; el tramo da
 * $721,764.14 y la celda dice $721,764.13. No es un desacuerdo de criterio, es el redondeo de una
 * hoja de cálculo, así que la prueba lo admite en vez de doblar el motor para reproducirlo.
 */
const ONE_CENT = 0.011;

function expectToTheCent(actual: number | null, expected: number, what: string): void {
  expect(actual, what).not.toBeNull();
  expect(
    Math.abs((actual as number) - expected),
    `${what}: ${actual} vs ${expected}`,
  ).toBeLessThanOrEqual(ONE_CENT);
}

describe("El reporte real de enero–junio 2026, al centavo", () => {
  const reading = readPersonnelYear(goldenYear(), SPAN);

  it("reproduce el total de cada uno de los veintiún conceptos", () => {
    const totals = Object.fromEntries(
      reading.groups.flatMap((group) => group.rows.map((row) => [row.concept.id, row.total])),
    );
    for (const concept of PERSONNEL_CONCEPTS) {
      expect(totals[concept.id], concept.label).toBeCloseTo(GOLDEN_CONCEPT_TOTALS[concept.id], 2);
    }
  });

  it("reproduce el total del costo de personal, mes a mes y en el tramo", () => {
    for (const month of SPAN) {
      expectToTheCent(reading.monthly[month], GOLDEN_MONTHLY_TOTAL[month], `mes ${month}`);
    }
    expectToTheCent(reading.total, 721764.13, "total del tramo");
  });

  it("reproduce los tres subtotales de grupo", () => {
    const byGroup = Object.fromEntries(
      reading.groups.map((group) => [group.group.id, group.total]),
    );
    expect(byGroup["afiliados"]).toBeCloseTo(231825.63, 2);
    expect(byGroup["no-afiliados"]).toBeCloseTo(164398.31, 2);
    expect(byGroup["honorarios-medicos"]).toBeCloseTo(325540.2, 2);
  });

  it("reproduce la partición planta / externos, que es la conclusión del reporte", () => {
    const bySection = Object.fromEntries(
      reading.sections.map((entry) => [entry.section.id, entry]),
    );
    expect(bySection["planta"].total).toBeCloseTo(396223.94, 2);
    expect(bySection["externos"].total).toBeCloseTo(325540.2, 2);
    // Las dos celdas al pie del libro: 27 % y 23 %.
    expect(bySection["planta"].share).toBeCloseTo(27.5, 1);
    expect(bySection["externos"].share).toBeCloseTo(22.6, 1);
  });

  it("reproduce los tres niveles de porcentaje sobre las mismas ventas", () => {
    expect(reading.revenue).toBeCloseTo(1441884.42, 2);
    expect(reading.share).toBeCloseTo(50.1, 1);

    const familia = reading.groups[0].rows[0];
    expect(familia.share).toBeCloseTo(7.2, 1);
    expect(reading.groups[0].share).toBeCloseTo(16.1, 1);
    expect(reading.groups[1].share).toBeCloseTo(11.4, 1);
  });
});

describe("La familia sale de una fila y entra en la otra", () => {
  it("el par siempre suma la cuenta que trajo el archivo", () => {
    const reading = readPersonnelYear(goldenYear(), SPAN);
    const [familia, administracion] = reading.groups[0].rows;
    const account = goldenYear().accounts.get("5.5.01.01") as number[];
    for (const month of SPAN) {
      expect((familia.monthly[month] ?? 0) + (administracion.monthly[month] ?? 0)).toBeCloseTo(
        account[month],
        2,
      );
    }
  });

  it("un mes sin capturar deja ver la cuenta ENTERA, no un hueco", () => {
    const family = [...goldenYear().family];
    family[0] = null;
    const reading = readPersonnelYear(goldenYear({ family }), SPAN);
    const [familia, administracion] = reading.groups[0].rows;

    // La fila capturada no dice nada de ese mes…
    expect(familia.monthly[0]).toBeNull();
    // …y la derivada muestra los $26,302.69 completos, que es la lectura honesta de «nadie ha dicho
    // cuánto de esto es de la familia».
    expect(administracion.monthly[0]).toBeCloseTo(26302.69, 2);
    // El total del grupo no se mueve: lo que cambió es dónde está escrito.
    expect(reading.groups[0].total).toBeCloseTo(231825.63, 2);
  });
});

describe("`null` ≠ `0`: las dos ausencias y el cero de verdad", () => {
  it("un mes fuera de la cobertura no es un cero", () => {
    const reading = readPersonnelYear(goldenYear(), [0, 1, 2, 3, 4, 5, 6, 7]);
    // Julio y agosto se marcaron pero el ejercicio no los tiene cargados.
    expect(reading.monthly[6]).toBeNull();
    expect(reading.monthly[7]).toBeNull();
    expect(reading.months).toEqual([0, 1, 2, 3, 4, 5]);
    // Y no entran en ningún denominador: las ventas siguen siendo las de seis meses.
    expect(reading.revenue).toBeCloseTo(1441884.42, 2);
  });

  it("una cuenta que el plan no tiene lee igual que un mes nunca cargado, y se reporta", () => {
    const accounts = new Map(goldenYear().accounts);
    accounts.delete("5.2.04.01.03");
    const reading = readPersonnelYear(goldenYear({ accounts }), SPAN);

    const row = reading.groups[1].rows.find(
      (entry) => entry.concept.id === "honorarios-enfermeria-planta",
    );
    expect(row?.missing).toBe(true);
    expect(row?.monthly.every((value) => value === null)).toBe(true);
    expect(reading.missingCodes).toEqual(["5.2.04.01.03"]);

    // Regla (c): el grupo sigue sumando las ocho cuentas que SÍ están.
    expect(reading.groups[1].total).toBeCloseTo(164398.31 - 46071.48, 2);
    expect(reading.groups[1].monthly[0]).not.toBeNull();
  });

  it("un mes cargado en el que un concepto no movió nada es un cero de verdad", () => {
    const reading = readPersonnelYear(goldenYear(), SPAN);
    const row = reading.groups[1].rows.find(
      (entry) => entry.concept.id === "honorarios-farmacia-planta",
    );
    expect(row?.monthly[0]).toBe(0);
    expect(row?.missing).toBe(false);
    // …y por eso «Ocultar filas en cero» puede quitarla sin quitar una cuenta ausente.
    expect(row?.moves).toBe(false);
  });
});

describe("El tramo manda sobre el denominador", () => {
  it("acotar a un mes divide por las ventas de ESE mes", () => {
    const reading = readPersonnelYear(goldenYear(), [0]);
    expect(reading.revenue).toBeCloseTo(240314.07, 2);
    expect(reading.total).toBeCloseTo(104203.12, 2);
    expect(reading.share).toBeCloseTo((104203.12 / 240314.07) * 100, 4);
  });

  it("un año sin nada del tramo no está cubierto y no divide por cero", () => {
    const reading = readPersonnelYear(goldenYear(), [10, 11]);
    expect(reading.covered).toBe(false);
    expect(reading.total).toBe(0);
    expect(reading.share).toBeNull();
  });
});

describe("Varios años", () => {
  const previous = goldenYear({ year: 2025 });
  const reading = readPersonnelCost([goldenYear(), previous], SPAN);

  it("los devuelve ascendentes", () => {
    expect(reading.years.map((year) => year.year)).toEqual([2025, 2026]);
  });

  it("suma los tramos en vez de promediar porcentajes", () => {
    // Contra la lectura de UN año y no contra el libro: lo que se afirma aquí es que dos ejercicios
    // se SUMAN, y comparar con el número redondeado del Excel duplicaría también su centavo.
    const single = readPersonnelYear(goldenYear(), SPAN);
    expect(reading.total).toBeCloseTo(single.total * 2, 6);
    expect(reading.revenue).toBeCloseTo(single.revenue * 2, 6);
    // La proporción se mantiene porque el denominador creció con el numerador; lo que NO se hizo es
    // promediar dos «50.1 %», que con ventas distintas habría dado otro número.
    expect(reading.share).toBeCloseTo(50.1, 1);
  });

  it("las secciones suman a través de los años", () => {
    const planta = reading.sections.find((entry) => entry.section.id === "planta");
    expectToTheCent((planta?.total ?? 0) / 2, 396223.94, "planta por año");
  });
});

describe("Las dos primitivas", () => {
  it("`sumOf` ignora los `null` en vez de tratarlos como cero", () => {
    expect(sumOf([10, null, 5, null])).toBe(15);
    expect(sumOf([null, null])).toBe(0);
  });

  it("`shareOf` habla en puntos porcentuales y devuelve `null` sin denominador", () => {
    expect(shareOf(25, 100)).toBe(25);
    expect(shareOf(10, 0)).toBeNull();
  });
});

describe("El mapa", () => {
  it("lee veinte cuentas para veintiún conceptos: una es capturada", () => {
    expect(PERSONNEL_CONCEPTS).toHaveLength(21);
    expect(PERSONNEL_ACCOUNT_CODES).toHaveLength(20);
  });
});
