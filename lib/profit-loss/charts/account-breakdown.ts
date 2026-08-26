/**
 * DE QUÉ SE COMPONE UNA CUENTA: el reparto de un rubro entre sus hijas DIRECTAS.
 *
 * Nace de la pregunta que sigue a una barra del anexo — «tengo tanto en honorarios médicos, ¿pero
 * qué lo compone?» — y por eso reparte el nivel siguiente y no las hojas del fondo: `5.5.01.02`
 * cuelga veintisiete secciones que a su vez cuelgan noventa cuentas, y enseñar las noventa de
 * golpe no es un desglose sino otra lista ilegible. Al siguiente nivel se llega BAJANDO, que es un
 * gesto y no un parámetro.
 *
 * Lo que este archivo NO decide es dónde se dibuja: la ventana que lo muestra es de la vista. Aquí
 * solo está lo que puede estar mal — qué filas entran, en qué orden, qué parte del padre es cada
 * una y si la suma cuadra.
 */
import type { AmountEntry } from "../analytics/structure";
import { shareOf } from "./expense-distribution";

/**
 * Cuántas filas dibuja el desglose antes de callar la cola. Doce caben en la ventana con la misma
 * densidad de ~34 px por fila del ranking; el resto sigue en la tabla gemela, que no corta, y la
 * nota dice cuántas son. No se pliegan en un «Otros» a propósito: aquí la pregunta es de qué se
 * compone la cuenta, y una fila sintética con la suma de la cola no responde eso — la responde la
 * tabla, nombrándolas.
 */
export const BREAKDOWN_MAX_ROWS = 12;

export interface BreakdownRow extends AmountEntry {
  /** Qué parte del padre es. `null` cuando el padre no da base (sin cobertura o en cero). */
  share: number | null;
  /** Si la fila tiene a su vez desglose — lo que decide si se puede bajar otro nivel. */
  hasChildren: boolean;
}

export interface AccountBreakdown {
  /** Las que se dibujan, de mayor a menor. */
  rows: BreakdownRow[];
  /** Todas las que se movieron, sin cortar: es lo que imprime la tabla gemela. */
  all: BreakdownRow[];
  /** Hijas que el plan declara y no se movieron en el tramo. Se cuentan, no se nombran. */
  idle: number;
  /** Cuántas quedaron fuera del dibujo por el corte. */
  hidden: number;
  /** El monto del padre, que es el 100 % del reparto. */
  total: number | null;
  /**
   * Si las hijas suman el padre. Debería ser SIEMPRE cierto —el motor recalcula todo padre desde
   * sus hijas (`computeRollups`)—, y justamente por eso se comprueba: si algún día deja de serlo,
   * el desglose estaría contradiciendo a la barra que lo abrió, y eso tiene que decirse en vez de
   * quedar en una diferencia que nadie suma a mano.
   */
  balances: boolean;
}

/** Medio centavo: por debajo de eso la diferencia es ruido de coma flotante, no un descuadre. */
const CENT = 0.005;

/**
 * El desglose, a partir de los montos que el motor ya sumó sobre el tramo para las hijas.
 *
 * Las paradas se van y se cuentan, la regla del anexo y del ranking: un plan declara cada cuenta
 * tenga o no movimiento, y `5.5.01.02` trae varias en cero todo el año. Las NEGATIVAS se quedan —
 * una nota de crédito dentro de un gasto es un hallazgo—, y por eso el orden es por valor con
 * signo y no por magnitud: lo que se lee es un reparto, y ahí una devolución va al final.
 *
 * El porcentaje pasa por `shareOf`, la única definición de «porcentaje sobre un total» de esta
 * cara del módulo —la que ya comparten las dos columnas del anexo y la ficha—, así que hereda que
 * un total `null` o `0` dé `null` y jamás `0 %`.
 */
export function buildAccountBreakdown(
  entries: readonly AmountEntry[],
  options: { total: number | null; hasChildren: (code: string) => boolean; max?: number },
): AccountBreakdown {
  const moving = entries.filter((entry) => entry.value !== 0);
  const all = [...moving]
    .sort((a, b) => b.value - a.value)
    .map((entry) => ({
      ...entry,
      share: shareOf(entry.value, options.total),
      hasChildren: options.hasChildren(entry.code),
    }));
  const max = options.max ?? BREAKDOWN_MAX_ROWS;
  const sum = moving.reduce((total, entry) => total + entry.value, 0);

  return {
    rows: all.slice(0, max),
    all,
    idle: entries.length - moving.length,
    hidden: Math.max(0, all.length - max),
    total: options.total,
    balances: options.total === null || Math.abs(sum - options.total) < CENT,
  };
}

/**
 * La nota al pie del desglose, en castellano llano.
 *
 * Abre SIEMPRE diciendo contra qué se mide el porcentaje, con la cifra: un «51.5 %» que no dice de
 * qué es el 51.5 % obliga a deducir el denominador del título de la ventana, y esa es la clase de
 * cuenta que nadie hace y todos dan por hecha. Es la misma regla por la que la nota del anexo abre
 * con su cuadre y por la que `describeShares` nombra la base de cada porcentaje anotado.
 *
 * Lo demás va después y solo cuando toca: lo que se quedó fuera del dibujo —porque explica que la
 * tabla tenga más filas que barras—, lo parado, y el CUADRE solo cuando NO cuadra, ya que afirmar
 * «suman el total» cada vez sería ruido en el caso normal, que es todos.
 */
export function describeAccountBreakdown(
  breakdown: AccountBreakdown,
  options: { label: string; format: (value: number) => string },
): string {
  const parts: string[] = [];
  parts.push(
    breakdown.total === null
      ? `Los porcentajes son la parte de ${options.label} que representa cada cuenta.`
      : `Los porcentajes son la parte de ${options.label} (${options.format(breakdown.total)}) que representa cada cuenta.`,
  );
  if (breakdown.hidden > 0) {
    parts.push(
      `Se dibujan las ${breakdown.rows.length} mayores; la tabla lista las ${breakdown.all.length}.`,
    );
  }
  if (breakdown.idle > 0) {
    parts.push(
      `${breakdown.idle} ${breakdown.idle === 1 ? "cuenta no se movió" : "cuentas no se movieron"} en el tramo.`,
    );
  }
  if (!breakdown.balances && breakdown.total !== null) {
    const sum = breakdown.all.reduce((total, entry) => total + entry.value, 0);
    parts.push(
      `Sus cuentas suman ${options.format(sum)} y la cuenta declara ${options.format(breakdown.total)}: la diferencia son ${options.format(sum - breakdown.total)}.`,
    );
  }
  return parts.join(" ");
}
