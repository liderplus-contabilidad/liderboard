/**
 * La persistencia de «Ventas por servicio» en IndexedDB, y **la ÚNICA puerta a sus tablas** — la
 * misma regla que sostienen `lib/profit-loss/db.ts`, `lib/occupancy/db.ts` y `lib/payroll/db.ts`,
 * y por el mismo motivo, que aquí no es orden sino mitigación: con varios clientes compartiendo
 * una tabla, una consulta sin `clientId` mezcla la facturación de dos empresas en silencio, y nada
 * aguas abajo —ni las agregaciones de `derive.ts`, ni las tarjetas, ni el informe— puede notarlo.
 * Toda lectura y toda escritura de aquí abajo llevan su `clientId`.
 *
 * **Base propia** (`liderboard-sales`), separada de la de PyG aunque la partición sea el cliente de
 * PyG: el grano de esto es la LÍNEA DE FACTURA, y meterla en la base del estado de resultados
 * obligaría a esa base a guardar algo que no es una cuenta. Lo que se comparte es la identidad del
 * cliente, no el almacén.
 *
 * Nada derivado se guarda: el reparto por servicio, la concentración por pagador y la evolución del
 * año se recalculan en cada lectura. Una copia quedaría obsoleta a la siguiente carga.
 */
import Dexie, { type Table } from "dexie";
import { salesMonthId, type ParsedSalesMonth, type SalesMonth } from "./types";

class SalesDb extends Dexie {
  months!: Table<SalesMonth, string>;

  constructor() {
    super("liderboard-sales");
    this.version(1).stores({
      // El índice compuesto es ÚNICO (`&`) porque un cliente no puede tener dos veces el mismo
      // (año, mes): recargar un mes lo REEMPLAZA, y con `id` derivado de esa terna el reemplazo lo
      // hace `put` por construcción en vez de depender de que alguien recuerde borrar antes.
      months: "id, clientId, &[clientId+year+monthIndex], [clientId+year]",
    });
  }
}

const db = new SalesDb();

/**
 * Todos los meses de UN cliente. La única forma de leer la tabla: no hay ninguna consulta sin
 * `clientId`, que es lo que impide que un año de otra empresa se cuele en una lectura.
 */
export function monthsForClient(clientId: string | null): Promise<SalesMonth[]> {
  if (!clientId) {
    return Promise.resolve([]);
  }
  return db.months.where("clientId").equals(clientId).toArray();
}

/**
 * Escribe un mes en el cliente ABIERTO, ESTAMPÁNDOLE ahí su dueño: a qué cliente pertenece un
 * archivo lo decide qué cliente está abierto, nunca el archivo — la misma regla con la que PyG
 * convierte un `ParsedDataset` en un `PygDataset`.
 *
 * Un mes ya cargado se reemplaza POR COMPLETO. No se fusiona con lo anterior: el reporte es la
 * foto entera del mes, así que quedarse con líneas de una carga previa dejaría facturas que el
 * sistema contable ya no declara.
 */
export async function saveMonths(
  clientId: string,
  parsed: readonly ParsedSalesMonth[],
): Promise<void> {
  const rows: SalesMonth[] = parsed.map((month) => ({
    ...month,
    id: salesMonthId(clientId, month.year, month.monthIndex),
    clientId,
  }));
  await db.months.bulkPut(rows);
}

/** Borra un mes del cliente abierto. */
export async function deleteMonth(
  clientId: string,
  year: number,
  monthIndex: number,
): Promise<void> {
  await db.months.delete(salesMonthId(clientId, year, monthIndex));
}

/**
 * El CASCADE al borrar un cliente de PyG. Vive aquí —y lo llama quien borra el cliente— en vez de
 * que la base de PyG conozca esta: la dependencia va del módulo nuevo hacia el que ya existía, y
 * nunca al revés. Sin esto, borrar un cliente dejaría su facturación en una partición que ninguna
 * pantalla lista y ningún borrado alcanza.
 */
export async function deleteSalesForClient(clientId: string): Promise<void> {
  await db.months.where("clientId").equals(clientId).delete();
}
