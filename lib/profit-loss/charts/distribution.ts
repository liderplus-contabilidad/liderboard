/**
 * De qué está hecha una cuenta, PERIODO A PERIODO — las hijas apiladas bajo el total del padre.
 *
 * Es la tercera lectura de la composición y no repite ninguna de las dos anteriores: la dona dice
 * de qué se compone el tramo entero y el ranking cuáles son las más grandes, pero ninguna dice si
 * una hija está ganando peso mes a mes, que es la pregunta que produce una barra apilada.
 *
 * Dos decisiones viven aquí porque pueden estar mal y por eso se prueban:
 *
 * - **Qué cuenta se distribuye.** La figura de `resolveActiveCenterId` por quinta vez: exactamente
 *   una cuenta marcada es esa cuenta, ninguna o varias es Ingresos. Y luego DESCIENDE mientras
 *   haya una sola hija — un plan real encadena `4 → 4.1` y `5 → 5.1`, así que la distribución de
 *   la raíz sería un apilado de un solo segmento, que no es un apilado.
 * - **Qué se dibuja de las hijas.** La paleta tiene ocho ranuras y no cicla, así que pasadas ocho
 *   la cola se pliega en «Otros» — ordenando ANTES de cortar, como el ranking, porque cortar por
 *   orden de archivo dejaría fuera a la mayor. Las que no se mueven en todo el tramo se van y se
 *   dicen: un estado declara cada cuenta de su plan tenga o no movimiento, y diez leyendas en cero
 *   entierran a la que importa.
 *
 * La línea del total NO es el techo del apilado y por eso existe: `4.1.4 Rebajas y/o Descuentos`
 * es una cuenta de ingreso con saldo negativo, que se apila hacia abajo, así que el total neto no
 * está en ningún borde de la pila. Con «Otros» plegado sigue siendo el total de verdad.
 */
import { CHART_DISTRIBUTION_MAX, colorForDistributionSlot } from "@/lib/charts/palette";
import type { AnalyticsSource, Series, SeriesKey, SeriesPoint } from "../analytics/types";
import { childrenOf, seriesTotal } from "./presets";
import { DEFAULT_FOCUS_CODE } from "./selection";

/** El código de la serie sintética que recoge la cola. No colisiona: ninguna cuenta se llama así. */
export const DISTRIBUTION_OTHERS_CODE = "otras-cuentas";

/** La cuenta que se distribuye: su código y su nombre en el plan. */
export interface DistributionParent {
  code: string;
  label: string;
}

export interface Distribution {
  /** Las hijas dibujadas, de mayor a menor y con «Otros» cerrando la pila. */
  series: Series[];
  /** Cuántas hijas se plegaron en «Otros» — dicho, nunca recortado en silencio. */
  grouped: number;
  /** Cuántas quedaron fuera por no moverse en todo el tramo. */
  idle: number;
}

/**
 * La cuenta cuya distribución se dibuja, o `null` cuando no hay ninguna que distribuir — la
 * marcada es una cuenta de movimiento, o la fuente no trae Ingresos.
 */
export function resolveDistributionParent(
  source: AnalyticsSource | undefined,
  markedCodes: readonly string[],
): DistributionParent | null {
  if (!source) {
    return null;
  }

  const start = markedCodes.length === 1 ? markedCodes[0] : DEFAULT_FOCUS_CODE;
  if (!source.valuesByCode.has(start)) {
    return null;
  }

  // Se baja por la cadena de hija única: `4 → 4.1` no es una distribución, es la misma cifra con
  // otro nombre. Se para en cuanto hay dos o más, que es donde empieza a haber algo que repartir.
  let code = start;
  let children = childrenOf(source, code);
  while (children.length === 1) {
    code = children[0];
    children = childrenOf(source, code);
  }

  return children.length > 0 ? { code, label: source.namesByCode.get(code) ?? code } : null;
}

/**
 * Las hijas que la pila dibuja: sin las paradas, ordenadas de mayor a menor y con la cola plegada
 * en «Otros» cuando no caben en la escala. `limit` es cuántas series salen en total, «Otros»
 * incluida — la línea del total no gasta paso, porque va en tinta y no en color de la escala.
 */
export function foldDistribution(
  series: readonly Series[],
  limit: number = CHART_DISTRIBUTION_MAX,
): Distribution {
  const totals = series.map((entry) => ({ entry, total: seriesTotal(entry) }));
  const moving = totals.filter(
    (candidate): candidate is { entry: Series; total: number } =>
      candidate.total !== null && candidate.total !== 0,
  );
  const idle = totals.length - moving.length;
  const ranked = [...moving].sort((a, b) => b.total - a.total).map((candidate) => candidate.entry);

  if (ranked.length <= limit) {
    return { series: ranked, grouped: 0, idle };
  }

  const kept = ranked.slice(0, limit - 1);
  const folded = ranked.slice(limit - 1);
  return { series: [...kept, othersSeries(folded)], grouped: folded.length, idle };
}

/**
 * El color de cada segmento por su LUGAR en la pila, que aquí es su tamaño — y no por la entidad,
 * que es la regla del resto de la app.
 *
 * No es una excepción caprichosa: `colorForEntity` existe para que quitar una serie no repinte a
 * las demás, y eso importa cuando lo comparado son entidades que van y vienen de la gráfica. Estos
 * segmentos no van y vienen: son el reparto ENTERO de una cuenta, siempre completo y siempre
 * ordenado, así que el único orden estable posible es el del reparto. Pedirle a este color que
 * siguiera al código sería además pedirle que dejara de decir lo único que dice, que es el rango.
 */
export function distributionColor(series: readonly Series[]): (key: SeriesKey) => string {
  const slotByCode = new Map(series.map((entry, index) => [entry.key.code, index]));
  return (key) => colorForDistributionSlot(slotByCode.get(key.code) ?? -1);
}

/**
 * La cola como una serie más. Suma punto a punto por ÍNDICE porque todas vienen de una misma
 * tanda y comparten eje; un periodo que ninguna cubre sigue siendo `null` y no un cero inventado.
 */
function othersSeries(folded: readonly Series[]): Series {
  const first = folded[0];
  const points: SeriesPoint[] = first.points.map((point, index) => {
    let value: number | null = null;
    for (const entry of folded) {
      const candidate = entry.points[index]?.value;
      if (candidate !== null && candidate !== undefined) {
        value = (value ?? 0) + candidate;
      }
    }
    return { period: point.period, value };
  });

  return {
    key: { code: DISTRIBUTION_OTHERS_CODE, centerId: first.key.centerId, year: first.key.year },
    label: "Otros",
    points,
    container: null,
  };
}
