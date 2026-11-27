import { describe, expect, it } from "vitest";
import type { Cell } from "@/lib/excel/workbook";
import {
  findSalesHeader,
  missingSalesLabels,
  readSalesRow,
  salesText,
  toSalesDate,
  toSalesNumber,
} from "./grid";

/** The report's own header, in its own order. */
const HEADER: Cell[] = [
  "COD. EMPRESA",
  "FECHA",
  "HORA",
  "OI",
  "PACIENTE",
  "SEGURO",
  "REFERIDOS",
  "COD. ARTICULO",
  "NOMBRE DEL ARTICULO",
  "TIPO DE SERVICIO.",
  "CANTIDAD",
  "PRECIO UNITARIO",
  "% DESCUENTO",
  "codrefer",
  "NETO",
  "VENDEDOR",
  "# FACTURA 1",
  "# FACTURA 2",
];

const LINE: Cell[] = [
  "01",
  "2024-01-31 00:00:00.000",
  0.33,
  "OI0134627",
  "QUINAPANTA ROSERO LUIS ALEJANDRO",
  "MEDICOS",
  "Personal",
  "EQP176",
  "ELECTROBISTURI MONOPOLAR / BIPOLAR  ",
  "EQUIPOS",
  1,
  "2.0000",
  "0.0000",
  7,
  "2.0000",
  "",
  "A00001250",
  "S/F",
];

describe("findSalesHeader", () => {
  it("encuentra la cabecera del reporte y sus siete columnas obligatorias", () => {
    const header = findSalesHeader([HEADER, LINE]);
    expect(header).not.toBeNull();
    expect(header).toMatchObject({
      row: 0,
      dateCol: 1,
      insurerCol: 5,
      codeCol: 7,
      nameCol: 8,
      typeCol: 9,
      amountCol: 14,
      vendorCol: 15,
      companyCol: 0,
    });
  });

  it("la encuentra aunque NO esté en la primera fila — es lo que permite que vuelva a entrar el Excel que el módulo exporta, que lleva membrete encima", () => {
    const grid = [["LiderPlus"], ["Ventas por servicio"], [], HEADER, LINE];
    expect(findSalesHeader(grid)?.row).toBe(3);
  });

  it("la encuentra con las columnas en otro orden", () => {
    const shuffled: Cell[] = [
      "NETO",
      "VENDEDOR",
      "FECHA",
      "NOMBRE DEL ARTICULO",
      "COD. ARTICULO",
      "TIPO DE SERVICIO.",
      "SEGURO",
    ];
    expect(findSalesHeader([shuffled])).toMatchObject({
      amountCol: 0,
      vendorCol: 1,
      dateCol: 2,
      nameCol: 3,
      codeCol: 4,
      typeCol: 5,
      insurerCol: 6,
    });
  });

  it("acepta «TIPO DE SERVICIO» con y sin el punto que escribe el sistema", () => {
    const withoutDot = HEADER.map((cell) =>
      cell === "TIPO DE SERVICIO." ? "TIPO DE SERVICIO" : cell,
    );
    expect(findSalesHeader([withoutDot])).not.toBeNull();
  });

  it("ignora acentos, mayúsculas y espacios dobles de las etiquetas", () => {
    const messy = HEADER.map((cell) =>
      cell === "NOMBRE DEL ARTICULO" ? "  nombre  del   artículo " : cell,
    );
    expect(findSalesHeader([messy])).not.toBeNull();
  });

  it("las once columnas que el módulo no lee son OPCIONALES: sin ellas la cabecera vale igual", () => {
    const minimal: Cell[] = [
      "FECHA",
      "SEGURO",
      "TIPO DE SERVICIO.",
      "COD. ARTICULO",
      "NOMBRE DEL ARTICULO",
      "NETO",
      "VENDEDOR",
    ];
    const header = findSalesHeader([minimal]);
    expect(header).not.toBeNull();
    // Sin `COD. EMPRESA` simplemente no hay código de empresa que adoptar.
    expect(header?.companyCol).toBe(-1);
  });

  it("null cuando falta una obligatoria", () => {
    const withoutNeto = HEADER.filter((cell) => cell !== "NETO");
    expect(findSalesHeader([withoutNeto])).toBeNull();
  });

  it("null sobre el reporte del formato viejo", () => {
    const old: Cell[][] = [
      ["VENTA DE SERVICIOS POR FACTURA"],
      ["Desde:", "01/04/2026", "Hasta:", "30/04/2026"],
      ["CODIGO", "NOMBRE", "CANTIDAD", "VENTA TOTAL"],
    ];
    expect(findSalesHeader(old)).toBeNull();
  });
});

describe("missingSalesLabels", () => {
  it("nombra solo las que faltaron, no las dieciocho", () => {
    const withoutNeto = HEADER.filter((cell) => cell !== "NETO");
    expect(missingSalesLabels([withoutNeto])).toEqual(["NETO"]);
  });

  it("sobre un libro ajeno nombra las siete", () => {
    expect(missingSalesLabels([["Hoja en blanco"], [1, 2, 3]])).toHaveLength(7);
  });
});

describe("salesText", () => {
  it("recorta el espacio final — 130.693 nombres del archivo real lo traen", () => {
    expect(salesText("ELECTROBISTURI MONOPOLAR / BIPOLAR  ")).toBe(
      "ELECTROBISTURI MONOPOLAR / BIPOLAR",
    );
    expect(salesText("BMI DEL ECUADOR ")).toBe(salesText("BMI DEL ECUADOR"));
  });

  it("colapsa los espacios internos que el sistema concatena", () => {
    expect(salesText("AGUJA VACUTAINER   AGUJA TOMA MULTIPLE")).toBe(
      "AGUJA VACUTAINER AGUJA TOMA MULTIPLE",
    );
  });

  it("NO toca el truncamiento del vendedor: es lo que el contador verifica contra su archivo", () => {
    expect(salesText("CASTELLANOS LOPEZ RAUL FABRICI")).toBe("CASTELLANOS LOPEZ RAUL FABRICI");
  });
});

describe("toSalesNumber", () => {
  it("lee el separador de miles sin devolver NaN", () => {
    expect(toSalesNumber("107,231.22")).toBeCloseTo(107231.22, 2);
  });

  it("los paréntesis del contador son el signo negativo", () => {
    expect(toSalesNumber("(45.00)")).toBe(-45);
  });

  it("RECHAZA la convención invertida en vez de leerla mil veces más pequeña o más grande", () => {
    // «17.338,85» con un `Number` tras quitar comas daría 17,33885; «12,5» daría 125.
    expect(toSalesNumber("17.338,85")).toBeNull();
    expect(toSalesNumber("12,5")).toBeNull();
    expect(toSalesNumber("1234,56")).toBeNull();
  });

  it("lee el texto con cuatro decimales que escribe el sistema, y el signo", () => {
    expect(toSalesNumber("2.0000")).toBe(2);
    expect(toSalesNumber("-45.5000")).toBe(-45.5);
    expect(toSalesNumber("$1,234.56")).toBeCloseTo(1234.56, 2);
  });

  it("lee un importe menor que uno escrito SIN el cero inicial — 82.762 filas del archivo real", () => {
    expect(toSalesNumber(".4000")).toBe(0.4);
    expect(toSalesNumber("-.7500")).toBe(-0.75);
  });

  it("null cuando la celda no es un número", () => {
    expect(toSalesNumber("PARTICULAR")).toBeNull();
    expect(toSalesNumber(null)).toBeNull();
  });

  it("cero es cero y no null — 29,5 % de las filas del archivo real están en $0", () => {
    expect(toSalesNumber("0.0000")).toBe(0);
  });
});

describe("toSalesDate", () => {
  it("lee el texto que escribe el sistema contable", () => {
    expect(toSalesDate("2026-03-15 00:00:00.000")).toEqual({ year: 2026, monthIndex: 2, day: 15 });
  });

  it("lee también una fecha sin hora, que es lo que deja una celda de fecha real", () => {
    expect(toSalesDate("2026-03-01")).toEqual({ year: 2026, monthIndex: 2, day: 1 });
  });

  it("lee la forma dd/mm/aaaa", () => {
    expect(toSalesDate("15/03/2026")).toEqual({ year: 2026, monthIndex: 2, day: 15 });
  });

  it("null cuando no hay fecha legible", () => {
    expect(toSalesDate("")).toBeNull();
    expect(toSalesDate("sin fecha")).toBeNull();
    expect(toSalesDate(null)).toBeNull();
  });
});

describe("readSalesRow", () => {
  const header = findSalesHeader([HEADER])!;

  it("lee la línea completa y descarta todo lo que no se guarda", () => {
    expect(readSalesRow(LINE, header)).toEqual({
      year: 2024,
      monthIndex: 0,
      day: 31,
      seguro: "MEDICOS",
      tipo: "EQUIPOS",
      articleCode: "EQP176",
      articleName: "ELECTROBISTURI MONOPOLAR / BIPOLAR",
      vendor: "",
      amount: 2,
      companyCode: "01",
    });
  });

  it("null en una fila que no es una línea — incluida una cabecera repetida, que trae texto en NOMBRE DEL ARTICULO pero ni importe ni fecha", () => {
    expect(readSalesRow([], header)).toBeNull();
    expect(readSalesRow(HEADER, header)).toBeNull();
  });

  it("una línea SIN fecha legible no es null: se marca para contarla y declararla", () => {
    const undated = [...LINE];
    undated[1] = "";
    expect(readSalesRow(undated, header)).toEqual({ undated: true });
  });

  it("un NETO escrito pero ilegible NO se lee como cero: se marca para declararlo", () => {
    const bad = [...LINE];
    bad[14] = "12,5";
    expect(readSalesRow(bad, header)).toEqual({ unreadable: true });
  });

  it("una línea con fecha pero sin importe vale cero, y una sin ninguno de los dos no es línea", () => {
    const noAmount = [...LINE];
    noAmount[14] = null;
    expect(readSalesRow(noAmount, header)).toMatchObject({ amount: 0, day: 31 });
    const neither = [...LINE];
    neither[1] = "";
    neither[14] = null;
    expect(readSalesRow(neither, header)).toBeNull();
  });

  it("sin columna de empresa, el código queda vacío en vez de romper la lectura", () => {
    const minimal: Cell[] = [
      "FECHA",
      "SEGURO",
      "TIPO DE SERVICIO.",
      "COD. ARTICULO",
      "NOMBRE DEL ARTICULO",
      "NETO",
      "VENDEDOR",
    ];
    const slim = findSalesHeader([minimal])!;
    const row: Cell[] = ["2026-03-01", "PARTICULAR", "MEDICINAS", "001", "PARACETAMOL", "3.5", ""];
    expect(readSalesRow(row, slim)).toMatchObject({ companyCode: "", amount: 3.5 });
  });
});
