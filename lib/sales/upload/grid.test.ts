import { describe, expect, it } from "vitest";
import {
  findDeclaredTotal,
  findSalesCompany,
  findSalesHeader,
  findSalesRange,
  hasSalesTitle,
  isPrintRow,
  readSalesRow,
  toSalesNumber,
} from "./grid";
import { foreignGrid, salesGrid } from "./parse.fixtures";

describe("toSalesNumber", () => {
  it("lee texto con separador de miles", () => {
    expect(toSalesNumber("107,231.22")).toBe(107231.22);
    expect(toSalesNumber("1,200,500.75")).toBe(1200500.75);
  });

  it("pasa un número finito tal cual", () => {
    expect(toSalesNumber(42.5)).toBe(42.5);
  });

  it("los paréntesis del contador son el signo negativo", () => {
    expect(toSalesNumber("(1,200.50)")).toBe(-1200.5);
  });

  it("aguanta el símbolo y los espacios", () => {
    expect(toSalesNumber(" $1,200.50 ")).toBe(1200.5);
  });

  it("null cuando la celda no es un número: es lo que separa un dato de un rótulo", () => {
    expect(toSalesNumber("NOMBRE")).toBeNull();
    expect(toSalesNumber(null)).toBeNull();
    expect(toSalesNumber("")).toBeNull();
  });

  it("null y NO cero para un texto ilegible: un NaN redondeado a 0 dejaría el mes entero en cero", () => {
    expect(toSalesNumber("—")).toBeNull();
  });
});

describe("hasSalesTitle", () => {
  it("encuentra el título dondequiera que el reporte lo escriba", () => {
    expect(hasSalesTitle(salesGrid())).toBe(true);
  });

  it("un balance no lo lleva", () => {
    expect(hasSalesTitle(foreignGrid())).toBe(false);
  });
});

describe("findSalesHeader", () => {
  it("localiza la fila por llevar los CUATRO rótulos a la vez", () => {
    expect(findSalesHeader(salesGrid())?.row).toBe(6);
  });

  it("una cabecera de solo CODIGO+NOMBRE no basta: es la de MicroPlus", () => {
    expect(findSalesHeader(foreignGrid())).toBeNull();
  });

  it("sus columnas NO son las de los datos: los rótulos van centrados sobre celdas combinadas", () => {
    // `CANTIDAD` se rotula en la 19 y las cantidades viven en la 18; `VENTA TOTAL` en la 25 y los
    // importes en la 24. Es por esto que la cabecera identifica el formato pero no localiza nada.
    const header = findSalesHeader(salesGrid());
    expect(header).toMatchObject({ quantityCol: 19, amountCol: 25 });
    expect(readSalesRow(salesGrid()[7])).toMatchObject({ amountCol: 24 });
  });
});

describe("findSalesRange", () => {
  it("lee Desde/Hasta escritos en celdas separadas del rótulo", () => {
    expect(findSalesRange(salesGrid())).toEqual({
      fromDay: 1,
      fromMonth: 3,
      fromYear: 2026,
      toDay: 30,
      toMonth: 3,
      toYear: 2026,
    });
  });

  it("lee también la fecha pegada al rótulo en la misma celda", () => {
    const grid = salesGrid();
    grid[4] = [null, "Desde: 01/04/2026", null, "Hasta: 30/04/2026"];
    expect(findSalesRange(grid)).toMatchObject({ fromDay: 1, toDay: 30 });
  });

  it("los dos rótulos pueden estar en filas distintas", () => {
    const grid = salesGrid();
    grid[4] = [null, "Desde:", "01/04/2026"];
    grid.splice(5, 0, [null, "Hasta:", "30/04/2026"]);
    expect(findSalesRange(grid)).toMatchObject({ fromMonth: 3, toDay: 30 });
  });

  it("null si falta cualquiera de los dos", () => {
    const grid = salesGrid();
    grid[4] = [null, "Desde:", "01/04/2026"];
    expect(findSalesRange(grid)).toBeNull();
  });
});

describe("readSalesRow", () => {
  const grid = salesGrid();

  it("lee las cinco celdas de una línea por posición RELATIVA al código", () => {
    expect(readSalesRow(grid[7])).toEqual({
      serviceCode: "\\01",
      serviceName: "HONORARIOS",
      payer: "ASEGURADORA UNO S.A.",
      quantity: 1,
      amount: 1200.5,
      amountCol: 24,
    });
  });

  it("null para el preámbulo, la cabecera y las filas de cierre", () => {
    expect(readSalesRow(grid[0])).toBeNull();
    expect(readSalesRow(grid[6])).toBeNull();
    expect(readSalesRow(grid[12])).toBeNull();
    expect(readSalesRow(grid[13])).toBeNull();
  });

  it("null cuando faltan celdas: una fila incompleta no es media línea", () => {
    expect(readSalesRow([null, "\\01", "HONORARIOS", "UN PAGADOR"])).toBeNull();
  });

  it("null cuando las dos últimas no son números, para que un rótulo no pase por línea", () => {
    expect(
      readSalesRow([null, "\\01", "HONORARIOS", "UN PAGADOR", "CANTIDAD", "VENTA"]),
    ).toBeNull();
  });

  it("un pie de página se reconoce por su rótulo", () => {
    expect(isPrintRow(grid[0])).toBe(true);
    expect(isPrintRow(grid[7])).toBe(false);
  });
});

describe("findDeclaredTotal", () => {
  it("lee el cierre en la columna del IMPORTE, que es lo único que lo identifica", () => {
    // Esa fila no lleva rótulo; la de arriba dice `TOTAL ITEMS` y cuenta LÍNEAS, no dólares.
    expect(findDeclaredTotal(salesGrid(), 12, 24)).toBe(1900);
  });

  it("null cuando el reporte no escribe ninguna fila de cierre", () => {
    expect(findDeclaredTotal(salesGrid().slice(0, 12), 12, 24)).toBeNull();
  });
});

describe("findSalesCompany", () => {
  it("devuelve la razón social y se salta el título del reporte", () => {
    const grid = salesGrid();
    expect(findSalesCompany(grid, 4)).toBe("CLINICA DE PRUEBA S.A.");
  });

  it("no devuelve un rótulo de impresión ni una fecha", () => {
    const grid = salesGrid();
    grid[0] = [null, null, null, null, null, null, "Pagina:", 1];
    grid[1] = [null, "Venta de Servicios por FACTURA", null, null];
    grid[2] = [null, "Fecha:", "05/05/2026", null];
    grid[3] = [null, "CLINICA DE PRUEBA S.A.", null, null];
    expect(findSalesCompany(grid, 4)).toBe("CLINICA DE PRUEBA S.A.");
  });
});
