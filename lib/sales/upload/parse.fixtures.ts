/**
 * La FORMA del reporte «Venta de Servicios por FACTURA», con cifras y nombres INVENTADOS.
 *
 * Transcrita del archivo real de abril de 2026 del Hospital General Privado Durán, y lo que se
 * transcribe es la ESTRUCTURA:
 *
 *   - el preámbulo repartido por celdas sueltas, con la paginación a veinte columnas de la empresa;
 *   - `Desde:` / `Hasta:` con su fecha en una celda SEPARADA del rótulo, y los dos en la misma fila;
 *   - la cabecera de cuatro rótulos **desalineada de sus propios datos**, porque va centrada sobre
 *     celdas combinadas: `CANTIDAD` cae una columna a la derecha de las cantidades y `VENTA TOTAL`
 *     una a la derecha de los importes. Es el detalle que hacía que el archivo real se reconociera
 *     y no trajera «ninguna línea», así que la fixture no puede alinearlos;
 *   - filas PLANAS: cada una es una línea completa y repite el código de su servicio, sin
 *     agrupación, sin subtotales y sin reimprimir la cabecera;
 *   - el cierre en dos filas — `TOTAL ITEMS` con el RECUENTO de líneas, y debajo el total de verdad
 *     SIN NINGÚN RÓTULO, alineado bajo las columnas de cantidad e importe.
 *
 * Lo que NO se transcribe es ni un dato: ni la razón social, ni los nombres de los pacientes, ni los
 * importes. Un test versionado no es sitio para el nombre de un paciente, que es justo lo que este
 * módulo existe para no enseñar. Y vive aquí y no en `.context/`, que no está en el repositorio.
 *
 * **Lo que el archivo real da al pasar por este parser**, para que nadie tenga que volver a
 * derivarlo: 2.774 líneas, 956 pagadores y $229.616,226 —cuadrando al centavo contra la fila de
 * cierre— repartidos en HONORARIOS 107.231,22 (46,7 %), MEDICINAS 33.231,32 (14,5 %), EXAMENES DE
 * LABORATORIO 30.984,06 (13,5 %), INSUMOS 29.148,11 (12,7 %) e IMAGENES 29.021,51 (12,6 %); los
 * diez mayores pagadores son el 57,5 % del mes y los 946 restantes suman 97.540,32. Son las cifras
 * que la firma reconoce de su propio reporte, y la única evidencia externa de que esta lectura
 * significa lo que dice.
 */
import type { Cell } from "@/lib/excel/workbook";

/** Las columnas del archivo real, para que la fixture herede su desalineación. */
const CODE_COL = 1;
const SERVICE_COL = 7;
const PAYER_COL = 14;
const QUANTITY_COL = 18;
const AMOUNT_COL = 24;

function row(cells: Record<number, Cell>, width = 27): Cell[] {
  return Array.from({ length: width }, (_unused, index) => cells[index] ?? null);
}

function line(
  code: string,
  service: string,
  payer: string,
  quantity: number,
  amount: Cell,
): Cell[] {
  return row({
    [CODE_COL]: code,
    [SERVICE_COL]: service,
    [PAYER_COL]: payer,
    [QUANTITY_COL]: quantity,
    [AMOUNT_COL]: amount,
  });
}

/** Una rejilla mínima y COMPLETA: preámbulo, cabecera, cinco líneas de tres servicios y el cierre. */
export function salesGrid(): Cell[][] {
  return [
    row({ 3: "CLINICA DE PRUEBA S.A.", 23: "Página:", 26: "1 de 2" }),
    row({ 23: "Fecha:", 26: 46259 }),
    // El título llega con el espacio sobrante que el reporte escribe.
    row({ 3: "Venta de Servicios por FACTURA " }),
    row({}),
    row({ 8: "Desde:", 11: "01/04/2026", 15: "Hasta:", 16: "30/04/2026" }),
    row({}),
    // Los cuatro rótulos, cada uno en la columna en la que el reporte los CENTRA — ninguna coincide
    // con la de sus valores.
    row({ 2: "CODIGO", 10: "NOMBRE", 19: "CANTIDAD", 25: "VENTA TOTAL" }),
    line("\\01", "HONORARIOS", "ASEGURADORA UNO S.A.", 1, 1200.5),
    line("\\02", "MEDICINAS", "ASEGURADORA UNO S.A.", 5, 250),
    line("\\01", "HONORARIOS", "MENDOZA PARRA LUIS ALBERTO", 3, 300),
    line("\\03", "INSUMOS", "CONFIASALUD", 2, 100),
    line("\\02", "MEDICINAS", "MENDOZA PARRA LUIS ALBERTO", 1, 49.5),
    // El recuento de LÍNEAS, que no son dólares.
    row({ 0: "TOTAL ITEMS", 5: 5 }),
    // Y el total de verdad, sin rótulo, bajo sus columnas.
    row({ [QUANTITY_COL]: 12, [AMOUNT_COL]: 1900 }),
  ];
}

/** La misma forma con un rango que NO es un mes calendario. */
export function salesGridWithRange(from: string, to: string): Cell[][] {
  const grid = salesGrid();
  grid[4] = row({ 8: "Desde:", 11: from, 15: "Hasta:", 16: to });
  return grid;
}

/** La misma forma con los importes como TEXTO con separador de miles, que es como los escribe la
 *  variante en la que el reporte sale ya formateado. */
export function salesGridWithTextAmounts(): Cell[][] {
  const grid = salesGrid();
  grid[7] = line("\\01", "HONORARIOS", "ASEGURADORA UNO S.A.", 1, "1,200.50");
  grid[8] = line("\\02", "MEDICINAS", "ASEGURADORA UNO S.A.", 5, "250.00");
  return grid;
}

/**
 * La misma forma con TODO desplazado tres columnas a la derecha — un cambio de márgenes de la
 * plantilla. La lectura tiene que dar exactamente lo mismo, porque nada se localiza por coordenada.
 */
export function salesGridShifted(): Cell[][] {
  return salesGrid().map((cells) => [null, null, null, ...cells]);
}

/** Un balance de MicroPlus: comparte los rótulos `CODIGO` y `NOMBRE…` y NO es este reporte. */
export function foreignGrid(): Cell[][] {
  return [
    row({ 3: "CLINICA DE PRUEBA S.A." }),
    row({ 3: "BALANCE DE PERDIDAS Y GANANCIAS" }),
    row({ 8: "Desde:", 11: "01/04/2026", 15: "Hasta:", 16: "30/04/2026" }),
    row({ 2: "CODIGO", 10: "NOMBRE DE LA CUENTA", 25: "SALDO" }),
    row({ 1: "4.", 7: "INGRESOS", 24: 1900 }),
  ];
}
