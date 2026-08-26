/**
 * De un `.xlsx` de «Venta de Servicios por FACTURA» a un mes listo para guardar.
 *
 * Tres reglas gobiernan este archivo, y las tres se prueban:
 *
 *   1. **El formato se reconoce por su FORMA**, nunca por el nombre del archivo — el título y la
 *      cabecera de cuatro rótulos. Otro libro se rechaza NOMBRANDO lo que se esperaba, en vez de
 *      intentar leerlo y devolver un mes vacío.
 *   2. **El periodo lo declara el archivo** (`Desde:` / `Hasta:`) y ha de ser exactamente un mes
 *      calendario. La regla es la de `toCalendarMonth`, la MISMA que aplican el estado único y
 *      MicroPlus: no hay excepción por formato, y por eso se importa en vez de reescribirse.
 *   3. **La suma de las líneas se CUADRA contra el total del propio archivo**, y una diferencia se
 *      dice nombrándola. Es la única evidencia de que la lectura no se dejó filas por el camino,
 *      y sin ella una fila mal clasificada se pierde en silencio entre 2.774.
 *
 * Devuelve un resultado y no lanza: cada archivo de un lote necesita poder explicarse por su
 * cuenta sin tumbar a los demás.
 */
import { readGrid, readWorkbook, type Cell } from "@/lib/excel/workbook";
import { toCalendarMonth, type DateRange } from "@/lib/profit-loss/upload/date-range";
import type { ParsedSalesMonth, SalesLine } from "../types";
import {
  findDeclaredTotal,
  findSalesCompany,
  findSalesHeader,
  findSalesRange,
  hasSalesTitle,
  readSalesRow,
  type SalesHeader,
} from "./grid";

export type SalesParseResult =
  | { ok: true; month: ParsedSalesMonth }
  | { ok: false; message: string };

/** Un centavo: por debajo de eso, la diferencia contra el total del archivo es ruido de coma
 *  flotante y no un descuadre. */
const CENT = 0.005;

const WRONG_FORMAT =
  "No parece el reporte «Venta de Servicios por FACTURA»: falta su título o su cabecera " +
  "CODIGO · NOMBRE · CANTIDAD · VENTA TOTAL. Sube el reporte de ventas por servicio del mes.";

export function parseSalesWorkbook(data: ArrayBuffer): SalesParseResult {
  const workbook = readWorkbook(data);
  if (!workbook) {
    return { ok: false, message: "El archivo no es un Excel que se pueda leer." };
  }
  const grid = readGrid(workbook, workbook.SheetNames[0]);
  if (!grid) {
    return { ok: false, message: "El archivo no tiene ninguna hoja legible." };
  }
  return parseSalesGrid(grid);
}

export function parseSalesGrid(grid: readonly Cell[][]): SalesParseResult {
  // Se exigen las DOS señas: el título solo se lo lleva un reporte de ventas, y la cabecera de
  // cuatro rótulos es lo que impide reclamar un balance que también escribe `CODIGO` y `NOMBRE`.
  const header = findSalesHeader(grid);
  if (!hasSalesTitle(grid) || !header) {
    return { ok: false, message: WRONG_FORMAT };
  }

  const range = findSalesRange(grid);
  if (!range) {
    return {
      ok: false,
      message:
        "El archivo no declara su periodo (`Desde:` y `Hasta:`). La carga es mensual y el mes se " +
        "lee del propio reporte, nunca del nombre del archivo.",
    };
  }
  const period = toCalendarMonth(range as DateRange);
  if (!period.ok) {
    return { ok: false, message: period.message };
  }

  const { lines, declaredTotal } = readRows(grid, header);
  if (lines.length === 0) {
    return {
      ok: false,
      message:
        "El reporte no trae ninguna línea de factura. Comprueba que el mes exportado tiene " +
        "movimiento antes de subirlo.",
    };
  }

  return {
    ok: true,
    month: {
      year: period.year,
      monthIndex: period.month,
      companyName: findSalesCompany(grid, header.row),
      lines,
      declaredTotal,
      warnings: cuadre(lines, declaredTotal),
    },
  };
}

/**
 * El recorrido de la rejilla, y la única parte que decide QUÉ es un dato.
 *
 * Cada fila del reporte es una línea de factura COMPLETA —servicio, pagador, cantidad e importe—,
 * y el código del servicio se repite en todas: no hay agrupación ni subtotales. Lo que separa una
 * línea del resto es llevar ese código y las cuatro celdas que le siguen, que es lo que comprueba
 * `readSalesRow`; el preámbulo, la cabecera y las dos filas de cierre se caen solas por no
 * cumplirlo, sin necesidad de reconocer cada una por su rótulo.
 *
 * El total del reporte se busca DESPUÉS, en la columna donde las líneas escribieron su importe:
 * esa fila no lleva rótulo, así que la columna es lo único que la identifica.
 */
function readRows(
  grid: readonly Cell[][],
  header: SalesHeader,
): {
  lines: SalesLine[];
  declaredTotal: number | null;
} {
  const lines: SalesLine[] = [];
  let amountCol = -1;
  let lastDataRow = header.row;

  for (let index = header.row + 1; index < grid.length; index++) {
    const parsed = readSalesRow(grid[index] ?? []);
    if (!parsed) {
      continue;
    }
    amountCol = parsed.amountCol;
    lastDataRow = index;
    lines.push({
      serviceCode: parsed.serviceCode,
      serviceName: parsed.serviceName,
      payer: parsed.payer,
      quantity: parsed.quantity,
      amount: parsed.amount,
    });
  }

  return {
    lines,
    declaredTotal: amountCol === -1 ? null : findDeclaredTotal(grid, lastDataRow + 1, amountCol),
  };
}

/**
 * El cuadre contra la fila de total del archivo. Un aviso y NO un rechazo: el mes se carga igual,
 * porque una diferencia puede ser del reporte y no de la lectura, y quedarse sin los datos no
 * ayuda a averiguarlo. Lo que no puede pasar es que la diferencia no se diga.
 */
function cuadre(lines: readonly SalesLine[], declaredTotal: number | null): string[] {
  if (declaredTotal === null) {
    return [];
  }
  const sum = lines.reduce((total, line) => total + line.amount, 0);
  const difference = sum - declaredTotal;
  if (Math.abs(difference) < CENT) {
    return [];
  }
  return [
    `La suma de las ${lines.length} líneas leídas (${sum.toFixed(2)}) no coincide con el total ` +
      `que declara el archivo (${declaredTotal.toFixed(2)}): la diferencia es ${difference.toFixed(2)}.`,
  ];
}
