/**
 * Lo que «Ventas por servicio» guarda, y nada más: la LÍNEA DE FACTURA que el reporte trae y el
 * MES que la contiene. Nada derivado vive aquí —el reparto por servicio, la concentración por
 * pagador y la evolución del año se recalculan en cada lectura (`derive.ts`)—, la misma regla por
 * la que Rol de Pagos no persiste ni un total: una copia guardada aparte queda obsoleta a la
 * siguiente carga y la pantalla diría una cosa y los datos otra.
 *
 * El grano es la línea porque es lo que el archivo declara y lo único contra lo que la firma puede
 * cotejar una cifra. Lo que NO ocurre es que una vista las recorra: toda lectura agrega antes de
 * llegar a una tarjeta.
 */

/**
 * Una fila del reporte: qué servicio, quién lo paga, cuánto y por cuánto.
 *
 * `serviceCode` va VERBATIM —el reporte escribe `\01`, con su barra— por el mismo motivo por el
 * que Dingoo conserva los ceros de `5.02.01`: es lo que el contador coteja contra su propio
 * archivo. `payer` guarda el nombre ENTERO, incluidos los de personas: el anonimato es una
 * decisión de PRESENTACIÓN (`payer.ts`), y una cifra cuyo dueño no se guardó deja de ser trazable.
 */
export interface SalesLine {
  serviceCode: string;
  serviceName: string;
  payer: string;
  quantity: number;
  amount: number;
}

/**
 * Un mes leído del Excel, que todavía no pertenece a nadie — el espejo de `ParsedDataset` en PyG.
 * Quién es su dueño lo decide el cliente que esté abierto, y lo ESTAMPA `db.ts` en la puerta,
 * nunca el archivo.
 */
export interface ParsedSalesMonth {
  year: number;
  /** 0–11, como en toda la app. */
  monthIndex: number;
  /** La razón social que DECLARA el archivo — nunca el nombre que el usuario le dio al cliente. */
  companyName: string;
  lines: SalesLine[];
  /**
   * El total de la fila de cierre del propio reporte, o `null` si no la escribe. Se guarda para
   * poder decir CONTRA QUÉ se cuadró: sin él, una diferencia solo se puede afirmar en el momento
   * de la carga y se pierde al recargar la pantalla.
   */
  declaredTotal: number | null;
  /** Lo que la lectura tuvo que advertir — el descuadre contra `declaredTotal`, sobre todo. */
  warnings: string[];
}

/** Lo guardado: el mes leído más su dueño. `id` es `<clientId>:<año>-<mes>`, así que recargar un
 *  mes lo REEMPLAZA por construcción en vez de dejar dos filas del mismo periodo. */
export interface SalesMonth extends ParsedSalesMonth {
  id: string;
  clientId: string;
}

/** La clave de un mes dentro de un cliente. */
export function salesMonthId(clientId: string, year: number, monthIndex: number): string {
  return `${clientId}:${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

/**
 * La COBERTURA de un año: qué meses llegaron. Es una lista de índices y no doce huecos porque lo
 * que la app tiene que poder decir es «este mes NUNCA llegó», que es distinto de «llegó y vino en
 * cero» — la misma distinción sobre la que descansa `loadedMonthsByYear` en PyG y `monthHasData`
 * en Ocupaciones.
 */
export interface SalesCoverage {
  year: number;
  /** Índices 0–11, ascendentes, sin repetir. */
  months: number[];
}
