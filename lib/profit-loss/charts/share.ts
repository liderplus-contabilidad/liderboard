/**
 * Lo que una cuenta marcada ocupa dentro de OTRA cuenta marcada que la contiene.
 *
 * Marcar «4 Ingresos» y «4.1 Ventas» a la vez ya no es solo comparar dos barras: la pregunta que
 * produce esa marca es qué parte de la primera es la segunda. Aquí se responde una sola vez, en
 * puro, y el resultado viaja a la etiqueta de la barra, al tooltip y a la línea que explica la
 * tarjeta — tres lecturas del mismo número en vez de tres cálculos que pueden separarse.
 *
 * La base es el **ancestro marcado más cercano**, a cualquier profundidad. Eso es lo que hace
 * que marcar «4» y «4.1.01» saltándose el nivel intermedio siga dando una lectura, y lo que
 * acierta con dos familias marcadas a la vez (`4`, `4.1`, `5`, `5.1`) sin una cláusula aparte:
 * cada hija cae dentro de la suya. Se camina `parentByCode`, que es la parentela del ÁRBOL y no
 * la del prefijo con puntos — la misma que sigue `ancestorPath`, así que una cuenta huérfana se
 * mide dentro de donde la tabla la dibuja anidada.
 *
 * La división no se reescribe: se le cuelga a la serie ese ancestro como `container` y se pasa
 * por `toPctOfContainer`, la única definición de «porcentaje sobre el contenedor» del módulo. De
 * ahí hereda las dos reglas que importan — un periodo sin cobertura y una base en `0` dan `null`,
 * nunca `0 %`.
 */
import { toPctOfContainer } from "../analytics/structure";
import { seriesKeyId, type AnalyticsSource, type Series } from "../analytics/types";

/** El porcentaje de una serie dentro de la cuenta marcada que la contiene. */
export interface MarkedShare {
  /** `seriesKeyId` de la serie hija — con lo que la etiqueta y el tooltip la reconocen. */
  seriesId: string;
  /** Nombre de la cuenta hija en el plan, para la frase que explica la tarjeta. */
  label: string;
  /**
   * Nombre de la cuenta base en el PLAN, nunca la etiqueta de su serie: con varios centros
   * marcados esa etiqueta sería «Ingresos · Restaurante», y como la base siempre es del mismo
   * centro que la hija, nombrarlo no desambigua nada y solo alarga.
   */
  baseLabel: string;
  /** Un porcentaje por periodo, en el orden del eje; `null` donde no se puede dividir. */
  values: (number | null)[];
}

/**
 * Las series que caen dentro de otra de la misma tanda, en el orden en que se dibujan. Una serie
 * sin ancestro marcado no aparece: no hay porcentaje que inventarle, y marcar «4» y «5» tiene que
 * dejar la gráfica exactamente como estaba.
 */
export function markedShares(
  series: readonly Series[],
  sources: readonly AnalyticsSource[],
): MarkedShare[] {
  const sourceOf = new Map(
    sources.map((source) => [sourceId(source.centerId, source.year), source]),
  );

  // Las marcas se agrupan por (centro, año) porque una serie solo puede medirse dentro de una
  // base DIBUJADA A SU LADO: el 4.1 del restaurante no es la base del 4.1.01 de la bodega.
  const markedBy = new Map<string, Map<string, Series>>();
  for (const entry of series) {
    const id = sourceId(entry.key.centerId, entry.key.year);
    const byCode = markedBy.get(id) ?? new Map<string, Series>();
    byCode.set(entry.key.code, entry);
    markedBy.set(id, byCode);
  }

  const shares: MarkedShare[] = [];
  for (const entry of series) {
    const id = sourceId(entry.key.centerId, entry.key.year);
    const source = sourceOf.get(id);
    const marked = markedBy.get(id);
    if (!source || !marked) {
      continue;
    }

    const base = nearestMarkedAncestor(source, entry.key.code, marked);
    if (!base) {
      continue;
    }

    const baseLabel = nameOf(source, base.key.code);
    const measured = toPctOfContainer({
      ...entry,
      container: { code: base.key.code, label: baseLabel, points: base.points },
    });

    shares.push({
      seriesId: seriesKeyId(entry.key),
      label: nameOf(source, entry.key.code),
      baseLabel,
      values: measured.points.map((point) => point.value),
    });
  }

  return shares;
}

/**
 * Qué se mide dentro de qué, en castellano llano y bajo la tarjeta.
 *
 * La barra lleva solo el número porque «28.4 % de Ingresos» no cabe en doce columnas, y un `28.4 %`
 * suelto no dice de quién es en cuanto hay dos niveles de padre en la misma columna. Esta línea es
 * lo que cierra ese hueco, y el tooltip lo repite barra por barra.
 *
 * Un par de cuentas se nombra UNA vez aunque se repita en varios centros: con cuatro centros
 * marcados la frase diría cuatro veces lo mismo.
 */
export function describeShares(shares: readonly MarkedShare[]): string | undefined {
  const pairs: string[] = [];
  const seen = new Set<string>();

  for (const share of shares) {
    const pair = `${share.label} dentro de ${share.baseLabel}`;
    if (seen.has(pair)) {
      continue;
    }
    seen.add(pair);
    pairs.push(pair);
  }

  return pairs.length > 0
    ? `El porcentaje de cada barra es lo que la cuenta ocupa dentro de la marcada que la contiene: ${pairs.join("; ")}.`
    : undefined;
}

function sourceId(centerId: string, year: number): string {
  return `${centerId}|${year}`;
}

function nameOf(source: AnalyticsSource, code: string): string {
  return source.namesByCode.get(code) ?? code;
}

/** Sube por el árbol hasta la primera cuenta que también esté marcada; `undefined` si no hay. */
function nearestMarkedAncestor(
  source: AnalyticsSource,
  code: string,
  marked: ReadonlyMap<string, Series>,
): Series | undefined {
  let current = source.parentByCode.get(code);
  while (current !== undefined) {
    const found = marked.get(current);
    if (found) {
      return found;
    }
    current = source.parentByCode.get(current);
  }
  return undefined;
}
