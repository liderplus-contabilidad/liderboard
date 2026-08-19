/**
 * Las LÍNEAS DE NEGOCIO de un hotel: Hospedaje, Restaurante, Lavandería, Bar, Tours y el resto de
 * los ingresos ordinarios — seis barras que suman, cada una, varias cuentas del plan.
 *
 * Es la primera vez que una serie NO es una cuenta, y no lo es porque la pregunta que produce esta
 * lectura no cabe en el plan. En el real: «hospedaje» son dos ramas enteras de tarifa menos lo que
 * el contador colgó ahí y es otro negocio; «restaurante» y «bar» viven MEZCLADOS bajo una sola
 * cuenta de Alimentos y Bebidas, donde solo el nombre los separa; y «lavandería» y «tours» están
 * DUPLICADOS —`4.1.1.5 Ventas Lavanderia` y `4.1.11.1 Servicios de Lavandería`, `4.1.3 Venta de
 * Servicios de Tours` y `4.1.5 Venta de Servicios Tours`—, en ramas distintas y a distinta
 * profundidad. Ninguna marca de «Cuenta contable» dibuja eso, por muchas que se marquen.
 *
 * **Son CATEGORÍAS declaradas y no una barra por cuenta.** Se probó al revés —cada cuenta suelta de
 * la sección con su propia barra— y el plan real daba DOCE líneas para ocho ranuras de paleta, así
 * que la lectura dependía de cuáles cabían: las dos lavanderías salían separadas, una dibujada y la
 * otra dentro de un «Otras líneas» que nadie podía cuadrar. Con las cinco que la firma llama
 * importantes más el resto son seis, nunca se pliega nada, y una cuenta duplicada suma en su
 * categoría en vez de competir consigo misma por una ranura.
 *
 * Todo se localiza POR RÓTULO y jamás por código — la misma regla de `microplus-grid.ts` y
 * `dingoo-grid.ts`, y lo que hace que funcione con `4.1.01.01` y con `4.1.1.1` a la vez. El nodo de
 * hospedaje se busca por su nombre a cualquier profundidad bajo Ingresos y su PADRE es la sección
 * de actividades ordinarias, en vez de dar por hecho que es `4.1`: en un plan se llama «Ingresos de
 * Actividades Ordinarias» y en otro «Ventas».
 *
 * Tres decisiones son las que pueden estar mal, y por eso están probadas:
 *
 * - **Quién entra en «Hospedaje».** Solo las hijas DIRECTAS del nodo cuyo nombre dice hospedaje,
 *   alojamiento, habitación, suite o tarifa — y esas se llevan su rama COMPLETA, incluida esa
 *   `Ventas Restaurante` que el contador colgó dentro de `Habitaciones Sencillas`. Lo que cuelga
 *   del nodo y no dice eso (Eventos, Lavandería) NO es hospedaje: se clasifica como cualquier otra.
 *   El corte es de PROFUNDIDAD y no de nombre, que es lo que separa esos dos casos.
 * - **Dónde corta Restaurante contra Bar.** Bar es lo que dentro de Alimentos y Bebidas dice
 *   bebida, bar o licor; Restaurante es EL RESTO de esa rama, no otra lista de palabras. Por resto,
 *   los dos SIEMPRE suman esa cuenta: un «Sin desglosar» o un «Catering» nuevos caen en Restaurante
 *   en vez de desaparecer de la pantalla.
 * - **Hasta dónde se busca una categoría.** Se DESCIENDE por las cuentas que no encajan en ninguna,
 *   porque el plan esconde `Servicios de Lavandería` bajo un padre llamado «Otros Ingresos de
 *   Actividades Ordinarias»; la primera coincidencia se lleva la rama y ahí se para.
 *
 * Rebajas y descuentos quedan fuera de todo —son un menos dentro de los ingresos y no una línea de
 * negocio—, y la tarjeta lo DICE en vez de descontarlos en silencio.
 */
import { colorForEntity } from "@/lib/charts/palette";
import { formatCurrency } from "@/lib/format";
import { normalizeLabel } from "@/lib/workspaces";
import type { AnalyticsSource, Series, SeriesKey, SeriesPoint } from "../analytics/types";
import { childrenOf, seriesTotal } from "./presets";

/** Una barra: su id, su rótulo y los nodos DISJUNTOS del plan cuya suma es. */
export interface BusinessLine {
  id: string;
  label: string;
  /**
   * Nodos del plan, nunca hojas: son disjuntos por construcción (ninguno desciende de otro), así
   * que sumarlos no puede contar dos veces, y cada uno ya trae su rollup.
   */
  codes: string[];
}

export interface BusinessLineSet {
  /** En el orden que pidió la firma: Hospedaje, Restaurante, Lavandería, Bar, Tours y el resto. */
  lines: BusinessLine[];
  /**
   * Las cuentas que ninguna línea recoge (rebajas, descuentos, devoluciones), con su código: sin
   * él la tarjeta puede nombrarlas pero no puede SUMARLAS, y sin esa suma la nota no cuadra contra
   * el estado — que es la primera cuenta que hace quien mira estas barras.
   */
  excluded: { code: string; label: string }[];
  /**
   * Las líneas que la LEYENDA dejó apagadas — apartadas, nunca borradas: sus cuentas siguen siendo
   * ingresos del estado, así que el cuadre tiene que contarlas o la nota declararía miles «sin
   * clasificar», que es justo el aviso de que la lectura no cierra.
   */
  hidden: BusinessLine[];
  /**
   * Las ramas de actividades ordinarias que la lectura recorre: la del hospedaje y toda hermana
   * que el PLAN declare también ordinaria. Contra la suma de estas se cuadra la lectura.
   */
  sectionCodes: string[];
  /** Cómo las llama el plan, para nombrarlas en la nota. */
  sectionLabels: string[];
}

const EMPTY: BusinessLineSet = {
  lines: [],
  hidden: [],
  excluded: [],
  sectionCodes: [],
  sectionLabels: [],
};

/** Ingresos: el nodo de hospedaje se busca DENTRO de esta raíz y en ninguna otra. */
const REVENUE_PREFIX = "4.";

/** Ingresos, la raíz: de sus hijas sale el universo que la lectura recorre. */
const REVENUE_ROOT = "4";
/**
 * Qué hermana de la sección entra además. El plan de un cliente real llama a su `4.2` «Otros
 * Ingresos de Actividades Ordinarias» y mete ahí las `Comisiones Tours`, que su propio informe
 * cuenta como Tours; el de otro llama al suyo «Otros Ingresos» a secas y no las cuenta. Se sigue lo
 * que el plan DECLARA en vez de dar por hecho que lo ordinario es solo `4.1`, y por eso los
 * ingresos financieros —que ningún plan llama ordinarios— se quedan fuera solos.
 */
const ORDINARY = /ordinari/;

const LODGING = /hospedaj|alojamient/;
/** Con qué se reconoce el nodo cuando el plan no escribe «hospedaje»: sus hijas venden cuartos. */
const ROOMS = /habitacion|hospedaj|alojamient|suite/;
/** Quién se funde en la barra de hospedaje: la rama de habitaciones y sus desgloses por tarifa. */
const LODGING_MEMBER = /hospedaj|alojamient|habitacion|suite|tarifa|sin desglosar/;
const FOOD_AND_DRINK = /aliment|bebida|comida|restaurant|restaurac|banquet|cafeteri/;
const LAUNDRY = /lavander|lenceri/;
const TOURS = /tour|excursion/;
const DRINK = /bebida|\bbar\b|licor|coctel|trago|vino|cerveza|cantina/;
const FOOD =
  /aliment|comida|desayun|almuerz|cena|restaurant|restaurac|menu|buffet|banquet|cafeteri/;
const DISCOUNT = /rebaj|descuent|devoluc/;

/**
 * Las categorías, en el orden en que se leen y en el que se buscan. El orden IMPORTA dos veces: es
 * el de las barras y es el de la prioridad —una cuenta que dijera «lavandería del restaurante»
 * cuenta como lavandería, la más específica—. `otros` no se busca: es lo que sobra.
 */
const CATEGORIES = [
  { id: "hospedaje", label: "Hospedaje" },
  { id: "restaurante", label: "Restaurante" },
  { id: "lavanderia", label: "Lavandería" },
  { id: "bar", label: "Bar" },
  { id: "tours", label: "Tours" },
  { id: "otros", label: "Otros ingresos ordinarios" },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

function norm(value: string): string {
  return normalizeLabel(value);
}

function depthOf(code: string): number {
  return code.split(".").length;
}

/**
 * Las líneas que el plan del centro activo declara, o un conjunto VACÍO cuando no las declara — que
 * es lo que hace que el interruptor de la barra no se rinda con un cliente que no es un hotel.
 *
 * Se exige que salgan DOS o más: una sola barra no es una comparación, es la misma cifra que ya da
 * la tarjeta de composición con otro nombre. Es la misma regla con la que el Consolidado entre
 * clientes se ofrece.
 */
export function buildBusinessLines(source: AnalyticsSource | undefined): BusinessLineSet {
  if (!source) {
    return EMPTY;
  }

  const lodging = findLodgingNode(source);
  if (lodging === null) {
    return EMPTY;
  }
  const section = source.parentByCode.get(lodging);
  if (section === undefined) {
    return EMPTY;
  }

  const labelOf = (code: string) => source.namesByCode.get(code) ?? code;
  const excluded: { code: string; label: string }[] = [];
  const claims = new Map<CategoryId, string[]>();
  const claim = (category: CategoryId, code: string) => {
    const current = claims.get(category);
    if (current) {
      current.push(code);
    } else {
      claims.set(category, [code]);
    }
  };

  /**
   * Clasifica una rama de arriba hacia abajo: la primera categoría que coincide se lleva la rama
   * entera y ahí se para; lo que no coincide se DESCIENDE, y una hoja que llega sin categoría cae
   * en `fallback` — «restaurante» dentro de Alimentos y Bebidas, para que sea el resto de esa
   * cuenta, y el cajón de «otros» en cualquier otro sitio.
   */
  const classify = (code: string, fallback: CategoryId) => {
    const label = labelOf(code);
    const name = norm(label);
    if (DISCOUNT.test(name)) {
      excluded.push({ code, label });
      return;
    }
    const matched = categoryOf(name);
    if (matched !== null) {
      claim(matched, code);
      return;
    }
    const children = childrenOf(source, code);
    if (children.length === 0) {
      claim(fallback, code);
      return;
    }
    for (const child of children) {
      classify(child, fallback);
    }
  };

  // Hospedaje se corta por PROFUNDIDAD: solo las hijas directas del nodo que dicen hospedaje son la
  // línea; las demás pasan por la clasificación como cualquier otra cuenta de la sección.
  for (const code of childrenOf(source, lodging)) {
    const label = labelOf(code);
    if (DISCOUNT.test(norm(label))) {
      excluded.push({ code, label });
      continue;
    }
    if (LODGING_MEMBER.test(norm(label))) {
      claim("hospedaje", code);
    } else {
      classify(code, "otros");
    }
  }

  // El resto de la sección. Alimentos y Bebidas es la única rama con fallback propio, que es lo que
  // hace que Restaurante y Bar sumen siempre esa cuenta entera.
  const siblings = childrenOf(source, section);
  const alsoOrdinary = childrenOf(source, REVENUE_ROOT).filter(
    (code) => code !== section && ORDINARY.test(norm(labelOf(code))),
  );
  const fnb = siblings.find((code) => code !== lodging && FOOD_AND_DRINK.test(norm(labelOf(code))));
  for (const code of siblings) {
    if (code === lodging) {
      continue;
    }
    if (code === fnb) {
      for (const child of childrenOf(source, code)) {
        classify(child, "restaurante");
      }
      continue;
    }
    classify(code, "otros");
  }

  // Las hermanas que el plan también declara ordinarias no tienen hospedaje ni una rama de A y B
  // que partir: sus cuentas pasan por la misma clasificación, y ahí es donde `Comisiones Tours`
  // encuentra su categoría en vez de perderse fuera de la lectura.
  for (const branch of alsoOrdinary) {
    for (const code of childrenOf(source, branch)) {
      classify(code, "otros");
    }
  }

  const lines = CATEGORIES.filter((category) => (claims.get(category.id) ?? []).length > 0).map(
    (category) => ({
      id: category.id,
      label: category.label,
      codes: claims.get(category.id) ?? [],
    }),
  );
  if (lines.length < 2) {
    return EMPTY;
  }
  const sections = [section, ...alsoOrdinary];
  return {
    lines,
    hidden: [],
    excluded,
    sectionCodes: sections,
    sectionLabels: sections.map(labelOf),
  };
}

/**
 * Lo que la LEYENDA deja encendido, y aparte lo que apagó.
 *
 * Apagar una línea no es quitarla del estado: sus cuentas siguen siendo ingresos declarados, así
 * que se APARTAN en vez de borrarse y el cuadre las cuenta del lado de lo que queda fuera. Sin eso
 * la nota afirmaría un residuo «sin clasificar» del tamaño de la línea apagada, que es exactamente
 * el aviso que esa frase existe para dar cuando algo va mal de verdad.
 *
 * Un id que ninguna línea declara —el de un plan que ya no está abierto— vale como ninguno: es la
 * misma defensa que el resto del módulo aplica a una marca huérfana, porque vaciar la pantalla
 * sería peor que no acotar.
 */
export function selectBusinessLines(
  set: BusinessLineSet,
  hidden: readonly string[],
): BusinessLineSet {
  const off = new Set(hidden);
  const visible = set.lines.filter((line) => !off.has(line.id));
  if (visible.length === set.lines.length) {
    return set;
  }
  return { ...set, lines: visible, hidden: set.lines.filter((line) => off.has(line.id)) };
}

/** La categoría que un nombre declara, o `null` — el orden de la lista es la prioridad. */
function categoryOf(name: string): CategoryId | null {
  if (LAUNDRY.test(name)) {
    return "lavanderia";
  }
  if (TOURS.test(name)) {
    return "tours";
  }
  const isDrink = DRINK.test(name);
  const isFood = FOOD.test(name);
  if (isDrink && !isFood) {
    return "bar";
  }
  if (isFood && !isDrink) {
    return "restaurante";
  }
  return null;
}

/**
 * El nodo de hospedaje, en DOS pasadas, porque no todos los planes escriben la palabra.
 *
 * La primera busca el nodo MÁS SOMERO bajo Ingresos que se llame hospedaje o alojamiento y tenga
 * desglose. Somero porque un plan repite la palabra hacia dentro (`Venta de Hospedaje › Venta de
 * Hospedaje Tarifa 0%`) y la línea es la rama entera, no su primer nieto; con desglose porque una
 * cuenta de movimiento no tiene hijas que repartir entre hospedaje y lo demás.
 *
 * La segunda existe por un plan REAL que no dice «hospedaje» en ninguna parte: llama a su rama
 * `Ingresos de Actividades Ordinarias` y cuelga debajo `Ventas Habitaciones`, `Ventas Restaurante`,
 * `Ventas Lavanderia`. Ahí el nodo se reconoce por sus HIJAS — la que vende habitaciones —, que es
 * la evidencia que queda cuando el rótulo del padre no dice nada. Va después y no antes porque en
 * un plan que sí nombra el hospedaje, la sección ENTERA tiene una hija que habla de habitaciones, y
 * tomarla a ella sería tomar la sección por el negocio.
 */
function findLodgingNode(source: AnalyticsSource): string | null {
  const named = shallowestNode(source, (code) =>
    LODGING.test(norm(source.namesByCode.get(code) ?? "")),
  );
  if (named !== null) {
    return named;
  }
  return shallowestNode(source, (code) =>
    childrenOf(source, code).some((child) => ROOMS.test(norm(source.namesByCode.get(child) ?? ""))),
  );
}

/** La cuenta más somera bajo Ingresos que cumple el predicado y tiene desglose. */
function shallowestNode(
  source: AnalyticsSource,
  matches: (code: string) => boolean,
): string | null {
  let best: string | null = null;
  for (const code of source.namesByCode.keys()) {
    if (!code.startsWith(REVENUE_PREFIX) || !matches(code)) {
      continue;
    }
    if (childrenOf(source, code).length === 0) {
      continue;
    }
    if (best === null || depthOf(code) < depthOf(best)) {
      best = code;
    }
  }
  return best;
}

export interface SummedBusinessLines {
  series: Series[];
  /**
   * Cuántas líneas se quitaron por no moverse en todo el tramo — dichas, nunca borradas en
   * silencio. Un plan declara cada cuenta tenga o no movimiento (el real trae `Venta Parqueadero` y
   * `Ventas Telefono` en cero todo el año), y una leyenda de barras invisibles entierra a la que
   * importa. Es la misma regla con la que `foldDistribution` poda sus hijas paradas.
   */
  idle: number;
}

/**
 * Las series de las cuentas miembro, sumadas en una serie por línea.
 *
 * La suma es por ÍNDICE porque todas vienen de una misma consulta y comparten eje, y hereda la
 * regla que sostiene todo el motor: un periodo vale `null` solo si NINGUNA de sus cuentas lo cubre.
 * Un mes que el archivo no trajo sigue siendo un hueco y no un `$0`, que dibujaría una caída.
 *
 * No hay tope que aplicar: las categorías son seis y la paleta tiene ocho ranuras, así que ninguna
 * línea puede quedarse sin color. Ese fue el motivo de declararlas en vez de dar una barra a cada
 * cuenta, que en el plan real daban doce.
 */
export function sumBusinessLines(
  series: readonly Series[],
  lines: readonly BusinessLine[],
): SummedBusinessLines {
  const byCode = new Map(series.map((entry) => [entry.key.code, entry]));
  const built = lines
    .map((line) => sumOf(line, line.codes.map((code) => byCode.get(code)).filter(isSeries)))
    .filter(isSeries);

  const moving = built.filter((entry) => {
    const total = seriesTotal(entry);
    return total !== null && total !== 0;
  });
  return { series: moving, idle: built.length - moving.length };
}

/** El código sintético de una línea. No colisiona: ninguna cuenta del plan se llama así. */
function codeOf(line: BusinessLine): string {
  return `linea:${line.id}`;
}

function isSeries(entry: Series | null | undefined): entry is Series {
  return entry !== undefined && entry !== null;
}

function sumOf(line: BusinessLine, members: readonly Series[]): Series | null {
  if (members.length === 0) {
    return null;
  }
  const reference = members[0];
  const points: SeriesPoint[] = reference.points.map((point, index) => {
    let value: number | null = null;
    for (const member of members) {
      const candidate = member.points[index]?.value;
      if (candidate !== null && candidate !== undefined) {
        value = (value ?? 0) + candidate;
      }
    }
    return { period: point.period, value };
  });

  return {
    key: { code: codeOf(line), centerId: reference.key.centerId, year: reference.key.year },
    label: line.label,
    points,
    container: null,
  };
}

/**
 * Lo que el eje girado dibuja: las columnas del eje X y, dentro de cada una, las barras de lo que
 * se compara. Es la misma figura de siempre —el eje de comparación no se declara, sale de lo que
 * está marcado— pero girada: la categoría deja de ser una serie y pasa a ser una columna.
 */
export interface CategoryReading {
  categories: string[];
  /** El renglón de arriba del eje: qué grupo cubre cuántas columnas, en su orden. Ausente cuando
   * las columnas ya son las categorías y no hay nada que agrupar. */
  groups?: { label: string; span: number }[];
  series: { id: string; label: string; values: (number | null)[] }[];
}

/** Una columna del eje: cómo se llama, a qué grupo pertenece y la serie que hay detrás. */
export interface CategoryColumn {
  label: string;
  /** La categoría, cuando la columna es un establecimiento dentro de ella. */
  group?: string;
  series: Series;
}

/** Una columna por CATEGORÍA — la lectura por defecto, sin centros marcados. */
export function columnsByCategory(summed: readonly Series[]): CategoryColumn[] {
  return summed.map((series) => ({ label: series.label, series }));
}

/**
 * Una columna por (categoría, ESTABLECIMIENTO) — la forma exacta de la hoja del contador, donde
 * bajo cada actividad va una fila por sucursal.
 *
 * Las columnas se agrupan por categoría y dentro por centro, así que las de una misma actividad
 * quedan juntas. Cada una se rotula con el ESTABLECIMIENTO y la categoría viaja aparte, en `group`:
 * el eje la escribe una sola vez bajo sus columnas, en un renglón propio, en vez de repetirla
 * entera en cada rótulo — que es lo que hacía ilegible «Hospedaje · C. C. ALBEMARLE» cinco veces
 * seguidas.
 *
 * Un par que no se mueve NO abre columna: un hotel que no tiene bar dejaría una columna vacía por
 * cada mes, y son justo las columnas que hacen ilegible el resto.
 */
export function columnsByCenter(
  centers: readonly { id: string; label: string; summed: readonly Series[] }[],
  lines: readonly BusinessLine[],
): CategoryColumn[] {
  return lines.flatMap((line) =>
    centers.flatMap((center) => {
      const series = center.summed.find((entry) => entry.key.code === codeOf(line));
      return series ? [{ label: center.label, group: line.label, series }] : [];
    }),
  );
}

/**
 * Una barra por columna con el TOTAL del tramo: la lectura más legible, y la única en la que cada
 * barra —también la de $761— imprime su cifra encima.
 */
export function readTotal(columns: readonly CategoryColumn[], label: string): CategoryReading {
  return {
    categories: columns.map((column) => column.label),
    ...groupsOf(columns),
    series: [{ id: "total", label, values: columns.map((column) => seriesTotal(column.series)) }],
  };
}

/**
 * Los tramos del renglón de grupos, por CONSECUTIVOS y no por clave: el orden de las columnas es el
 * que fija dónde empieza y acaba cada categoría, igual que `groupViews` en Ocupaciones. Sin grupos
 * el campo no viaja, porque un `groups: []` y «no hay nada que agrupar» no son la misma forma.
 */
function groupsOf(columns: readonly CategoryColumn[]): {
  groups?: { label: string; span: number }[];
} {
  const groups: { label: string; span: number }[] = [];
  for (const column of columns) {
    if (column.group === undefined) {
      return {};
    }
    const last = groups[groups.length - 1];
    if (last && last.label === column.group) {
      last.span += 1;
    } else {
      groups.push({ label: column.group, span: 1 });
    }
  }
  return groups.length > 0 ? { groups } : {};
}

/**
 * Una barra por PERIODO dentro de cada columna — el gráfico que la firma ya dibuja a mano.
 *
 * Los periodos llegan con su ÍNDICE en el eje y no por su posición en la lista: lo que se dibuja
 * son los CUBIERTOS, y un año cargado hasta mayo tiene cinco de doce. Sin el índice, mayo leería el
 * valor de la quinta columna del eje solo por casualidad.
 */
export function readByPeriod(
  columns: readonly CategoryColumn[],
  periods: readonly { index: number; label: string }[],
): CategoryReading {
  return {
    categories: columns.map((column) => column.label),
    ...groupsOf(columns),
    series: periods.map((period) => ({
      id: `periodo-${period.index}`,
      label: period.label,
      values: columns.map((column) => column.series.points[period.index]?.value ?? null),
    })),
  };
}

/**
 * El color de cada línea por su lugar en la lectura, con la paleta de IDENTIDAD y no con una rampa:
 * aquí sí son entidades distintas —negocios distintos—, y el orden es el declarado, que no se mueve
 * cuando una línea deja de tener movimiento.
 */
export function businessLineColor(series: readonly Series[]): (key: SeriesKey) => string {
  const order = series.map((entry) => entry.key.code);
  return (key) => colorForEntity(key.code, order);
}

/** El CUADRE de la lectura contra el estado, que la tarjeta calcula y la nota escribe. */
export interface BusinessLinesBalance {
  /** Suma de las seis líneas en el tramo. */
  lines: number | null;
  /** Lo que el estado declara en la sección — contra esto se cuadra. */
  section: number | null;
  /** Suma de las cuentas dejadas fuera; negativa cuando son rebajas, que es el caso normal. */
  excluded: number | null;
  /**
   * Suma de las líneas APAGADAS en la leyenda. Es opcional porque una lectura sin nada apagado no
   * tiene que declarar un cero: la nota queda entonces letra por letra como estaba.
   */
  hidden?: number | null;
  /** Categorías quitadas por no moverse en el tramo. */
  idle: number;
}

/**
 * Qué agrupa la lectura, qué deja fuera y —sobre todo— POR QUÉ no suma lo mismo que el estado.
 *
 * Sin esta línea una barra llamada «Hospedaje» es indistinguible de la cuenta `Venta de Hospedaje`
 * del plan, que vale otra cosa porque incluye los eventos. Y sin el cuadre, la primera cuenta que
 * hace cualquiera al ver seis barras es sumarlas y compararlas con `4.1`: en el estado real dan
 * $2.047,25 de más, que son exactamente las rebajas y descuentos que quedan fuera. Esa resta la
 * escribe la tarjeta, porque hacerla a mano contra otra pestaña es lo que convierte una lectura
 * correcta en una sospecha.
 */
export function describeBusinessLines(
  set: BusinessLineSet,
  balance: BusinessLinesBalance = { lines: null, section: null, excluded: null, idle: 0 },
): string {
  const parts = [
    set.sectionLabels.length > 0
      ? `Cada barra suma las cuentas de su categoría dentro de ${set.sectionLabels.join(" y ")}, estén donde estén del plan.`
      : "Cada barra suma las cuentas de su categoría.",
    balanceLine(set, balance),
    set.excluded.length > 0
      ? `Fuera de las líneas: ${set.excluded.map((entry) => entry.label).join(", ")}.`
      : "",
    // Las apagadas se NOMBRAN, y aquí y no en el cuadre: una barra que falta se lee como un dato
    // que falta, y el cuadre puede no existir —un tramo sin cobertura no tiene cifras que restar—.
    set.hidden.length > 0
      ? `Apagadas en la leyenda: ${set.hidden.map((line) => line.label).join(", ")}.`
      : "",
    balance.idle > 0
      ? `${balance.idle} ${balance.idle === 1 ? "categoría quedó fuera" : "categorías quedaron fuera"} por no tener movimiento en el periodo.`
      : "",
  ];
  return parts.filter(Boolean).join(" ");
}

function balanceLine(set: BusinessLineSet, balance: BusinessLinesBalance): string {
  if (balance.lines === null || balance.section === null) {
    return "";
  }
  // Con CENTAVOS, que es lo contrario de la regla del eje: aquí la cifra no se mira, se COTEJA
  // contra el estado, y $201,998 no se puede cotejar contra $201,998.26.
  const amount = (value: number) => formatCurrency(value, { cents: true });
  // «encendidas» solo cuando alguna está apagada: si no, la palabra sobra y esta frase se coteja
  // contra el Excel del contador, donde cada letra de más es una pregunta.
  const drawn = set.hidden.length > 0 ? "líneas encendidas" : "líneas";
  const total = `Las ${set.lines.length} ${drawn} suman ${amount(balance.lines)}`;
  if (sameAmount(balance.lines, balance.section)) {
    return `${total}, que es lo que el estado declara.`;
  }
  const excluded = balance.excluded ?? 0;
  const hidden = balance.hidden ?? 0;
  // El residuo es la red de seguridad: si lo de fuera no explica la diferencia, la nota lo dice en
  // vez de dejar al lector con dos cifras que no cierran y ninguna pista de por qué. Lo apagado
  // entra en esa cuenta como una parte más de la diferencia — es plata del estado que no está en
  // ninguna barra, igual que las rebajas.
  const residual = balance.section - (balance.lines + excluded + hidden);
  const parts = [
    `${amount(excluded)} de cuentas que quedan fuera`,
    ...(set.hidden.length > 0 ? [`${amount(hidden)} de las líneas apagadas`] : []),
  ];
  const explained = `${total} y el estado declara ${amount(balance.section)}: la diferencia son ${parts.join(" y ")}`;
  return sameAmount(residual, 0)
    ? `${explained}.`
    : `${explained}, y ${amount(residual)} sin clasificar.`;
}

/** Al centavo: las cifras vienen de sumas en coma flotante y `===` las separa por un `1e-10`. */
function sameAmount(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}
