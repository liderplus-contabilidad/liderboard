import { describe, expect, it } from "vitest";
import {
  byPayer,
  byService,
  loadedMonths,
  loadedYears,
  monthlySeries,
  salesTotals,
} from "./derive";
import type { SalesLine, SalesMonth } from "./types";

function line(overrides: Partial<SalesLine>): SalesLine {
  return {
    serviceCode: "\\01",
    serviceName: "HONORARIOS",
    payer: "SALUDSA",
    quantity: 1,
    amount: 100,
    ...overrides,
  };
}

function month(year: number, monthIndex: number, lines: SalesLine[]): SalesMonth {
  return {
    id: `c1:${year}-${monthIndex}`,
    clientId: "c1",
    year,
    monthIndex,
    companyName: "HOSPITAL GENERAL PRIVADO DURAN",
    lines,
    declaredTotal: null,
    warnings: [],
  };
}

describe("salesTotals", () => {
  it("suma la venta, cuenta líneas y pagadores distintos", () => {
    const totals = salesTotals([
      line({ payer: "SALUDSA", amount: 100 }),
      line({ payer: "SALUDSA", amount: 50 }),
      line({ payer: "CONFIAMED", amount: 25 }),
    ]);
    expect(totals.amount).toBe(175);
    expect(totals.lineCount).toBe(3);
    expect(totals.payerCount).toBe(2);
  });

  it("el ticket promedio es la venta entre las líneas", () => {
    expect(salesTotals([line({ amount: 100 }), line({ amount: 50 })]).averageTicket).toBe(75);
  });

  it("sin líneas el ticket es null y no 0: dividir por cero no da cero", () => {
    const totals = salesTotals([]);
    expect(totals.averageTicket).toBeNull();
    expect(totals.amount).toBe(0);
  });

  it("un mismo pagador escrito con espacios de más es UNO", () => {
    const totals = salesTotals([line({ payer: "SALUDSA" }), line({ payer: "  SALUDSA  " })]);
    expect(totals.payerCount).toBe(1);
  });
});

describe("byService", () => {
  it("agrega por código y ordena de mayor a menor", () => {
    const services = byService([
      line({ serviceCode: "\\02", serviceName: "MEDICINAS", amount: 30 }),
      line({ serviceCode: "\\01", serviceName: "HONORARIOS", amount: 40 }),
      line({ serviceCode: "\\01", serviceName: "HONORARIOS", amount: 60 }),
    ]);
    expect(services.map((service) => service.code)).toEqual(["\\01", "\\02"]);
    expect(services[0].amount).toBe(100);
  });

  it("suma también las cantidades", () => {
    const services = byService([line({ quantity: 2 }), line({ quantity: 3 })]);
    expect(services[0].quantity).toBe(5);
  });

  it("conserva el código verbatim del reporte", () => {
    expect(byService([line({ serviceCode: "\\05" })])[0].code).toBe("\\05");
  });
});

describe("byPayer", () => {
  it("agrega por pagador y ordena de mayor a menor", () => {
    const payers = byPayer([
      line({ payer: "CONFIAMED", amount: 10 }),
      line({ payer: "SALUDSA", amount: 40 }),
      line({ payer: "SALUDSA", amount: 5 }),
    ]);
    expect(payers.map((payer) => payer.label)).toEqual(["SALUDSA", "CONFIAMED"]);
    expect(payers[0].amount).toBe(45);
    expect(payers[0].lineCount).toBe(2);
  });

  it("el ordinal de un particular sigue al MONTO, no al orden del archivo", () => {
    const payers = byPayer([
      line({ payer: "PEREZ LOPEZ ANA MARIA", amount: 10 }),
      line({ payer: "SANDOVAL MORALES JUAN CARLOS", amount: 90 }),
    ]);
    expect(payers[0].label).toBe("Particular · 1");
    expect(payers[0].amount).toBe(90);
    expect(payers[1].label).toBe("Particular · 2");
  });

  it("el ordinal cuenta solo entre particulares, sin saltar por las empresas", () => {
    const payers = byPayer([
      line({ payer: "SALUDSA", amount: 100 }),
      line({ payer: "PEREZ LOPEZ ANA MARIA", amount: 90 }),
      line({ payer: "CONFIAMED", amount: 80 }),
      line({ payer: "SANDOVAL MORALES JUAN CARLOS", amount: 70 }),
    ]);
    expect(payers.map((payer) => payer.label)).toEqual([
      "SALUDSA",
      "Particular · 1",
      "CONFIAMED",
      "Particular · 2",
    ]);
  });

  it("ninguna etiqueta de particular deja escapar el nombre", () => {
    const payers = byPayer([line({ payer: "SANDOVAL MORALES JUAN CARLOS", amount: 10 })]);
    expect(payers[0].label).not.toContain("SANDOVAL");
    // …pero el nombre SIGUE guardado, que es lo que mantiene la cifra trazable.
    expect(payers[0].id).toBe("SANDOVAL MORALES JUAN CARLOS");
  });
});

describe("monthlySeries", () => {
  it("son siempre doce columnas, cargadas o no", () => {
    expect(monthlySeries([month(2026, 3, [line({ amount: 10 })])], 2026)).toHaveLength(12);
  });

  it("un mes que nunca llegó es null y NO cero", () => {
    const points = monthlySeries([month(2026, 3, [line({ amount: 10 })])], 2026);
    expect(points[3].amount).toBe(10);
    expect(points[0].amount).toBeNull();
    expect(points[11].amount).toBeNull();
  });

  it("un mes cargado que no vendió nada SÍ es cero", () => {
    const points = monthlySeries([month(2026, 0, [])], 2026);
    expect(points[0].amount).toBe(0);
  });

  it("un mes de otro año no entra en el eje", () => {
    const points = monthlySeries([month(2025, 3, [line({ amount: 10 })])], 2026);
    expect(points.every((point) => point.amount === null)).toBe(true);
  });
});

describe("cobertura", () => {
  it("loadedYears devuelve los años ascendentes y sin repetir", () => {
    const months = [month(2026, 0, []), month(2025, 5, []), month(2026, 3, [])];
    expect(loadedYears(months)).toEqual([2025, 2026]);
  });

  it("loadedMonths devuelve los meses de su año, ascendentes", () => {
    const months = [month(2026, 3, []), month(2026, 0, []), month(2025, 11, [])];
    expect(loadedMonths(months, 2026)).toEqual([0, 3]);
  });
});
