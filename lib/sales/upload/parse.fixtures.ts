/**
 * The SHAPE of the flat sales report, with INVENTED figures and names: the eighteen-label header,
 * one row per invoice line, `FECHA` and `NETO` as text, lines of several months in one file,
 * trailing spaces on the names and `VENDEDOR` mostly empty. No real datum is transcribed — a
 * versioned test is no place for a patient's name.
 */
import * as XLSX from "xlsx";
import type { Cell } from "@/lib/excel/workbook";

/** The report's own header, in its own order. */
export const FLAT_HEADER: Cell[] = [
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

export interface FixtureLine {
  date: string;
  seguro: string;
  code: string;
  /** Written with the trailing space the real file carries, so the trim is exercised. */
  name: string;
  tipo: string;
  amount: Cell;
  vendor?: string;
  company?: string;
}

export function flatLine(line: FixtureLine): Cell[] {
  return [
    line.company ?? "01",
    line.date,
    0.33033564814814814,
    "OI0100001",
    "PACIENTE DE PRUEBA",
    line.seguro,
    "Personal",
    line.code,
    line.name,
    line.tipo,
    1,
    "0.0000",
    "0.0000",
    7,
    line.amount,
    line.vendor ?? "",
    "A00000001",
    "S/F",
  ];
}

/** Six lines over three months and two years. */
export const FIXTURE_LINES: FixtureLine[] = [
  {
    date: "2026-03-02 00:00:00.000",
    seguro: "PARTICULAR",
    code: "99204CARD",
    name: "Visita en la oficina de un nuevo paciente, que requiere de tr ",
    tipo: "HONORARIOS MEDICOS",
    amount: "120.0000",
    vendor: "CASTELLANOS LOPEZ RAUL FABRICI",
  },
  {
    date: "2026-03-15 00:00:00.000",
    seguro: "HUMANA",
    code: "001531",
    name: "TUBO PARA EXTRACCION DE SANGRE AL VACIO   TUBO EDTA  ",
    tipo: "INSUMOS",
    amount: "0.0000",
  },
  {
    date: "2026-03-31 00:00:00.000",
    seguro: "PARTICULAR",
    code: "000156",
    name: "CLARITROMICINA SOLIDO ORAL 250MG ",
    tipo: "MEDICINAS",
    amount: "35.5000",
  },
  {
    date: "2026-04-01 00:00:00.000",
    seguro: "BMI IGUALAS",
    code: "99204PED",
    name: "Visita en la oficina de un nuevo paciente, que requiere de tr",
    tipo: "HONORARIOS MEDICOS",
    amount: "90.0000",
    vendor: "SANCHEZ MENA  BRYAN JOEL",
  },
  {
    date: "2026-04-20 00:00:00.000",
    seguro: "PARTICULAR",
    code: "000156",
    name: "CLARITROMICINA SOLIDO ORAL 250MG",
    tipo: "MEDICINAS",
    amount: "14.5000",
  },
  {
    date: "2025-11-10 00:00:00.000",
    seguro: "CONFIAMED",
    code: "360193",
    name: "SODIO",
    tipo: "EXAMENES DE LABORATORIO",
    amount: "12.0000",
  },
];

/** A COMPLETE grid: the header and the six lines. */
export function flatGrid(lines: readonly FixtureLine[] = FIXTURE_LINES): Cell[][] {
  return [FLAT_HEADER, ...lines.map(flatLine)];
}

/** The same grid under a letterhead, as the module's own download writes it. */
export function flatGridWithLetterhead(lines: readonly FixtureLine[] = FIXTURE_LINES): Cell[][] {
  return [["LiderPlus"], ["Ventas por servicio"], [], ...flatGrid(lines)];
}

/** A grid WITHOUT the optional columns: only the seven the module reads. */
export function flatGridMinimal(lines: readonly FixtureLine[] = FIXTURE_LINES): Cell[][] {
  return [
    [
      "FECHA",
      "SEGURO",
      "TIPO DE SERVICIO.",
      "COD. ARTICULO",
      "NOMBRE DEL ARTICULO",
      "NETO",
      "VENDEDOR",
    ],
    ...lines.map((line) => [
      line.date,
      line.seguro,
      line.tipo,
      line.code,
      line.name,
      line.amount,
      line.vendor ?? "",
    ]),
  ];
}

/** The report of the OLD format: it must be rejected naming what was missing. */
export function oldFormatGrid(): Cell[][] {
  return [
    [null, null, null, "CLINICA DE PRUEBA S.A."],
    [null, null, null, "Venta de Servicios por FACTURA "],
    [null, null, null, null, null, null, null, null, "Desde:", null, null, "01/04/2026"],
    [null, null, "CODIGO", null, null, null, null, null, null, null, "NOMBRE"],
    [null, "\\01", null, null, null, null, null, "HONORARIOS"],
  ];
}

/**
 * A grid as a WORKBOOK. The accounting system's export is one sheet; so is the module's own
 * download, now that the period is decided per line.
 */
export function flatWorkbook(sheets: readonly { name: string; grid: Cell[][] }[]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  for (const { name, grid } of sheets) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(grid), name);
  }
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
