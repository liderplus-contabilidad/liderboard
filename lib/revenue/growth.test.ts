import { describe, expect, it } from "vitest";
import { scopeToMonths } from "./derive";
import { ALL_MONTHS, REVENUE_2022, REVENUE_2023, REVENUE_2024, REVENUE_2026 } from "./fixtures";
import { growthAgainst, growthAgainstAll, percentChange } from "./growth";

const cents = (value: number) => Math.round(value * 100) / 100;
const points = (value: number) => Math.round(value * 10) / 10;

describe("growthAgainst", () => {
  it("mide 2026 contra 2024 sobre el tramo que los dos comparten", () => {
    const growth = growthAgainst(REVENUE_2026, REVENUE_2024, 2024);

    // 2026 llega hasta julio, así que el tramo es Ene–Jul y NO los doce meses de 2024.
    expect(growth.sharedMonths).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(cents(growth.referenceTotal)).toBe(1683720.41);
    expect(cents(growth.baseTotal)).toBe(977531.15);
    expect(cents(growth.total.delta as number)).toBe(706189.26);
    expect(points(growth.total.percent as number)).toBe(72.2);
  });

  it("NO compara siete meses contra los doce del año base", () => {
    const growth = growthAgainst(REVENUE_2026, REVENUE_2024, 2024);

    // Lo que hace la fila TOTAL del Excel: 1,683,720.41 contra 1,915,467.90 = +19 %.
    expect(cents(growth.baseTotal)).not.toBe(1915467.9);
    expect(points(growth.total.percent as number)).not.toBe(-12.1);
  });

  it("mide contra cada año base marcado", () => {
    const all = growthAgainstAll(REVENUE_2026, [
      { year: 2024, monthly: REVENUE_2024 },
      { year: 2022, monthly: REVENUE_2022 },
      { year: 2023, monthly: REVENUE_2023 },
    ]);

    // Ordenadas por año base, con independencia de cómo llegaron.
    expect(all.map((entry) => entry.baseYear)).toEqual([2022, 2023, 2024]);
    expect(cents(all[0].total.delta as number)).toBe(804403.39);
    expect(points(all[0].total.percent as number)).toBe(91.5);
    expect(cents(all[1].total.delta as number)).toBe(729309.1);
    expect(points(all[1].total.percent as number)).toBe(76.4);
    expect(cents(all[2].total.delta as number)).toBe(706189.26);
    expect(points(all[2].total.percent as number)).toBe(72.2);
  });

  it("el mes marcado acota los dos años a la vez", () => {
    const span = [0, 1, 2];
    const growth = growthAgainst(
      scopeToMonths(REVENUE_2026, span),
      scopeToMonths(REVENUE_2024, span),
      2024,
    );

    expect(growth.sharedMonths).toEqual(span);
    // Ene–Mar: 692,433.66 contra 396,620.68.
    expect(cents(growth.referenceTotal)).toBe(692433.66);
    expect(cents(growth.baseTotal)).toBe(396620.68);
    expect(cents(growth.total.delta as number)).toBe(295812.98);
  });

  it("una caída sale negativa", () => {
    // Enero de 2023 (130,156.71) contra enero de 2022 (165,445.19): el año más reciente vendió menos.
    const growth = growthAgainst(
      scopeToMonths(REVENUE_2023, [0]),
      scopeToMonths(REVENUE_2022, [0]),
      2022,
    );

    expect(cents(growth.total.delta as number)).toBe(-35288.48);
    expect(points(growth.total.percent as number)).toBe(-21.3);
    expect(growth.total.delta as number).toBeLessThan(0);
  });

  it("un mes que solo tiene uno de los dos años no entra en ninguno de los totales", () => {
    const growth = growthAgainst(REVENUE_2026, REVENUE_2024, 2024);

    // Agosto: 2024 lo tiene, 2026 no. Ni suma ni resta.
    expect(growth.points[7].delta).toBeNull();
    expect(growth.points[7].percent).toBeNull();
    expect(growth.sharedMonths).not.toContain(7);
  });

  it("sin ningún mes compartido no hay crecimiento que declarar", () => {
    const growth = growthAgainst(
      scopeToMonths(REVENUE_2026, [11]),
      scopeToMonths(REVENUE_2024, [11]),
      2024,
    );

    expect(growth.sharedMonths).toEqual([]);
    expect(growth.total.delta).toBeNull();
    expect(growth.total.percent).toBeNull();
  });

  it("el crecimiento mes a mes reproduce el del Excel donde el Excel acierta", () => {
    const growth = growthAgainst(REVENUE_2026, REVENUE_2022, 2022);

    // La matriz mensual de la hoja «COMPARATIVO VENTAS 2022-2025» sí compara mes contra mes.
    expect(cents(growth.points[0].delta as number)).toBe(81607.92);
    expect(points(growth.points[0].percent as number)).toBe(49.3);
    expect(cents(growth.points[3].delta as number)).toBe(187305.42);
    expect(points(growth.points[3].percent as number)).toBe(125.0);
  });
});

describe("percentChange", () => {
  it("una base en cero no es un crecimiento infinito, es indefinido", () => {
    expect(percentChange(100, 0)).toBeNull();
  });

  it("un término ausente no se lee como cero", () => {
    expect(percentChange(100, null)).toBeNull();
    expect(percentChange(null, 100)).toBeNull();
  });

  it("devuelve puntos y no una fracción", () => {
    expect(percentChange(150, 100)).toBe(50);
  });
});

describe("el tramo completo", () => {
  it("con los cuatro años marcados y sin mes marcado el tramo sigue siendo Ene–Jul", () => {
    const reference = scopeToMonths(REVENUE_2026, ALL_MONTHS);
    const growth = growthAgainst(reference, scopeToMonths(REVENUE_2024, ALL_MONTHS), 2024);

    expect(growth.sharedMonths).toHaveLength(7);
    expect(points(growth.total.percent as number)).toBe(72.2);
  });
});
