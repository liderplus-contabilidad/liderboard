/**
 * El ANEXO DE GASTOS: en qué se reparten los costos y gastos del tramo, cuánto pesa cada
 * categoría sobre el 100 % del gasto y cuánto sobre el ingreso.
 *
 * Es la lectura que la firma lleva a mano en un libro aparte —una tabla de código · descripción ·
 * valor · porcentaje, con su gráfico de barras y su tarta al lado— y son las DOS cifras de su
 * cabecera las que la definen: el total del gasto, que es el 100 % del reparto, y el total del
 * ingreso, contra el que ese gasto se mide. Un reparto que solo dijera el porcentaje sobre sí
 * mismo no responde «¿cuánto de lo que vendí se me fue en honorarios médicos?», que es la
 * pregunta con la que se abre el anexo.
 *
 * **No necesita el vocabulario que sí necesita «Ventas»**, y esa es toda la diferencia entre las
 * dos vistas predeterminadas. Allí las categorías son invisibles en el plan —hospedaje cruza ramas
 * enteras, restaurante y bar comparten una cuenta— y `business-lines.ts` las localiza por rótulo,
 * lo que la ata a un plan de hotelería. Aquí las categorías del anexo SON cuentas del plan, y
 * están a distinta profundidad según la rama (`5.2.02` junto a `5.3.03.01`) justamente porque son
 * las cuentas de MOVIMIENTO del árbol de gastos — que es lo que `leavesOfAny` ya devuelve. Regla
 * estructural y no de dominio: sirve para un hospital, un hotel y un comercio sin una línea de
 * código por cliente.
 *
 * Nada aquí decide cuántas se DIBUJAN — eso es de la tarjeta, porque el corte de una tarta y el de
 * unas barras no son el mismo número. Este archivo devuelve el reparto ENTERO y ordenado, que es
 * lo que la tabla del anexo imprime sin recortar.
 */
import { OTHERS_CODE } from "../analytics/structure";
import type { AmountEntry } from "../analytics/structure";
import type { AnalyticsSource } from "../analytics/types";

/**
 * Cuántos rubros dibuja el anexo antes de plegar la cola en «Otros» — el MISMO número para las
 * barras y para la dona, que es lo que las hace hablar de la misma lista.
 *
 * Quince lo pidió la firma y es un límite de LEGIBILIDAD, no de color: las barras van todas del
 * mismo tono, así que por ahí no hay tope, y la dona tiene tonos para más. Lo que no da para más es
 * la lectura — un plan de gastos puede traer 133 cuentas de movimiento, y ahí las porciones caen
 * por debajo del 0,1 %: no se ven, no se pueden rotular y la tarta deja de repartir nada—. Los
 * plegados no se pierden: siguen uno a uno en la tabla del anexo, que no corta.
 */
export const ANNEX_MAX_SLICES = 15;

/**
 * EL ANEXO QUE LA CLÍNICA DECLARA: los diecisiete rubros con los que la firma arma este gráfico,
 * con el código y el RÓTULO que imprime su propia hoja, en el orden en que los lista.
 *
 * **Es una lista y no una regla, y eso se probó al revés primero.** Los diecisiete parecían un
 * nivel derivable del árbol —el ancestro más profundo con hijas, que es la fila que un anexo suele
 * subtotalizar—, y contra el plan real no lo son: once lo cumplen y seis no (`5.2.02`, `5.3.02`,
 * `5.3.03.12`, `5.5.01.01`, `5.5.01.02`, `5.5.02.01` tienen nietos y bisnietos), así que esa regla
 * los habría partido en subcuentas y dejado la lectura con once barras y un «Otros» enorme.
 * Tampoco son un nivel fijo: conviven `5.2.02` (nivel 3) y `5.3.03.01` (nivel 4). Son una
 * SELECCIÓN del contador, y lo que el plan no lista —`5.2.03`, `5.2.04`, `5.3.03.05`, `.08`,
 * `.10`, `.15`, `.16`, `.18`, `.20`— son las cuentas que no se mueven, que es lo que hace que los
 * diecisiete sumen el gasto entero.
 *
 * La lista **NOMBRA** además de elegir: el rótulo va atado al código y PISA al del plan de cuentas,
 * porque el archivo llama a `5.2.02` «MANO DE OBRA DIRECTA / FARMACIA/…», a `5.3.03.14` «AGUA,
 * ENERGIA, LUZ Y TELECOMUNICACIONES» y a `5.5.01.01` «GASTOS NOMINA /ADMINISTRACION», y este
 * gráfico se coteja fila por fila contra la hoja donde se llaman de otra manera. Van VERBATIM, con
 * sus mayúsculas y sus espacios sobrantes (`FARMACIA/ LABORATORIO`), la misma regla con la que Rol
 * de Pagos conserva las erratas del contador en el asiento y en el comprobante.
 *
 * Los códigos vienen del archivo sin el punto final con el que MicroPlus marca un padre
 * (`5.2.01.01.`), que es lo que `microplus-grid.ts` ya descarta al importar. Ninguno cuelga de
 * otro, así que el reparto no puede contar dos veces el mismo dólar.
 */
export interface AnnexRow {
  code: string;
  label: string;
}

export const DECLARED_ANNEX_ROWS: readonly AnnexRow[] = [
  { code: "5.2.01.01", label: "COSTOS DE VENTAS MEDICINAS E INSUMOS" },
  { code: "5.2.01.02", label: "COSTO ALIMENTACION" },
  { code: "5.2.02", label: "EMPLEADOS M.O.D. / FARMACIA/ LABORATORIO" },
  { code: "5.3.02", label: "EMPLEADOS M.O.I. / ADMISIONES / CAJA / INFORMACION" },
  { code: "5.3.03.01", label: "HONORARIOS MEDICOS" },
  { code: "5.3.03.04", label: "MANTENIMIENTO Y REPARACIONES" },
  { code: "5.3.03.06", label: "PROMOCION Y PUBLICIDAD" },
  { code: "5.3.03.07", label: "COMBUSTIBLES" },
  { code: "5.3.03.09", label: "SEGUROS Y REASEGUROS (Primas y Cesiones)" },
  { code: "5.3.03.12", label: "GASTOS DE VIAJE NACIONALES" },
  { code: "5.3.03.14", label: "SERVICIOS BASICOS" },
  { code: "5.3.03.17", label: "OTROS GASTOS" },
  { code: "5.3.03.19", label: "DEPRECIACIONES" },
  { code: "5.5.01.01", label: "EMPLEADOS ADMINISTRACION" },
  { code: "5.5.01.02", label: "OTROS GASTOS OPERACIONALES" },
  { code: "5.5.02.01", label: "GASTOS FINANCIEROS" },
  { code: "5.5.03.01", label: "GASTOS NO DEDUCIBLES" },
];

export interface AnnexPlan {
  /** Los rubros que se dibujan: los declarados que el plan abierto trae, acotados por las marcas. */
  rows: AnnexRow[];
  /**
   * Si «Otros» recoge el resto del gasto. Solo con el anexo COMPLETO en pantalla: con cuentas
   * marcadas se está mirando un trozo a propósito, y ahí la columna suma menos de 100 % —que es lo
   * que dice que es un trozo— en vez de arrastrar todo lo demás a una barra.
   */
  residual: boolean;
}

/**
 * El plan del anexo declarado, o `null` cuando el estado abierto no es ese — y entonces la vista
 * reparte por cuentas de movimiento, exactamente como antes de que esto existiera.
 *
 * La puerta se abre con la MAYORÍA de los rubros declarados presentes en el plan, y no con todos:
 * que el contador retire o renumere uno no puede cambiar la forma del gráfico que revisa cada mes.
 * Y no mira de qué SISTEMA salió el archivo, que identificaría a todo MicroPlus y no a este plan de
 * cuentas; lo que la abre es el plan mismo, que es de lo que habla la lista.
 *
 * Las cuentas marcadas ACOTAN el reparto (`PresetView.narrowedByCodes`) con la regla de siempre:
 * una sección marcada deja sus rubros, un rubro marcado se deja a sí mismo. Se juzga la puerta
 * ANTES de acotar, así que marcar uno no puede cerrarla.
 */
export function annexPlanOf(
  source: AnalyticsSource | undefined,
  markedCodes: readonly string[] = [],
): AnnexPlan | null {
  if (!source) {
    return null;
  }
  const present = DECLARED_ANNEX_ROWS.filter((row) => source.valuesByCode.has(row.code));
  if (present.length * 2 <= DECLARED_ANNEX_ROWS.length) {
    return null;
  }
  if (markedCodes.length === 0) {
    return { rows: present, residual: true };
  }
  return {
    rows: present.filter((row) =>
      markedCodes.some((marked) => row.code === marked || row.code.startsWith(`${marked}.`)),
    ),
    residual: false,
  };
}

export interface ExpenseCategory extends AmountEntry {
  /** Qué parte del 100 % del gasto es. `null` cuando el total no da base. */
  shareOfExpenses: number | null;
  /** Qué parte del ingreso del MISMO tramo es. `null` cuando no hay ingreso que dividir. */
  shareOfRevenue: number | null;
}

export interface ExpenseDistribution {
  /** El reparto entero, de mayor a menor. Sin cortar: cortar es de quien dibuja. */
  categories: ExpenseCategory[];
  /** El 100 % del reparto — el rollup del motor, nunca la suma de lo que haya en pantalla. */
  totalExpenses: number | null;
  totalRevenue: number | null;
  /** Cuánto del ingreso se fue en gastos: la cifra que abre el anexo. */
  expensesOverRevenue: number | null;
  /** Cuentas del universo que no se movieron en el tramo. Se cuentan, no se nombran. */
  idle: number;
  /**
   * Cuántos rubros dibujan las dos tarjetas antes de plegar la COLA en «Otros».
   *
   * Lo decide el reparto y no la tarjeta porque el corte de quince existe para un universo de
   * ciento treinta y una cuentas de movimiento: con el anexo DECLARADO son diecisiete rubros que
   * el contador coteja fila por fila, y plegar los tres más pequeños esconde justo lo que su hoja
   * lista. Ahí se dibujan todos, que es lo que la paleta de porciones (dieciocho tonos) permite.
   */
  maxSlices: number;
  /**
   * Si «Otros» es el RESTO del gasto que el anexo no nombra y no la cola plegada por tamaño. Son
   * dos cosas distintas y la nota las dice distinto: una es un pliegue de filas que la tabla sigue
   * listando, la otra es dinero del estado que esta lista no menciona.
   */
  residual: boolean;
}

/**
 * Un porcentaje sobre un total, y la ÚNICA definición de eso en este archivo — la comparten las
 * dos columnas del anexo y la ficha de cuenta, que hace la misma pregunta para una sola cuenta.
 *
 * Un total `null` (sin cobertura) y un total `0` dan `null`, nunca `0 %`: la primera es «no se
 * sabe» y la segunda sería dividir por cero, y las dos son distintas de «no pesa nada». Es la
 * misma regla que `toPctOfAccount` aplica en el motor y que el análisis vertical aplica a su
 * «Total año».
 */
export function shareOf(value: number, total: number | null): number | null {
  if (total === null || total === 0) {
    return null;
  }
  return (value / total) * 100;
}

/**
 * El reparto, a partir de los montos que el motor ya sumó sobre el tramo.
 *
 * Las cuentas SIN MOVIMIENTO se van y se cuentan, la regla de `topEntries` y de `foldDistribution`:
 * un estado declara cada cuenta de su plan tenga o no movimiento, y el anexo del contador solo
 * lista las que se movieron —diez filas en cero entierran a la que importa—. Las negativas SÍ se
 * quedan: en un reparto de gastos una nota de crédito es un hallazgo, no ruido, y la tabla puede
 * imprimir un porcentaje negativo aunque la tarta no pueda dibujar una porción.
 *
 * El denominador es el que trae `totals`, que es el rollup de las raíces de gasto, y NO la suma de
 * las categorías. Con el universo entero dan lo mismo; con cuentas marcadas no, y entonces la
 * columna suma menos de 100 % — que es lo correcto y es lo que dice que se está mirando un trozo.
 */
export function buildExpenseDistribution(
  entries: readonly AmountEntry[],
  totals: { expenses: number | null; revenue: number | null },
  options: { annex?: AnnexPlan | null } = {},
): ExpenseDistribution {
  // Sin ningún rubro que nombrar no hay anexo que dibujar —pasa al acotar por debajo de su nivel,
  // con una cuenta de movimiento marcada— y el reparto vuelve a ser el ordinario: cada cuenta con
  // su nombre y la cola plegada por tamaño.
  const annex = options.annex && options.annex.rows.length > 0 ? options.annex : null;
  const reparto = annex ? annexEntries(entries, annex, totals.expenses) : entries;
  const moving = reparto.filter((entry) => entry.value !== 0);
  const categories = [...moving]
    .sort((a, b) => b.value - a.value)
    .map((entry) => ({
      ...entry,
      shareOfExpenses: shareOf(entry.value, totals.expenses),
      shareOfRevenue: shareOf(entry.value, totals.revenue),
    }));

  return {
    categories,
    totalExpenses: totals.expenses,
    totalRevenue: totals.revenue,
    expensesOverRevenue: totals.expenses === null ? null : shareOf(totals.expenses, totals.revenue),
    // El «Otros» sintético no cuenta como cuenta parada: cuando el anexo cubre el gasto entero
    // vale cero, y sin esta salvedad la nota decía «1 cuenta no se movió» sin que hubiera ninguna.
    idle: reparto.filter((entry) => entry.value === 0 && entry.code !== OTHERS_CODE).length,
    // El anexo declarado se dibuja ENTERO: sus rubros son la lista que el contador coteja fila por
    // fila, y plegar los más pequeños por tamaño le quitaría justo las que él busca.
    maxSlices: annex ? categories.length : ANNEX_MAX_SLICES,
    residual: annex?.residual === true && categories.some((entry) => entry.code === OTHERS_CODE),
  };
}

/**
 * Los rubros del anexo con SU rótulo, y «Otros» con lo que el anexo no nombra.
 *
 * El residuo se calcula contra el TOTAL DEL GASTO y no sumando las cuentas que quedaron fuera:
 * esas cuentas no se consultaron —el anexo pregunta por diecisiete códigos, no por el árbol
 * entero— y sumarlas exigiría una segunda tanda que podría cuadrar contra otro tramo. Restar
 * contra el denominador hace que las dos tarjetas cierren en 100 % por construcción, con
 * cualquier plan y sin importar cuántas cuentas queden fuera.
 *
 * Puede salir NEGATIVO —el plan lleva un `(-) DESCUENTO EN COMPRAS` fuera de la lista—, y entonces
 * es la tarta la que lo aparta con su nota de siempre; las barras y la tabla lo siguen diciendo.
 * Se redondea a centavos para que el ruido de coma flotante no invente una porción de $0,00.
 */
function annexEntries(
  entries: readonly AmountEntry[],
  annex: AnnexPlan,
  totalExpenses: number | null,
): AmountEntry[] {
  const declared = new Map(annex.rows.map((row) => [row.code, row.label]));
  const named = entries
    .filter((entry) => declared.has(entry.code))
    .map((entry) => ({ ...entry, label: declared.get(entry.code) ?? entry.label }));
  if (!annex.residual || totalExpenses === null) {
    return named;
  }
  const rest = named.reduce((sum, entry) => sum + entry.value, totalExpenses * -1) * -1;
  return [...named, { code: OTHERS_CODE, label: "Otros", value: Math.round(rest * 100) / 100 }];
}

/**
 * La nota al pie del anexo, en castellano llano: contra qué se está midiendo y qué se dejó fuera.
 *
 * Dice el CUADRE primero —el total del reparto y qué parte del ingreso es—, porque es lo que el
 * contador coteja contra su propia hoja, y por eso lleva centavos igual que la nota de «Ventas».
 * Lo plegado y lo parado van después y como CUENTA, no nombrados: son las filas que la tabla
 * gemela sí lista, así que nombrarlas aquí las diría dos veces.
 */
export function describeExpenseDistribution(
  distribution: ExpenseDistribution,
  options: { grouped?: number; format: (value: number) => string } = {
    format: (value) => String(value),
  },
): string | undefined {
  const parts: string[] = [];
  const { totalExpenses, expensesOverRevenue } = distribution;

  if (totalExpenses !== null) {
    parts.push(
      expensesOverRevenue === null
        ? `Los ${distribution.categories.length} rubros suman ${options.format(totalExpenses)}.`
        : `Los ${distribution.categories.length} rubros suman ${options.format(totalExpenses)}, el ${expensesOverRevenue.toFixed(1)} % de los ingresos del tramo.`,
    );
  }
  const grouped = options.grouped ?? 0;
  if (distribution.residual) {
    // Con el anexo declarado «Otros» significa otra cosa: no es la cola pequeña sino el resto del
    // gasto que esta lista no menciona, y la tabla tampoco lo desglosa. Decirlo es lo que impide
    // leer esa porción como un rubro más de la hoja del contador.
    parts.push("«Otros» es el resto del gasto que el anexo no nombra.");
  } else if (grouped > 0) {
    // Se dice CUÁNTOS agrupa y dónde están enteros, que es lo que evita leer «Otros» como una
    // cuenta más. La redacción es la que la cascada ya usa para su propio pliegue.
    parts.push(`«Otros» agrupa ${grouped} rubros más pequeños, que la tabla lista uno a uno.`);
  }
  if (distribution.idle > 0) {
    parts.push(
      `${distribution.idle} ${distribution.idle === 1 ? "cuenta no se movió" : "cuentas no se movieron"} en el tramo.`,
    );
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}
