import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  coverageForClient,
  db,
  deleteMonth,
  deleteSalesForClient,
  monthsForClientYears,
  saveMonths,
} from "./db";
import type { ParsedSalesMonth, SalesLine } from "./types";

function line(overrides: Partial<SalesLine> = {}): SalesLine {
  return {
    seguro: "PARTICULAR",
    tipo: "MEDICINAS",
    articleCode: "000156",
    articleName: "CLARITROMICINA",
    vendor: "",
    amount: 10,
    ...overrides,
  };
}

function month(
  year: number,
  monthIndex: number,
  lines: SalesLine[],
  overrides: Partial<ParsedSalesMonth> = {},
): ParsedSalesMonth {
  return {
    year,
    monthIndex,
    lineCount: lines.length,
    firstDay: 1,
    lastDay: 28,
    companyCode: "01",
    lines,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.months.clear();
  await db.coverage.clear();
});

describe("saveMonths", () => {
  it("escribe las líneas y la cobertura, estampando el cliente que está abierto", async () => {
    await saveMonths("cli-1", [month(2026, 2, [line(), line({ amount: 5 })])]);
    expect(await monthsForClientYears("cli-1", [2026])).toEqual([
      {
        id: "cli-1:2026-03",
        clientId: "cli-1",
        year: 2026,
        monthIndex: 2,
        lines: [line(), line({ amount: 5 })],
      },
    ]);
    expect(await coverageForClient("cli-1")).toEqual([
      {
        id: "cli-1:2026-03",
        clientId: "cli-1",
        year: 2026,
        monthIndex: 2,
        lineCount: 2,
        firstDay: 1,
        lastDay: 28,
        companyCode: "01",
      },
    ]);
  });

  it("recargar un mes lo reemplaza COMPLETO, no lo fusiona", async () => {
    await saveMonths("cli-1", [month(2026, 2, [line(), line(), line()])]);
    await saveMonths("cli-1", [month(2026, 2, [line({ amount: 99 })])]);
    const months = await monthsForClientYears("cli-1", [2026]);
    expect(months).toHaveLength(1);
    expect(months[0].lines).toEqual([line({ amount: 99 })]);
    expect((await coverageForClient("cli-1"))[0].lineCount).toBe(1);
  });

  it("los meses que el archivo NO toca quedan como estaban", async () => {
    await saveMonths("cli-1", [month(2026, 0, [line()]), month(2026, 1, [line()])]);
    await saveMonths("cli-1", [month(2026, 1, [line({ amount: 77 })])]);
    const months = await monthsForClientYears("cli-1", [2026]);
    const enero = months.find((m) => m.monthIndex === 0);
    expect(enero?.lines).toEqual([line()]);
  });
});

describe("la partición por cliente", () => {
  it("no devuelve nunca los meses de otro cliente", async () => {
    await saveMonths("cli-1", [month(2026, 2, [line({ seguro: "UNO" })])]);
    await saveMonths("cli-2", [month(2026, 2, [line({ seguro: "DOS" })])]);
    const months = await monthsForClientYears("cli-1", [2026]);
    expect(months).toHaveLength(1);
    expect(months[0].lines[0].seguro).toBe("UNO");
  });

  it("sin cliente no lee nada", async () => {
    await saveMonths("cli-1", [month(2026, 2, [line()])]);
    expect(await monthsForClientYears(null, [2026])).toEqual([]);
    expect(await coverageForClient(null)).toEqual([]);
  });
});

describe("monthsForClientYears", () => {
  it("lee SOLO los años pedidos — medio millón de líneas no se deserializan para dibujar uno", async () => {
    await saveMonths("cli-1", [
      month(2024, 0, [line()]),
      month(2025, 0, [line()]),
      month(2026, 0, [line()]),
    ]);
    const months = await monthsForClientYears("cli-1", [2026]);
    expect(months.map((m) => m.year)).toEqual([2026]);
  });

  it("sin años pedidos lee NADA, que es lo contrario de leer todo", async () => {
    await saveMonths("cli-1", [month(2026, 0, [line()])]);
    expect(await monthsForClientYears("cli-1", [])).toEqual([]);
  });
});

describe("borrados", () => {
  it("borrar un mes se lleva sus líneas y su cobertura", async () => {
    await saveMonths("cli-1", [month(2026, 2, [line()]), month(2026, 3, [line()])]);
    await deleteMonth("cli-1", 2026, 2);
    expect(await monthsForClientYears("cli-1", [2026])).toHaveLength(1);
    expect(await coverageForClient("cli-1")).toHaveLength(1);
  });

  it("la cascada al borrar un cliente no deja partición huérfana", async () => {
    await saveMonths("cli-1", [month(2026, 2, [line()])]);
    await saveMonths("cli-2", [month(2026, 2, [line()])]);
    await deleteSalesForClient("cli-1");
    expect(await coverageForClient("cli-1")).toEqual([]);
    expect(await monthsForClientYears("cli-1", [2026])).toEqual([]);
    // Y no se lleva por delante al otro cliente.
    expect(await coverageForClient("cli-2")).toHaveLength(1);
  });
});
