import { describe, expect, it } from "vitest";
import type { AmountEntry } from "../analytics/structure";
import {
  BREAKDOWN_MAX_ROWS,
  buildAccountBreakdown,
  describeAccountBreakdown,
} from "./account-breakdown";

/**
 * Las siete hijas de `5.3.03.01 HONORARIOS MEDICOS`, el rubro con el que nació esta lectura. Los
 * montos son los del archivo generado, así que la suma es el monto que la barra del anexo enseña.
 */
const HONORARIOS: AmountEntry[] = [
  { code: "5.3.03.01.01", label: "Honorarios Medicos-Externos", value: 358_500 },
  { code: "5.3.03.01.02", label: "Honorarios de Imagenologia-Externos", value: 89_600 },
  { code: "5.3.03.01.03", label: "Honorarios Enfermeria-Externos", value: 81_900 },
  { code: "5.3.03.01.04", label: "Honorarios Profesionales Laboratorio-Externos", value: 66_500 },
  { code: "5.3.03.01.05", label: "Honorarios Fisioterapia-Externos", value: 33_300 },
  { code: "5.3.03.01.06", label: "Honorarios Prof. Farmacia-Bioquímico-Externos", value: 35_800 },
  { code: "5.3.03.01.07", label: "Honorarios Profesionales Otros-Externos", value: 35_800 },
];
const TOTAL = HONORARIOS.reduce((sum, entry) => sum + entry.value, 0);
const SIN_HIJAS = { total: TOTAL, hasChildren: () => false };

describe("el desglose de una cuenta", () => {
  it("ordena de mayor a menor y reparte el 100 % del padre", () => {
    const { rows } = buildAccountBreakdown(HONORARIOS, SIN_HIJAS);

    expect(rows[0].code).toBe("5.3.03.01.01");
    expect(rows[0].share).toBeCloseTo((358_500 / TOTAL) * 100, 6);
    expect(rows.reduce((sum, row) => sum + (row.share ?? 0), 0)).toBeCloseTo(100, 6);
  });

  it("las hijas suman el padre, que es lo que ata el desglose a la barra que lo abrió", () => {
    expect(buildAccountBreakdown(HONORARIOS, SIN_HIJAS).balances).toBe(true);
  });

  it("y lo DICE cuando no cuadra, en vez de dejar dos cifras que no cierran", () => {
    const breakdown = buildAccountBreakdown(HONORARIOS, { ...SIN_HIJAS, total: TOTAL + 1_000 });

    expect(breakdown.balances).toBe(false);
    expect(
      describeAccountBreakdown(breakdown, { label: "HONORARIOS MEDICOS", format: String }),
    ).toContain("la diferencia son -1000");
  });

  it("las cuentas paradas se van y se cuentan; las negativas se quedan", () => {
    const breakdown = buildAccountBreakdown(
      [
        ...HONORARIOS,
        { code: "5.3.03.01.08", label: "Declarada y sin movimiento", value: 0 },
        { code: "5.3.03.01.09", label: "Una nota de crédito", value: -500 },
      ],
      { ...SIN_HIJAS, total: TOTAL - 500 },
    );

    expect(breakdown.idle).toBe(1);
    expect(breakdown.all.map((row) => row.code)).toContain("5.3.03.01.09");
    // Al final del reparto, que es donde un valor negativo cae al ordenar por valor con signo.
    expect(breakdown.all.at(-1)?.code).toBe("5.3.03.01.09");
    expect(breakdown.balances).toBe(true);
  });

  it("un total sin base no inventa porcentajes", () => {
    for (const total of [null, 0]) {
      const { rows } = buildAccountBreakdown(HONORARIOS, { ...SIN_HIJAS, total });

      expect(rows.every((row) => row.share === null)).toBe(true);
    }
  });

  it("dice qué filas se pueden abrir, y eso lo decide el ÁRBOL y no la forma del código", () => {
    const breakdown = buildAccountBreakdown(HONORARIOS, {
      total: TOTAL,
      hasChildren: (code) => code === "5.3.03.01.02",
    });

    expect(breakdown.all.find((row) => row.code === "5.3.03.01.02")?.hasChildren).toBe(true);
    expect(breakdown.all.find((row) => row.code === "5.3.03.01.01")?.hasChildren).toBe(false);
  });

  it("corta el DIBUJO y no la tabla, y la nota dice dónde están las demás", () => {
    // Una rama ancha de verdad: `5.5.01.02` cuelga veintisiete secciones.
    const anchas: AmountEntry[] = Array.from({ length: 27 }, (_, index) => ({
      code: `5.5.01.02.${String(index + 1).padStart(2, "0")}`,
      label: `Sección ${index + 1}`,
      value: (27 - index) * 100,
    }));
    const breakdown = buildAccountBreakdown(anchas, {
      total: anchas.reduce((sum, entry) => sum + entry.value, 0),
      hasChildren: () => true,
    });

    expect(breakdown.rows).toHaveLength(BREAKDOWN_MAX_ROWS);
    expect(breakdown.all).toHaveLength(27);
    expect(breakdown.hidden).toBe(27 - BREAKDOWN_MAX_ROWS);
    expect(
      describeAccountBreakdown(breakdown, { label: "HONORARIOS MEDICOS", format: String }),
    ).toContain("la tabla lista las 27");
  });

  it("la nota SIEMPRE dice contra qué se mide el porcentaje, con su cifra", () => {
    const nota = describeAccountBreakdown(buildAccountBreakdown(HONORARIOS, SIN_HIJAS), {
      label: "HONORARIOS MEDICOS",
      format: (value) => `$${value}`,
    });

    expect(nota).toBe(
      `Los porcentajes son la parte de HONORARIOS MEDICOS ($${TOTAL}) que representa cada cuenta.`,
    );
  });
});
