/**
 * De las líneas de factura a las tres agregaciones que la pantalla lee: por SERVICIO, por PAGADOR
 * y por MES.
 *
 * **Ninguna vista recorre líneas sueltas.** Un mes trae ~2.800 y un año ~33.000, así que todo lo
 * que se dibuja pasa antes por aquí; una tarjeta que filtrara la lista cruda sería una segunda
 * definición de «cuánto vendió este servicio», capaz de separarse de esta sin que ninguna cifra lo
 * delate.
 *
 * Puro y testeado, como el resto de `lib/`: estas son las reglas que pueden estar mal —qué se suma,
 * qué se ordena y qué es un hueco frente a un cero—, y ninguna necesita un navegador.
 */
import { classifyPayer, payerLabel, type PayerKind } from "./payer";
import type { SalesLine, SalesMonth } from "./types";

/** El cierre de un periodo: las cuatro cifras que encabezan la pantalla. */
export interface SalesTotals {
  amount: number;
  /** Cuántas LÍNEAS de factura, no cuántas facturas: el reporte no trae el número de factura. */
  lineCount: number;
  payerCount: number;
  /** Venta ÷ líneas. `null` sin ninguna línea, nunca `0`: dividir por cero no da cero. */
  averageTicket: number | null;
}

export interface ServiceTotal {
  /** El código verbatim del reporte (`\01`) — la identidad estable de la serie. */
  code: string;
  name: string;
  amount: number;
  quantity: number;
}

export interface PayerTotal {
  /** El nombre crudo, normalizado solo en espacios: la clave con la que se agrupó. */
  id: string;
  /** Lo que se ESCRIBE. Una persona nunca llega aquí con su nombre. */
  label: string;
  kind: PayerKind;
  amount: number;
  lineCount: number;
}

/** Un mes del eje del año. `amount: null` es un mes que NUNCA se cargó. */
export interface MonthPoint {
  monthIndex: number;
  amount: number | null;
}

/** La venta de un periodo, ya agregada por sus tres ejes. */
export interface SalesReading {
  totals: SalesTotals;
  services: ServiceTotal[];
  payers: PayerTotal[];
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Espacios internos colapsados y extremos recortados: es lo único que se toca de un nombre que
 *  después hay que poder cotejar contra el archivo. */
function payerKey(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function salesTotals(lines: readonly SalesLine[]): SalesTotals {
  const amount = sum(lines.map((line) => line.amount));
  const payers = new Set(lines.map((line) => payerKey(line.payer)));
  return {
    amount,
    lineCount: lines.length,
    payerCount: payers.size,
    averageTicket: lines.length === 0 ? null : amount / lines.length,
  };
}

/**
 * Por servicio, de mayor a menor. El nombre lo pone la PRIMERA línea que declara ese código: el
 * reporte lo repite en cada fila, y si dos filas discreparan lo que manda es el código, que es lo
 * que el sistema contable indexa.
 */
export function byService(lines: readonly SalesLine[]): ServiceTotal[] {
  const totals = new Map<string, ServiceTotal>();
  for (const line of lines) {
    const existing = totals.get(line.serviceCode);
    if (existing) {
      existing.amount += line.amount;
      existing.quantity += line.quantity;
      continue;
    }
    totals.set(line.serviceCode, {
      code: line.serviceCode,
      name: line.serviceName,
      amount: line.amount,
      quantity: line.quantity,
    });
  }
  return [...totals.values()].sort(byAmountDesc);
}

/**
 * Por pagador, de mayor a menor — y con el ORDINAL de los particulares asignado sobre ESE orden,
 * que es lo que hace que «Particular · 1» sea siempre el mayor de ellos y no el primero que el
 * archivo escribió. El ordinal cuenta solo entre particulares: con las empresas dentro, la
 * numeración saltaría huecos y parecería que faltan filas.
 */
export function byPayer(lines: readonly SalesLine[]): PayerTotal[] {
  const totals = new Map<
    string,
    { id: string; kind: PayerKind; amount: number; lineCount: number }
  >();
  for (const line of lines) {
    const id = payerKey(line.payer);
    const existing = totals.get(id);
    if (existing) {
      existing.amount += line.amount;
      existing.lineCount += 1;
      continue;
    }
    totals.set(id, { id, kind: classifyPayer(id), amount: line.amount, lineCount: 1 });
  }
  const ranked = [...totals.values()].sort(byAmountDesc);
  let particulars = 0;
  return ranked.map((entry) => {
    const ordinal = entry.kind === "particular" ? ++particulars : 0;
    return { ...entry, label: payerLabel(entry.id, entry.kind, ordinal) };
  });
}

function byAmountDesc(a: { amount: number }, b: { amount: number }): number {
  return b.amount - a.amount;
}

export function readSales(lines: readonly SalesLine[]): SalesReading {
  return { totals: salesTotals(lines), services: byService(lines), payers: byPayer(lines) };
}

/**
 * Los DOCE meses del año, siempre — un eje del ejercicio y no de lo que llegó.
 *
 * Un mes que nunca se cargó vale `null` y NO `0`, que es la distinción sobre la que descansa todo
 * el módulo: un cero afirma que no se vendió nada, y eso solo lo puede decir un archivo que llegó.
 * Un mes cargado cuyas líneas suman cero sí es un cero, y así se dibuja.
 */
export function monthlySeries(months: readonly SalesMonth[], year: number): MonthPoint[] {
  const loaded = new Map<number, number>();
  for (const month of months) {
    if (month.year === year) {
      loaded.set(month.monthIndex, sum(month.lines.map((line) => line.amount)));
    }
  }
  return Array.from({ length: 12 }, (_unused, monthIndex) => ({
    monthIndex,
    amount: loaded.has(monthIndex) ? (loaded.get(monthIndex) as number) : null,
  }));
}

/** Los años que el cliente tiene cargados, ascendentes. */
export function loadedYears(months: readonly SalesMonth[]): number[] {
  return [...new Set(months.map((month) => month.year))].sort((a, b) => a - b);
}

/** Los meses cargados de un año, ascendentes — la cobertura declarada. */
export function loadedMonths(months: readonly SalesMonth[], year: number): number[] {
  return months
    .filter((month) => month.year === year)
    .map((month) => month.monthIndex)
    .sort((a, b) => a - b);
}

/**
 * «Qué parte del total es esto», y la ÚNICA definición del módulo: la comparten el reparto por
 * servicio, la concentración por pagador y las notas que las cuadran, así que una barra y su fila
 * no pueden decir porcentajes distintos.
 *
 * Un total en `0` da `null` y JAMÁS `0 %`: no vender nada no significa que un servicio sea el 0 %
 * de lo vendido, significa que la pregunta no tiene respuesta.
 */
export function shareOf(amount: number, total: number): number | null {
  return total === 0 ? null : (amount / total) * 100;
}
