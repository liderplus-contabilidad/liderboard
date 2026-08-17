/**
 * The cards of Gráficos and Análisis, as DATA rather than as markup.
 *
 * These lists used to be assembled inline in each view, which was fine while the screen was
 * their only reader. It stops being fine the moment a second one — the printable report — has to
 * show the same cards: two assemblies of one question drift, and when they do, the screen states
 * one figure and the report another with nothing able to say which is right.
 *
 * Everything below the surface here is already pure and tested (the engine, the presets, the
 * option builders, the palette). What lives in this module is only the glue: WHICH question each
 * card asks, in what order, and with what words — the part that had no tests at all.
 *
 * The functions take `(context, filters)` and nothing else. `runQuery` in the provider is just
 * `buildSeries(sources, query)` and the context already carries those sources, so injecting it
 * would only open the door to a caller reading series from somewhere other than the context —
 * exactly the divergence this module exists to close.
 */
import {
  CHART_COMPOSITION_MAX,
  CHART_MAX_SERIES,
  colorForCompositionSlot,
  colorForEntity,
} from "@/lib/charts/palette";
import type { ChartCardSpec, ChartTable } from "@/lib/charts/types";
import { periodLabel, periodRangeLabel } from "../analytics/period";
import { buildSeries } from "../analytics/series";
import { toPareto, toPieSlices, type AmountEntry, type ParetoResult } from "../analytics/structure";
import type { AnalyticsSource, PeriodRef, SeriesBundle } from "../analytics/types";
import { compareSeries } from "../analytics/variation";
import type { PygFilters } from "../filters";
import {
  buildBusinessLines,
  describeBusinessLines,
  columnsByCategory,
  columnsByCenter,
  readByPeriod,
  readTotal,
  sumBusinessLines,
  type BusinessLineSet,
} from "./business-lines";
import { BUSINESS_LINES_PRESET } from "./preset-views";
import {
  distributionColor,
  distributionShares,
  foldDistribution,
  resolveDistributionParent,
} from "./distribution";
import {
  categoryBarOption,
  categoryTable,
  entryTable,
  horizontalBarOption,
  paretoOption,
  pieOption,
  seriesOptionFor,
  seriesTableFor,
  signColorOf,
  stackedTotalOption,
  stackedTotalTable,
  variationBarOption,
  waterfallOption,
  waterfallTable,
} from "./option";
import {
  amountsOver,
  childrenOf,
  compositionQuery,
  coveredPeriods,
  excludedNote,
  expenseRootsOf,
  intersectWithMarked,
  lastCoveredIndex,
  leavesOf,
  leavesOfAny,
  presetQuery,
  REVENUE_ROOT,
  seriesTotal,
  sumOver,
  topByMagnitude,
  topEntries,
} from "./presets";
import {
  activeSource,
  codeColorResolver,
  colorResolver,
  expandSlots,
  toSeriesQuery,
  type SelectionContext,
} from "./selection";
import { describeShares, markedShares } from "./share";
import { buildWaterfall } from "./waterfall";

const EMPTY_TABLE: ChartTable = { columns: [], rows: [] };

/** One of the closing figures above the cards. The VALUE is a number: formatting is the view's. */
export interface CardTile {
  id: string;
  label: string;
  /** `null` is no coverage, and must render as an empty tile — never as `$0`. */
  value: number | null;
  /** Only the result carries one; it always travels with its own glyph, never as color alone. */
  sign?: "positivo" | "negativo";
}

export interface GraficosCards {
  /** The periods the figures sum, in axis order; empty when nothing is covered. */
  periods: PeriodRef[];
  periodName: string;
  tiles: CardTile[];
  cards: ChartCardSpec[];
}

export interface AnalisisCards {
  periods: PeriodRef[];
  periodName: string;
  cards: ChartCardSpec[];
}

/** How a set of covered periods is named on screen; nothing covered is not a range. */
function nameOf(periods: readonly PeriodRef[]): string {
  return periods.length > 0 ? periodRangeLabel(periods) : "Sin movimiento";
}

/**
 * Entry-based cards color by account code, ordered by the list the card ACTUALLY draws — which
 * is why every caller below ranks and cuts before calling this. Resolving colors against the
 * unranked list hands the first drawn bar whatever slot its position in the file earned it.
 */
export function entryColor(codes: string[]): (code: string) => string {
  const resolve = codeColorResolver(codes);
  return (code) => resolve({ code, centerId: "", year: 0 });
}

/**
 * El color de una porción de la tarta de composición por su LUGAR en el reparto, no por su código.
 *
 * `entryColor` no sirve aquí aunque la lista ya venga ordenada: lo que hace es repartir las ranuras
 * de `CHART_PALETTE`, que es el set de IDENTIDAD, y esta tarta tiene el suyo. La firma lo pidió
 * cálido —ver `CHART_COMPOSITION_PALETTE`, donde está medido por qué no son los tonos exactos de la
 * referencia que trajeron—. La gemela en tabla lo consume TAMBIÉN, que es lo que mantiene el punto
 * de color de cada fila igual al de su porción.
 */
export function compositionColor(codes: string[]): (code: string) => string {
  const slotByCode = new Map(codes.map((code, index) => [code, index]));
  return (code) => colorForCompositionSlot(slotByCode.get(code) ?? -1);
}

/** The change of each account against the previous period, signed. */
export function variationEntries(bundle: SeriesBundle, index: number): AmountEntry[] {
  if (index <= 0) {
    return [];
  }
  return bundle.series
    .map((series) => {
      const points = compareSeries(series, { kind: "periodo-anterior" });
      return {
        code: series.key.code,
        label: series.label,
        value: points[index]?.deltaAbs ?? null,
      };
    })
    .filter((entry): entry is AmountEntry => entry.value !== null);
}

/**
 * What the evolution card falls back to with no account marked: Ingresos against every expense
 * root the statement carries — one of them until «Segmentar gastos» adds the non-operating.
 */
function defaultEvolutionCodes(source: AnalyticsSource | undefined): string[] {
  return [REVENUE_ROOT, ...expenseRootsOf(source)];
}

/**
 * Suma una lista de totales que pueden no existir: `null` es «no cubierto» y no cuenta, pero una
 * lista ENTERA sin cobertura sigue siendo `null` — la diferencia entre un total de cero y no tener
 * total, que es la regla del motor y no puede romperse justo en la línea que declara el cuadre.
 */
function addTotals(values: readonly (number | null)[]): number | null {
  return values.reduce<number | null>(
    (total, value) => (value === null ? total : (total ?? 0) + value),
    null,
  );
}

/** A card only carries `note` when there is one; an explicit `undefined` is a different shape. */
function withNote(note: string | undefined): { note?: string } {
  return note === undefined ? {} : { note };
}

/**
 * What the Pareto left out, in one line. The cut is SAID, like the ranking's: a list silently
 * truncated reads as the whole list, and here the truncation is dozens of accounts.
 */
function paretoNote(pareto: ParetoResult): string | undefined {
  const parts = [
    pareto.truncated > 0
      ? `Se muestran las ${pareto.entries.length} cuentas que más concentran; ${pareto.truncated} quedaron fuera.`
      : "",
    excludedNote(pareto.excluded, "Sin acumular") ?? "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

/**
 * La tarjeta de cabecera cuando se lee por LÍNEAS DE NEGOCIO — con las CATEGORÍAS en el eje X.
 *
 * El eje va girado respecto del resto de la app, y esa es la decisión de la tarjeta. Con los meses
 * en el eje, las cinco categorías que no son hospedaje comparten grupo con una barra cien veces
 * mayor: quedan aplastadas contra el eje, sin rótulo propio y sin sitio para su cifra. Girándolo,
 * cada categoría tiene su hueco y su nombre aunque su barra mida dos píxeles.
 *
 * Lo que se compara DENTRO de cada categoría no se declara: sale de lo que está marcado, la misma
 * figura del módulo entero. Varios centros marcados dibujan una barra por establecimiento —que es
 * la tabla del contador, categoría × sucursal, en un solo gráfico—; si no, cada periodo cubierto es
 * una barra, y cuando son más de los que la paleta admite se cierra en una sola barra por categoría
 * con el total del tramo, que además es la única lectura donde cada barra imprime su cifra encima.
 */
function businessLineCard(
  set: BusinessLineSet,
  bundle: SeriesBundle,
  periodName: string,
  centers: readonly { id: string; label: string }[],
  omitted: readonly string[],
): ChartCardSpec {
  // Se suma CENTRO A CENTRO, siempre — también con uno solo. La tanda trae una serie por (cuenta,
  // centro), así que una suma que las indexe por código se queda con la última y habla de un solo
  // establecimiento: las barras dirían cinco hoteles y el cuadre uno, y la nota declararía medio
  // millón «sin clasificar» que en realidad está dibujado.
  const byCenter = centers.map((center) => ({
    ...center,
    summed: sumBusinessLines(
      bundle.series.filter((entry) => entry.key.centerId === center.id),
      set.lines,
    ).series,
  }));
  const drawnCodes = new Set(
    byCenter.flatMap((center) => center.summed.map((entry) => entry.key.code)),
  );
  const balance = {
    lines: addTotals(
      byCenter.flatMap((center) => center.summed.map((entry) => seriesTotal(entry))),
    ),
    section: addTotals(set.sectionCodes.map((code) => sumAllOver(bundle, code))),
    excluded: addTotals(set.excluded.map((entry) => sumAllOver(bundle, entry.code))),
    idle: set.lines.length - drawnCodes.size,
  };

  // Con varios centros cada columna del eje es un par (categoría, establecimiento) —la forma de la
  // hoja del contador—, y las barras de dentro siguen siendo los periodos: las dos lecturas
  // conviven en el mismo gráfico en vez de turnarse.
  const columns =
    centers.length > 1
      ? columnsByCenter(byCenter, set.lines)
      : columnsByCategory(byCenter[0]?.summed ?? []);
  // Los periodos CUBIERTOS, no el eje entero: un año cargado hasta mayo compara cinco barras por
  // categoría —el gráfico que la firma dibuja a mano—, y en cuanto pasa de las ocho ranuras de la
  // paleta se cierra en una sola barra por categoría con el total, que es además la única lectura
  // donde cada barra imprime su cifra encima.
  const marks = bundle.periods
    .map((period, index) => ({ index, label: periodLabel(period) }))
    .filter((mark) => columns.some((column) => column.series.points[mark.index]?.value != null));
  const reading =
    marks.length > 1 && marks.length <= CHART_MAX_SERIES
      ? readByPeriod(columns, marks)
      : readTotal(columns, marks.length === 1 ? marks[0].label : periodName);
  const order = reading.series.map((entry) => entry.id);
  const context = { colorOf: (id: string) => colorForEntity(id, order) };

  // El subtítulo cuenta LÍNEAS, no columnas: con tres centros marcados, «10 líneas» sería falso —
  // son cuatro líneas vistas en tres establecimientos.
  const drawnLines = new Set(columns.map((column) => column.series.key.code)).size;
  const subtitle =
    centers.length > 1
      ? `${drawnLines} ${drawnLines === 1 ? "línea" : "líneas"} × ${centers.length} centros · ${periodName}`
      : `${drawnLines} ${drawnLines === 1 ? "línea" : "líneas"} · ${periodName}`;

  const drawn = reading.categories.length > 0 && reading.series.length > 0;
  return {
    id: "evolucion",
    title: "Ventas por línea de negocio",
    subtitle,
    option: drawn
      ? categoryBarOption(reading.categories, reading.series, context, reading.groups)
      : null,
    table: drawn
      ? categoryTable(reading.categories, reading.series, context, reading.groups)
      : EMPTY_TABLE,
    warnings: bundle.warnings,
    ...withNote(
      [
        describeBusinessLines(set, balance),
        // Por qué Hospedaje enseña tres establecimientos y no los cinco marcados: los otros dos no
        // venden hospedaje. Sin decirlo, una columna que falta se lee como un dato que falta.
        centers.length > 1 && columns.length < drawnLines * centers.length
          ? "Un establecimiento sin ventas en una línea no abre columna."
          : "",
        // Por qué doce meses marcados dibujan UNA barra: la paleta tiene ocho colores. Se dice con
        // lo que hay que hacer para volver a verlos uno a uno, no solo con el motivo.
        marks.length > CHART_MAX_SERIES
          ? `Con más de ${CHART_MAX_SERIES} periodos marcados cada columna muestra el total del tramo; desmarca alguno en «Periodo» para compararlos uno a uno.`
          : "",
        omitted.length > 0 && centers.length > 1
          ? `${omitted.join(" y ")} no entra en el reparto por establecimiento; márcalo en «Centro de costo» para incluirlo.`
          : "",
      ]
        .filter(Boolean)
        .join(" ") || undefined,
    ),
    height: 300,
  };
}

/**
 * Una cuenta sumada sobre TODAS las series que la traen, que con varios centros en juego son
 * varias. `sumOver` devuelve la primera, y con eso el cuadre de la nota hablaría de un solo
 * establecimiento mientras las barras hablan de cinco.
 */
function sumAllOver(bundle: SeriesBundle, code: string): number | null {
  return addTotals(
    bundle.series.filter((entry) => entry.key.code === code).map((entry) => seriesTotal(entry)),
  );
}

/**
 * Gráficos answers *how much and of what*: amounts per period, comparisons between accounts and
 * centers, composition of a total.
 *
 * A figure here is the TOTAL of the periods the filter bar left in play — six months marked is a
 * six-month figure, and with nothing marked it is the whole covered year, which is what the
 * cascade beside it already declared it was summing. Reading a single closing column was what the
 * tab did back when there was no «Periodo» filter and the last loaded month was the only period
 * anyone could speak of.
 *
 * That span is resolved ONCE and travels out with the list. A statement whose revenue stops in
 * July but keeps booking a small cost through December has coverage to December; if each card
 * resolved its own, one subtitle would read «Ene–Jul» and the next «Ene–Dic» over the same
 * screen. Returning it alongside makes that unicity structural instead of a convention.
 */
export function buildGraficosCards(context: SelectionContext, filters: PygFilters): GraficosCards {
  const sources = [...context.sources];
  const runQuery = (query: Parameters<typeof buildSeries>[1]) => buildSeries(sources, query);
  const source = activeSource(context);
  // A marked period is a year-less slot; the engine reads dated references. Gráficos still reads
  // ONE year (`context.year`), so the expansion has a single year to stamp.
  const periodRefs = expandSlots(filters.periods, [context.year]);

  const defaultCodes = defaultEvolutionCodes(source);
  const totals = runQuery(presetQuery(defaultCodes, context, { periods: periodRefs }));
  const periods = coveredPeriods(totals);
  const periodName = nameOf(periods);

  const revenue = sumOver(totals, REVENUE_ROOT);
  const expenseParts = defaultCodes.slice(1).map((root) => sumOver(totals, root));
  const expense = expenseParts.every((value) => value === null)
    ? null
    : expenseParts.reduce((sum: number, value) => sum + (value ?? 0), 0);
  const result = revenue !== null && expense !== null ? revenue - expense : null;

  // The evolution card draws the marked accounts (and centers); with nothing marked it falls
  // back to Ingresos vs Costos y Gastos — the same totals the tiles read.
  const evolutionCodes = filters.codes.length > 0 ? filters.codes : defaultCodes;
  const evolutionFilters = { ...filters, codes: evolutionCodes };
  const evolution = runQuery(toSeriesQuery(evolutionFilters, context));
  // Marcar una cuenta y otra que la contiene no es solo comparar dos barras: la pregunta que
  // produce esa marca es qué parte de la primera es la segunda. El porcentaje se calcula UNA vez
  // y de ahí salen las tres lecturas — la etiqueta de la barra, el tooltip y la nota al pie.
  const shares = markedShares(evolution.series, sources);
  const evolutionContext = {
    colorOf: colorResolver(evolutionFilters, context),
    periods: evolution.periods,
    shares: new Map(shares.map((share) => [share.seriesId, share])),
  };

  // La primera tarjeta responde UNA de dos preguntas, nunca las dos: qué comparan las cuentas
  // marcadas, o —con una vista predeterminada elegida— lo que esa vista presenta. Que sean
  // excluyentes lo garantiza `filters.ts`; aquí solo se elige, y un plan que no declara líneas
  // deja la marca inerte en vez de vaciar la tarjeta.
  const lineSet = filters.preset === BUSINESS_LINES_PRESET ? buildBusinessLines(source) : null;
  // La consulta lleva, además de las cuentas miembro, las EXCLUIDAS y la sección entera: son las
  // dos cifras con las que la nota cuadra la lectura contra el estado, y pedirlas aparte abriría la
  // puerta a cuadrar contra un tramo distinto del que dibujan las barras.
  // Qué establecimientos dibuja la vista: los MARCADOS, que al encenderla son todos los reales
  // porque `withPresetSelected` los siembra — así lo dibujado y lo marcado son lo mismo y se quita
  // uno desmarcándolo. Desmarcarlos todos vuelve al centro resuelto, la regla de siempre. Es la
  // única tarjeta que lee varios centros a la vez, y por eso la consulta los pide aquí.
  const lineCenters = filters.centerIds.length > 0 ? filters.centerIds : [context.activeCenterId];
  // Lo que el reparto deja fuera se DICE: son dólares que estaban en el consolidado y ya no están
  // en ninguna columna. El cajón del sistema contable es el único que la vista deja fuera sola —el
  // resto de ausencias son desmarcados a la vista, en el propio desplegable.
  const omittedCenters = context.centers.filter(
    (center) => center.kind === "sin-centro" && !lineCenters.includes(center.id),
  );
  const lineBundle =
    lineSet && lineSet.lines.length > 0
      ? runQuery(
          compositionQuery(
            [
              ...lineSet.lines.flatMap((line) => line.codes),
              ...lineSet.excluded.map((entry) => entry.code),
              ...lineSet.sectionCodes,
            ],
            context,
            { periods: periodRefs, centerIds: lineCenters },
          ),
        )
      : null;
  const centerLabels = new Map(context.sources.map((entry) => [entry.centerId, entry.centerName]));

  // Distribución: de qué está hecha una cuenta, periodo a periodo. La cuenta la resuelve la misma
  // figura que el centro y el año — exactamente una marcada es esa, ninguna o varias es Ingresos —
  // y sus hijas se consultan SIN tope, porque plegar la cola en «Otros» exige verlas todas antes.
  const parent = resolveDistributionParent(source, filters.codes);
  const childCodes = parent ? childrenOf(source, parent.code) : [];
  const children = runQuery(compositionQuery(childCodes, context, { periods: periodRefs }));
  const distribution = foldDistribution(children.series);
  // El total viaja por su propia consulta y no re-sumando las barras: con «Otros» plegado o una
  // hija negativa, el techo de la pila y el total de la cuenta no son el mismo número.
  const parentTotal = parent
    ? (runQuery(presetQuery([parent.code], context, { periods: periodRefs })).series[0] ?? null)
    : null;
  // El monto lo dice la línea, una vez por columna; lo que la pila añade es qué PARTE de él es
  // cada hija, y ese reparto se calcula una sola vez para la etiqueta y el tooltip.
  const shareOfParent =
    parent && parentTotal ? distributionShares(distribution.series, parentTotal, parent.label) : [];
  const distributionContext = {
    colorOf: distributionColor(distribution.series),
    periods: children.periods,
    shares: new Map(shareOfParent.map((share) => [share.seriesId, share])),
  };
  const distributionNote = parent
    ? [
        distribution.series.length > 0
          ? `La línea es el total de ${parent.label}; las barras, sus cuentas hijas, con el porcentaje que cada una ocupa dentro de él.`
          : "",
        distribution.grouped > 0
          ? `«Otros» agrupa ${distribution.grouped} cuentas más pequeñas.`
          : "",
        distribution.idle > 0
          ? `${distribution.idle} ${distribution.idle === 1 ? "cuenta quedó fuera" : "cuentas quedaron fuera"} por no tener movimiento en ${periodName.toLowerCase()}.`
          : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "Marca UNA cuenta con desglose en «Cuenta contable» para ver de qué está hecha.";

  // Composición y ranking conservan su pregunta fija, pero intersecan su universo con las
  // cuentas marcadas — una cuenta de gasto marcada vacía la composición de ingresos a propósito.
  const revenueLeaves = leavesOf(source, REVENUE_ROOT);
  const compositionCodes = intersectWithMarked(revenueLeaves, filters.codes);
  const composition = runQuery(
    compositionQuery(compositionCodes, context, { periods: periodRefs }),
  );
  // El corte lo declara la escala, no un número suelto: así «Otros» cae siempre en la última
  // ranura y ninguna porción se queda sin tono.
  const slices = toPieSlices(amountsOver(composition), { maxSlices: CHART_COMPOSITION_MAX });
  const sliceColor = compositionColor(slices.slices.map((slice) => slice.code));
  const compositionEmptyNote =
    revenueLeaves.length > 0 && compositionCodes.length === 0
      ? "El filtro de cuentas marcadas no incluye ninguna cuenta de Ingresos."
      : undefined;

  // Ranking of expenses: sorted BEFORE the cut, so the largest cannot fall off the list — and
  // before the colors, so the first bar drawn takes the first slot.
  const expenseLeaves = leavesOfAny(source, defaultCodes.slice(1));
  const rankingCodes = intersectWithMarked(expenseLeaves, filters.codes);
  const expenses = runQuery(compositionQuery(rankingCodes, context, { periods: periodRefs }));
  const ranking = topEntries(amountsOver(expenses));
  const rankingColor = entryColor(ranking.entries.map((entry) => entry.code));
  const rankingEmptyNote =
    expenseLeaves.length > 0 && rankingCodes.length === 0
      ? "El filtro de cuentas marcadas no incluye ninguna cuenta de Costos y Gastos."
      : undefined;

  // The cascade names the range it actually summed, taken from the coverage and never from the
  // file's year: a statement reaching July is «Ene–Jul», and calling it the year overstates
  // every step. No steps means no covered period at all — it says so rather than drawing a row
  // of bars at zero, which would read as a business that billed nothing.
  const waterfall = source
    ? buildWaterfall(source, {
        frequency: context.frequency,
        ...(periodRefs.length > 0 ? { periods: periodRefs } : {}),
      })
    : null;
  const steps = waterfall?.steps ?? [];
  const range = periodRangeLabel(waterfall?.periods ?? []);

  return {
    periods,
    periodName,
    tiles: [
      { id: "ingresos", label: "Ingresos", value: revenue },
      { id: "gastos", label: "Costos y Gastos", value: expense },
      {
        id: "resultado",
        label: result !== null && result < 0 ? "Pérdida" : "Utilidad",
        value: result,
        ...(result === null ? {} : { sign: result < 0 ? "negativo" : ("positivo" as const) }),
      },
    ],
    cards: [
      lineSet && lineBundle
        ? businessLineCard(
            lineSet,
            lineBundle,
            periodName,
            lineCenters.map((id) => ({ id, label: centerLabels.get(id) ?? id })),
            omittedCenters.map((center) => center.name),
          )
        : {
            id: "evolucion",
            title: filters.codes.length > 0 ? "Comparación" : "Ingresos contra Costos y Gastos",
            subtitle: `${evolution.series.length} ${evolution.series.length === 1 ? "serie" : "series"} · ${periodName}`,
            option:
              evolution.series.length > 0
                ? seriesOptionFor("barras", evolution.series, evolutionContext)
                : null,
            table: seriesTableFor("barras", evolution.series, evolutionContext),
            warnings: evolution.warnings,
            ...withNote(describeShares(shares)),
            height: 300,
          },
      {
        id: "distribucion",
        title: parent ? `Distribución de ${parent.label}` : "Distribución de una cuenta",
        subtitle: `${distribution.series.length} ${distribution.series.length === 1 ? "cuenta" : "cuentas"} · ${periodName}`,
        option:
          distribution.series.length > 0 && parentTotal
            ? stackedTotalOption(distribution.series, parentTotal, distributionContext)
            : null,
        table:
          distribution.series.length > 0 && parentTotal
            ? stackedTotalTable(distribution.series, parentTotal, distributionContext)
            : EMPTY_TABLE,
        warnings: children.warnings,
        ...withNote(distributionNote || undefined),
        height: 320,
      },
      {
        id: "composicion",
        title: "Composición de los ingresos",
        subtitle: periodName,
        option:
          slices.slices.length > 0 ? pieOption(slices, { colorOf: sliceColor, donut: true }) : null,
        table:
          slices.slices.length > 0
            ? entryTable(slices.slices, { colorOf: sliceColor })
            : EMPTY_TABLE,
        warnings: composition.warnings,
        ...withNote(compositionEmptyNote ?? excludedNote(slices.excluded)),
        height: 280,
      },
      {
        id: "ranking",
        title: "Ranking de gastos",
        subtitle: `De mayor a menor · ${periodName}`,
        option:
          ranking.entries.length > 0
            ? horizontalBarOption(ranking.entries, { colorOf: rankingColor })
            : null,
        table:
          ranking.entries.length > 0
            ? entryTable(ranking.entries, { colorOf: rankingColor })
            : EMPTY_TABLE,
        warnings: expenses.warnings,
        ...withNote(
          rankingEmptyNote ??
            (ranking.hidden > 0
              ? `Se muestran las ${ranking.entries.length} cuentas más grandes; ${ranking.hidden} quedaron fuera.`
              : undefined),
        ),
        height: 280,
      },
      {
        id: "cascada",
        title: "Del ingreso a la utilidad",
        subtitle: range ? `Suma de ${range}` : "Sin movimiento",
        option: steps.length > 0 ? waterfallOption(steps) : null,
        table: steps.length > 0 ? waterfallTable(steps) : EMPTY_TABLE,
        ...(waterfall ? { warnings: waterfall.warnings } : {}),
        ...withNote(
          waterfall && waterfall.grouped > 0
            ? `«Otros gastos» agrupa ${waterfall.grouped} grupos más pequeños.`
            : undefined,
        ),
        height: 340,
      },
    ],
  };
}

/**
 * Análisis answers *how it changes*, and answers it without asking the reader to configure
 * anything: the main expenses against revenue, how each account moved against the previous
 * period, and where the spend concentrates. Each intersects its fixed question with whatever
 * «Cuenta contable» marks.
 *
 * The vertical analysis table is deliberately NOT here: it owns controls of its own (base
 * account, folding) and its calculation already lives in `buildVerticalAnalysis`.
 */
export function buildAnalisisCards(context: SelectionContext, filters: PygFilters): AnalisisCards {
  const sources = [...context.sources];
  const runQuery = (query: Parameters<typeof buildSeries>[1]) => buildSeries(sources, query);
  const source = activeSource(context);
  const periodRefs = expandSlots(filters.periods, [context.year]);

  const expenseLeaves = leavesOfAny(source, expenseRootsOf(source));
  const expenseCodes = intersectWithMarked(expenseLeaves, filters.codes);
  const expenses = runQuery(compositionQuery(expenseCodes, context, { periods: periodRefs }));
  const periods = coveredPeriods(expenses);
  const periodName = nameOf(periods);
  const expensesEmptyNote =
    expenseLeaves.length > 0 && expenseCodes.length === 0
      ? "El filtro de cuentas marcadas no incluye ninguna cuenta de Costos y Gastos."
      : undefined;

  // % over revenue of the largest expenses. Over a span it is `Σ cuenta ÷ Σ ingresos` and never
  // the average of each period's percentage — the same rule the vertical analysis applies to its
  // «Total año», and for the same reason: an average of ratios is not the ratio of the sums, and
  // a thin month would weigh as much as a full one.
  const topExpenses = topEntries(amountsOver(expenses)).entries;
  const revenue = sumOver(
    runQuery(presetQuery([REVENUE_ROOT], context, { periods: periodRefs })),
    REVENUE_ROOT,
  );
  // Ranked before the colors are resolved: the slot order has to match the drawn order, or the
  // first bar of the card comes out painted slot 6.
  const shareEntries = topEntries(
    revenue === null || revenue === 0
      ? []
      : topExpenses.map((entry) => ({ ...entry, value: (entry.value / revenue) * 100 })),
  ).entries;
  const shareColor = entryColor(shareEntries.map((entry) => entry.code));
  // A base of 0 or with no coverage empties the card with ONE line naming the span — never one
  // warning per account, which would bury the reason under the list it explains.
  const shareEmptyNote =
    topExpenses.length > 0 && (revenue === null || revenue === 0)
      ? `Los ingresos de ${periodName} no dan base para el porcentaje.`
      : undefined;

  // Variation against the previous period: the sign is the reading, so it goes out with an icon
  // and the signed value too, never as color alone.
  const lastPeriod = lastCoveredIndex(expenses);
  const variation = topByMagnitude(variationEntries(expenses, lastPeriod));
  const variationColor = signColorOf(variation.entries);
  // The one card that does NOT speak about the span: it compares two columns, so it names them.
  // Inheriting «Ene–Jun» here would announce a variation over six months that nothing computed.
  const variationName =
    periods.length === 0
      ? "Sin movimiento"
      : lastPeriod > 0
        ? `${periodLabel(expenses.periods[lastPeriod])} contra ${periodLabel(expenses.periods[lastPeriod - 1])}`
        : "Sin periodo anterior";

  const pareto = toPareto(amountsOver(expenses));
  const paretoColor = entryColor(pareto.entries.map((entry) => entry.code));

  return {
    periods,
    periodName,
    cards: [
      {
        id: "gastos-sobre-ingresos",
        title: "Gastos principales sobre ingresos",
        subtitle: `% sobre ingresos · ${periodName}`,
        option:
          shareEntries.length > 0
            ? horizontalBarOption(shareEntries, { colorOf: shareColor, unit: "porcentaje" })
            : null,
        table:
          shareEntries.length > 0
            ? entryTable(shareEntries, { colorOf: shareColor, unit: "porcentaje" }, "% ingresos")
            : EMPTY_TABLE,
        warnings: expenses.warnings,
        ...withNote(expensesEmptyNote ?? shareEmptyNote),
        height: 300,
      },
      {
        id: "variacion",
        title: "Variación contra el periodo anterior",
        subtitle: variationName,
        option: variation.entries.length > 0 ? variationBarOption(variation.entries) : null,
        table:
          variation.entries.length > 0
            ? entryTable(variation.entries, { colorOf: variationColor }, "Variación")
            : EMPTY_TABLE,
        note: [
          "Cada barra lleva su flecha y su valor con signo; el color no es la única señal.",
          expensesEmptyNote ?? "",
          variation.hidden > 0
            ? `Se muestran los ${variation.entries.length} movimientos más grandes; ${variation.hidden} quedaron fuera.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
        height: 300,
      },
      {
        id: "pareto",
        title: "Concentración de gastos",
        subtitle: `Pareto · ${periodName}`,
        option: pareto.entries.length > 0 ? paretoOption(pareto, { colorOf: paretoColor }) : null,
        table:
          pareto.entries.length > 0
            ? entryTable(pareto.entries, { colorOf: paretoColor })
            : EMPTY_TABLE,
        // El corte se dice, como en el ranking: una lista recortada en silencio se lee como la
        // lista entera, y aquí el recorte es de decenas de cuentas.
        ...withNote(expensesEmptyNote ?? paretoNote(pareto)),
        height: 300,
      },
    ],
  };
}
