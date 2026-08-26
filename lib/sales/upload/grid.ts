/**
 * DÓNDE está cada cosa en el reporte «Venta de Servicios por FACTURA», y cómo se lee una celda.
 *
 * Todo se localiza por el RÓTULO que el propio reporte escribe —el título, `Desde:` / `Hasta:`,
 * y la cabecera `CODIGO` · `NOMBRE` · `CANTIDAD` · `VENTA TOTAL`— y jamás por una fila o una
 * columna fija: es la misma familia de reporte que `microplus-grid.ts` y `dingoo-grid.ts` ya leen,
 * y reparte su preámbulo por celdas sueltas, así que una coordenada empezaría a leer la celda
 * equivocada el día que cambien los márgenes de la plantilla — y lo haría en silencio.
 *
 * Partido de la estrategia por el mismo motivo que en PyG: la mitad delicada —localizar rótulos y
 * decidir qué fila es un dato— se prueba sobre rejillas desnudas, sin un workbook de por medio.
 */
import { compactLabel, type Cell } from "@/lib/excel/workbook";

/** El título que identifica al reporte. Se compara ya compactado (sin acentos, sin dobles
 *  espacios), así que da igual cómo lo escriba la plantilla. */
export const REPORT_TITLE = "venta de servicios por factura";

const CODE_LABEL = "codigo";
const NAME_LABEL = "nombre";
const QUANTITY_LABEL = "cantidad";
const AMOUNT_LABEL = "venta total";
const FROM_LABEL = "desde:";
const TO_LABEL = "hasta:";

/** Los rótulos del PIE de página, que describen la impresión y no el reporte. */
const PRINT_LABELS = new Set(["pagina:", "página:", "fecha:", "hora:", "usuario:"]);

const DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/**
 * El código de un SERVICIO tal como el reporte lo escribe: una barra invertida y dos dígitos
 * (`\01`). Se conserva verbatim en el dato —es lo que el contador coteja—, pero para reconocerlo
 * se acepta también sin la barra, porque SheetJS puede devolver la celda ya limpia según cómo esté
 * formateada.
 */
const SERVICE_CODE = /^\\?\d{2}$/;

export function salesLabel(cell: Cell): string {
  return compactLabel(cell);
}

function text(cell: Cell): string {
  return typeof cell === "string" ? cell.trim() : typeof cell === "number" ? String(cell) : "";
}

/**
 * Los importes llegan como TEXTO con separador de miles (`"107,231.22"`). Convertirlos con `Number`
 * a secas daría `NaN`, y un `NaN` redondeado a `0` dejaría el reporte entero en cero sin un solo
 * error visible — que es exactamente por lo que esto vive aquí con sus propios tests.
 *
 * `null` cuando la celda no es un número: es lo que separa una fila de datos de una de rótulos.
 */
export function toSalesNumber(cell: Cell): number | null {
  if (typeof cell === "number") {
    return Number.isFinite(cell) ? cell : null;
  }
  const raw = text(cell).replace(/\$/g, "").replace(/\s/g, "");
  if (raw === "") {
    return null;
  }
  // Los paréntesis del contador son el signo negativo.
  const negative = /^\(.*\)$/.test(raw);
  const parsed = Number(raw.replace(/[()]/g, "").replace(/,/g, ""));
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return negative ? -parsed : parsed;
}

/** ¿Es este el reporte de ventas por servicio? Se busca el título por su rótulo, en cualquier
 *  celda del preámbulo — nunca en el nombre del archivo, que se renombra sin consecuencias. */
export function hasSalesTitle(grid: readonly Cell[][]): boolean {
  return grid.some((row) => row.some((cell) => salesLabel(cell).includes(REPORT_TITLE)));
}

export interface SalesHeader {
  row: number;
  codeCol: number;
  nameCol: number;
  quantityCol: number;
  amountCol: number;
}

/**
 * La fila de cabecera es la que lleva los CUATRO rótulos a la vez. Se exigen los cuatro y no solo
 * dos porque una cabecera de `CODIGO`+`NOMBRE` la escriben también los balances de MicroPlus, y con
 * dos este parser habría reclamado sus archivos — el mismo error que MicroPlus cometió una vez con
 * los de Dingoo.
 *
 * **Sus columnas identifican el FORMATO, no localizan los datos**, y esa distinción es la que costó
 * la primera lectura de este reporte. Los rótulos van CENTRADOS sobre celdas combinadas, así que
 * caen en columnas distintas de las de sus propios valores: en el archivo real `CANTIDAD` está en
 * la columna 19 y las cantidades en la 18, `VENTA TOTAL` en la 25 y los importes en la 24. Leer los
 * datos por la columna del rótulo devuelve una celda vacía en TODAS las filas, que es exactamente
 * como se veía el fallo: el archivo se reconocía, el periodo se leía, y el reporte «no traía
 * ninguna línea». Quien localiza una línea es `readSalesRow`, por posición RELATIVA.
 */
export function findSalesHeader(grid: readonly Cell[][]): SalesHeader | null {
  for (let row = 0; row < grid.length; row++) {
    const cells = grid[row] ?? [];
    const found = { code: -1, name: -1, quantity: -1, amount: -1 };
    for (let col = 0; col < cells.length; col++) {
      const label = salesLabel(cells[col]);
      if (label === CODE_LABEL && found.code === -1) {
        found.code = col;
      } else if (label === NAME_LABEL && found.name === -1) {
        found.name = col;
      } else if (label === QUANTITY_LABEL && found.quantity === -1) {
        found.quantity = col;
      } else if (label === AMOUNT_LABEL && found.amount === -1) {
        found.amount = col;
      }
    }
    if (found.code !== -1 && found.name !== -1 && found.quantity !== -1 && found.amount !== -1) {
      return {
        row,
        codeCol: found.code,
        nameCol: found.name,
        quantityCol: found.quantity,
        amountCol: found.amount,
      };
    }
  }
  return null;
}

/** ¿Es esta fila un pie de página impreso (`Pagina:`, `Fecha:`)? */
export function isPrintRow(row: readonly Cell[]): boolean {
  return row.some((cell) => PRINT_LABELS.has(salesLabel(cell)));
}

/** Los índices de las celdas NO vacías de una fila, de izquierda a derecha. */
function filledColumns(row: readonly Cell[]): number[] {
  const columns: number[] = [];
  for (let col = 0; col < row.length; col++) {
    if (row[col] !== null && row[col] !== "") {
      columns.push(col);
    }
  }
  return columns;
}

export interface SalesRow {
  /** Verbatim, con su barra (`\\01`) — es lo que el contador coteja. */
  serviceCode: string;
  serviceName: string;
  payer: string;
  quantity: number;
  amount: number;
  /** Dónde estaba el importe. Lo necesita la fila de CIERRE, que no tiene código del que colgarse. */
  amountCol: number;
}

/**
 * Una LÍNEA de factura, leída por posición RELATIVA: el código del servicio, y detrás las cuatro
 * celdas no vacías que le siguen —nombre del servicio, pagador, cantidad e importe—.
 *
 * Cada fila del reporte es una línea COMPLETA; no hay agrupación por servicio ni subtotales, y el
 * código se repite en cada una. Se leen por posición relativa y no por columna fija porque los
 * valores viven en columnas que ningún rótulo nombra (ver `findSalesHeader`), y porque es la regla
 * que `microplus-grid.ts` ya aplica en esta misma familia de reportes: el valor es la siguiente
 * celda con algo, no la celda número N.
 *
 * `null` cuando la fila no es una línea — el preámbulo, la cabecera, el cierre —, y es `null` sin
 * excepciones: se exigen las CINCO celdas y que las dos últimas sean números, así que una fila de
 * rótulos no puede colarse como un pagador llamado «NOMBRE».
 */
export function readSalesRow(row: readonly Cell[]): SalesRow | null {
  const columns = filledColumns(row);
  const at = columns.findIndex((col) => SERVICE_CODE.test(text(row[col])));
  if (at === -1 || columns.length - at < 5) {
    return null;
  }
  const [codeCol, nameCol, payerCol, quantityCol, amountCol] = columns.slice(at, at + 5);
  const serviceName = text(row[nameCol]);
  const payer = text(row[payerCol]);
  const quantity = toSalesNumber(row[quantityCol]);
  const amount = toSalesNumber(row[amountCol]);
  if (serviceName === "" || payer === "" || quantity === null || amount === null) {
    return null;
  }
  return { serviceCode: text(row[codeCol]), serviceName, payer, quantity, amount, amountCol };
}

/**
 * El total que el reporte declara al cierre, leído en la MISMA columna en la que las líneas
 * escriben su importe.
 *
 * Esa fila no lleva ningún rótulo —es la cantidad y el importe, a secas, alineados bajo sus
 * columnas—, así que no hay ninguna palabra por la que buscarla; lo que la identifica es dónde
 * escribe su cifra. Buscarla por un rótulo `TOTAL` habría encontrado en su lugar la fila
 * `TOTAL ITEMS`, que cuenta LÍNEAS y no dólares, y el cuadre habría comparado el importe del mes
 * contra un recuento.
 *
 * `null` si no la escribe: entonces no hay nada contra qué cuadrar, y eso es mejor que cuadrar
 * contra una cifra que significa otra cosa.
 */
export function findDeclaredTotal(
  grid: readonly Cell[][],
  fromRow: number,
  amountCol: number,
): number | null {
  let total: number | null = null;
  for (let row = fromRow; row < grid.length; row++) {
    const value = toSalesNumber(grid[row]?.[amountCol] ?? null);
    if (value !== null) {
      total = value;
    }
  }
  return total;
}

export interface SalesRange {
  fromDay: number;
  /** 0–11. */
  fromMonth: number;
  fromYear: number;
  toDay: number;
  toMonth: number;
  toYear: number;
}

function parseDate(cell: Cell): { day: number; month: number; year: number } | null {
  const match = DATE.exec(text(cell));
  return match
    ? { day: Number(match[1]), month: Number(match[2]) - 1, year: Number(match[3]) }
    : null;
}

/** El índice de la primera celda no vacía estrictamente después de `from`, o `-1`. */
function nextFilledCol(row: readonly Cell[], from: number): number {
  for (let col = from + 1; col < row.length; col++) {
    if (row[col] !== null && row[col] !== "") {
      return col;
    }
  }
  return -1;
}

/**
 * El periodo, leído de `Desde:` / `Hasta:` — rótulo y fecha en celdas SEPARADAS, como en MicroPlus,
 * y no en la línea corrida `Desde el … hasta el …` del estado único. Los dos rótulos pueden estar
 * en la misma fila o en filas distintas, así que cada uno se busca por su cuenta.
 *
 * `null` si falta cualquiera de los dos: sin periodo declarado NO hay carga, porque deducirlo de
 * otro sitio —el nombre del archivo, la fecha de impresión— es cómo un mes acaba aterrizando sobre
 * otro.
 */
export function findSalesRange(grid: readonly Cell[][]): SalesRange | null {
  const from = findLabelledDate(grid, FROM_LABEL);
  const to = findLabelledDate(grid, TO_LABEL);
  if (!from || !to) {
    return null;
  }
  return {
    fromDay: from.day,
    fromMonth: from.month,
    fromYear: from.year,
    toDay: to.day,
    toMonth: to.month,
    toYear: to.year,
  };
}

function findLabelledDate(
  grid: readonly Cell[][],
  label: string,
): { day: number; month: number; year: number } | null {
  for (const row of grid) {
    // `startsWith` y no `===`: el reporte escribe la fecha en su propia celda («Desde:» ·
    // «01/04/2026») unas veces y pegada al rótulo («Desde: 01/04/2026») otras, y con la igualdad
    // estricta la segunda forma no encontraba el rótulo y el archivo se rechazaba por no declarar
    // periodo.
    const col = row.findIndex((cell) => salesLabel(cell).startsWith(label));
    if (col === -1) {
      continue;
    }
    // La fecha puede venir pegada al rótulo en la misma celda («Desde: 01/04/2026») o en la
    // siguiente celda con algo — las dos formas se han visto en esta familia de reportes.
    const inline = DATE.exec(text(row[col]).replace(/^[^:]*:\s*/, ""));
    if (inline) {
      return { day: Number(inline[1]), month: Number(inline[2]) - 1, year: Number(inline[3]) };
    }
    const valueCol = nextFilledCol(row, col);
    const parsed = valueCol === -1 ? null : parseDate(row[valueCol]);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

/**
 * La razón social: la primera línea de TEXTO del preámbulo que no sea el propio título del reporte
 * ni un rótulo de impresión. Es la misma regla que `dingoo-grid.ts` aplica saltándose `REPORTE` y
 * `ESTADO DE RESULTADOS` — sin ella, «la primera línea no vacía» devuelve el nombre del informe en
 * vez del de la empresa.
 */
export function findSalesCompany(grid: readonly Cell[][], headerRow: number): string {
  for (let row = 0; row < headerRow; row++) {
    // La fila NO se salta entera aunque lleve un pie: el reporte escribe la razón social a la
    // izquierda y la paginación veinte columnas a su derecha, en la MISMA fila. Lo que se filtra es
    // cada celda.
    for (const cell of grid[row] ?? []) {
      // Solo TEXTO: una razón social nunca llega como número, y un número suelto del preámbulo
      // (la página, un correlativo) sí.
      if (typeof cell !== "string") {
        continue;
      }
      const raw = cell.trim();
      if (raw === "" || !/\p{L}/u.test(raw) || DATE.test(raw)) {
        continue;
      }
      const label = salesLabel(cell);
      if (label.includes(REPORT_TITLE) || PRINT_LABELS.has(label) || label.endsWith(":")) {
        continue;
      }
      return raw;
    }
  }
  return "";
}
