import { describe, expect, it } from "vitest";
import {
  byPayer,
  byService,
  loadedMonths,
  loadedYears,
  monthlySeries,
  monthlyServiceSeries,
  salesTotals,
} from "./derive";
import { UNIDENTIFIED_PAYER } from "./payer";
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

  it("cada pagador sale con el nombre del reporte, empresa o persona", () => {
    const payers = byPayer([
      line({ payer: "PEREZ LOPEZ ANA MARIA", amount: 10 }),
      line({ payer: "SALUDSA", amount: 90 }),
    ]);
    expect(payers.map((payer) => payer.label)).toEqual(["SALUDSA", "PEREZ LOPEZ ANA MARIA"]);
    expect(payers[0].amount).toBe(90);
  });

  it("las líneas sin pagador se agrupan en UNA sola fila", () => {
    const payers = byPayer([
      line({ payer: "", amount: 10 }),
      line({ payer: "SALUDSA", amount: 90 }),
      line({ payer: "   ", amount: 5 }),
    ]);
    expect(payers.map((payer) => payer.label)).toEqual(["SALUDSA", UNIDENTIFIED_PAYER]);
    expect(payers[1].amount).toBe(15);
    expect(payers[1].lineCount).toBe(2);
  });

  it("el grupo sin identificar compite por monto como cualquier otra fila", () => {
    const payers = byPayer([
      line({ payer: "", amount: 90 }),
      line({ payer: "SALUDSA", amount: 10 }),
    ]);

    expect(payers[0].label).toBe(UNIDENTIFIED_PAYER);
  });

  it("el nombre se conserva entero en el id, que es lo que lo hace trazable", () => {
    const payers = byPayer([line({ payer: "  SANDOVAL MORALES JUAN CARLOS  ", amount: 10 })]);
    expect(payers[0].id).toBe("SANDOVAL MORALES JUAN CARLOS");
    expect(payers[0].label).toBe("SANDOVAL MORALES JUAN CARLOS");
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

describe("monthlySeries acotado a servicios", () => {
  it("suma solo los códigos pedidos", () => {
    const months = [
      month(2026, 0, [
        line({ serviceCode: "\\01", amount: 100 }),
        line({ serviceCode: "\\02", amount: 30 }),
      ]),
    ];
    expect(monthlySeries(months, 2026, ["\\01"])[0].amount).toBe(100);
  });

  it("un mes cargado en el que ese servicio no vendió es CERO, no un hueco", () => {
    const months = [month(2026, 0, [line({ serviceCode: "\\02", amount: 30 })])];
    expect(monthlySeries(months, 2026, ["\\01"])[0].amount).toBe(0);
  });

  it("un mes que nunca llegó sigue siendo null aunque se acote", () => {
    const months = [month(2026, 0, [line({ serviceCode: "\\01", amount: 10 })])];
    expect(monthlySeries(months, 2026, ["\\01"])[1].amount).toBeNull();
  });

  it("una lista vacía de códigos es «todos», no «ninguno»", () => {
    const months = [month(2026, 0, [line({ amount: 40 })])];
    expect(monthlySeries(months, 2026, [])[0].amount).toBe(40);
  });
});

describe("monthlyServiceSeries", () => {
  const YEAR = [
    month(2026, 0, [
      line({ serviceCode: "\\01", serviceName: "HONORARIOS", amount: 100 }),
      line({ serviceCode: "\\02", serviceName: "MEDICINAS", amount: 30 }),
    ]),
    month(2026, 1, [line({ serviceCode: "\\01", serviceName: "HONORARIOS", amount: 50 })]),
  ];

  it("devuelve una serie por servicio, de mayor a menor en el año", () => {
    const series = monthlyServiceSeries(YEAR, 2026);
    expect(series.map((entry) => entry.code)).toEqual(["\\01", "\\02"]);
    expect(series[0].name).toBe("HONORARIOS");
  });

  it("cada serie lleva las doce columnas del ejercicio", () => {
    expect(monthlyServiceSeries(YEAR, 2026)[0].points).toHaveLength(12);
  });

  it("un mes que nunca llegó es null en TODOS los servicios", () => {
    const series = monthlyServiceSeries(YEAR, 2026);
    expect(series.every((entry) => entry.points[5].amount === null)).toBe(true);
  });

  it("un mes cargado en el que un servicio no vendió es un CERO de verdad", () => {
    const medicinas = monthlyServiceSeries(YEAR, 2026)[1];
    expect(medicinas.points[0].amount).toBe(30);
    expect(medicinas.points[1].amount).toBe(0);
  });

  it("acota a los códigos pedidos y conserva el orden por monto", () => {
    const series = monthlyServiceSeries(YEAR, 2026, ["\\02"]);
    expect(series.map((entry) => entry.code)).toEqual(["\\02"]);
  });

  it("un servicio que el año no trae no produce serie vacía", () => {
    expect(monthlyServiceSeries(YEAR, 2026, ["\\09"])).toEqual([]);
  });

  it("un año sin ningún mes cargado no tiene servicios que repartir", () => {
    expect(monthlyServiceSeries(YEAR, 2025)).toEqual([]);
  });
});
