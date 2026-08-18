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
import type { AmountEntry } from "../analytics/structure";

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
): ExpenseDistribution {
  const moving = entries.filter((entry) => entry.value !== 0);
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
    idle: entries.length - moving.length,
  };
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
  if (grouped > 0) {
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
