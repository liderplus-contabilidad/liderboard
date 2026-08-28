/**
 * A hotel's BUSINESS LINES: Hospedaje, Restaurante, Lavandería, Bar, Tours and the rest of the
 * ordinary revenue — six bars each of which sums several accounts of the plan.
 *
 * It is the first time a series is NOT an account, and it is not because the question that produces
 * this reading does not fit in the plan. In the real one: «hospedaje» is two whole rate branches
 * minus what the accountant hung there and is another business; «restaurante» and «bar» live MIXED
 * under a single Alimentos y Bebidas account, where only the name separates them; and «lavandería»
 * and «tours» are DUPLICATED —`4.1.1.5 Ventas Lavanderia` and `4.1.11.1 Servicios de Lavandería`,
 * `4.1.3 Venta de Servicios de Tours` and `4.1.5 Venta de Servicios Tours`—, in different branches
 * and at different depths. No «Cuenta contable» mark draws that, however many are marked.
 *
 * **They are declared CATEGORIES and not a bar per account.** It was tried the other way round —each
 * loose account of the section with its own bar— and the real plan gave TWELVE lines for eight
 * palette slots, so the reading depended on which ones fitted: the two lavanderías came out separate,
 * one drawn and the other inside an «Otras líneas» nobody could square. With the five the firm calls
 * important plus the rest there are six, nothing is ever folded, and a duplicated account adds up in
 * its category instead of competing with itself for a slot.
 *
 * Everything is located BY LABEL and never by code — the same rule as `microplus-grid.ts` and
 * `dingoo-grid.ts`, and what makes it work with `4.1.01.01` and with `4.1.1.1` at once. The hospedaje
 * node is looked for by its name at any depth under Ingresos and its PARENT is the ordinary
 * activities section, instead of assuming it is `4.1`: in one plan it is called «Ingresos de
 * Actividades Ordinarias» and in another «Ventas».
 *
 * Three decisions are what can be wrong, and that is why they are tested:
 *
 * - **Who goes into «Hospedaje».** Only the DIRECT children of the node whose name says hospedaje,
 *   alojamiento, habitación, suite or tarifa — and those take their COMPLETE branch, including that
 *   `Ventas Restaurante` the accountant hung inside `Habitaciones Sencillas`. What hangs off the node
 *   and does not say that (Eventos, Lavandería) is NOT hospedaje: it is classified like any other.
 *   The cut is one of DEPTH and not of name, which is what separates those two cases.
 * - **Where Restaurante cuts against Bar.** Bar is whatever within Alimentos y Bebidas says bebida,
 *   bar or licor; Restaurante is THE REST of that branch, not another list of words. Being the rest,
 *   the two ALWAYS add up to that account: a new «Sin desglosar» or «Catering» falls into Restaurante
 *   instead of disappearing from the screen.
 * - **How far a category is searched.** The accounts that fit none are DESCENDED INTO, because the
 *   plan hides `Servicios de Lavandería` under a parent called «Otros Ingresos de Actividades
 *   Ordinarias»; the first match takes the branch and stops there.
 *
 * Rebajas and descuentos are left out of everything —they are a minus inside revenue and not a
 * business line—, and the card SAYS so instead of discounting them silently.
 */
import { colorForEntity } from "@/lib/charts/palette";
import { formatCurrency } from "@/lib/format";
import { normalizeLabel } from "@/lib/workspaces";
import type { AnalyticsSource, Series, SeriesKey, SeriesPoint } from "../analytics/types";
import { childrenOf, seriesTotal } from "./presets";

/** A bar: its id, its label and the DISJOINT nodes of the plan whose sum it is. */
export interface BusinessLine {
  id: string;
  label: string;
  /**
   * Nodes of the plan, never leaves: they are disjoint by construction (none descends from another),
   * so summing them cannot double count, and each already brings its rollup.
   */
  codes: string[];
}

export interface BusinessLineSet {
  /** In the order the firm asked for: Hospedaje, Restaurante, Lavandería, Bar, Tours and the rest. */
  lines: BusinessLine[];
  /**
   * The accounts no line picks up (rebajas, descuentos, devoluciones), with their code: without it
   * the card can name them but cannot SUM them, and without that sum the note does not square against
   * the statement — which is the first computation anyone looking at these bars does.
   */
  excluded: { code: string; label: string }[];
  /**
   * The lines the LEGEND left switched off — set aside, never deleted: their accounts are still
   * revenue of the statement, so the balance has to count them or the note would declare thousands
   * «unclassified», which is precisely the warning that the reading does not close.
   */
  hidden: BusinessLine[];
  /**
   * The ordinary-activities branches the reading walks: hospedaje's and every sibling the PLAN also
   * declares ordinary. The reading is squared against the sum of these.
   */
  sectionCodes: string[];
  /** What the plan calls them, so they can be named in the note. */
  sectionLabels: string[];
}

const EMPTY: BusinessLineSet = {
  lines: [],
  hidden: [],
  excluded: [],
  sectionCodes: [],
  sectionLabels: [],
};

/** Ingresos: the hospedaje node is looked for INSIDE this root and in no other. */
const REVENUE_PREFIX = "4.";

/** Ingresos, the root: the universe the reading walks comes from its children. */
const REVENUE_ROOT = "4";
/**
 * Which sibling of the section also goes in. A real client's plan calls its `4.2` «Otros Ingresos de
 * Actividades Ordinarias» and puts the `Comisiones Tours` there, which its own report counts as
 * Tours; another's calls its own plain «Otros Ingresos» and does not count them. What the plan
 * DECLARES is followed instead of assuming that ordinary is only `4.1`, and that is why the financial
 * revenue —which no plan calls ordinary— is left out on its own.
 */
const ORDINARY = /ordinari/;

const LODGING = /hospedaj|alojamient/;
/** What the node is recognised by when the plan does not write «hospedaje»: its children sell rooms. */
const ROOMS = /habitacion|hospedaj|alojamient|suite/;
/** Who is fused into the hospedaje bar: the rooms branch and its breakdowns by rate. */
const LODGING_MEMBER = /hospedaj|alojamient|habitacion|suite|tarifa|sin desglosar/;
const FOOD_AND_DRINK = /aliment|bebida|comida|restaurant|restaurac|banquet|cafeteri/;
const LAUNDRY = /lavander|lenceri/;
const TOURS = /tour|excursion/;
const DRINK = /bebida|\bbar\b|licor|coctel|trago|vino|cerveza|cantina/;
const FOOD =
  /aliment|comida|desayun|almuerz|cena|restaurant|restaurac|menu|buffet|banquet|cafeteri/;
const DISCOUNT = /rebaj|descuent|devoluc/;

/**
 * The categories, in the order they are read in and the order they are searched in. The order MATTERS
 * twice: it is the bars' and it is the priority's —an account that said «lavandería del restaurante»
 * counts as lavandería, the more specific one—. `otros` is not searched for: it is what is left over.
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
 * The lines the active center's plan declares, or an EMPTY set when it declares none — which is what
 * makes the bar's switch not render for a client that is not a hotel.
 *
 * TWO or more are required to come out: a single bar is not a comparison, it is the same figure the
 * composition card already gives under another name. It is the same rule the cross-client Consolidado
 * is offered by.
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
   * Classifies a branch from the top down: the first category that matches takes the whole branch and
   * stops there; what does not match is DESCENDED INTO, and a leaf that arrives with no category falls
   * into `fallback` — «restaurante» inside Alimentos y Bebidas, so it is the rest of that account, and
   * the «otros» catch-all anywhere else.
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

  // Hospedaje cuts by DEPTH: only the node's direct children that say hospedaje are the line; the
  // rest go through the classification like any other account of the section.
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

  // The rest of the section. Alimentos y Bebidas is the only branch with a fallback of its own, which
  // is what makes Restaurante and Bar always add up to that whole account.
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

  // The siblings the plan also declares ordinary have no hospedaje and no A&B branch to split: their
  // accounts go through the same classification, and that is where `Comisiones Tours` finds its
  // category instead of getting lost outside the reading.
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
 * What the LEGEND leaves switched on, and separately what it switched off.
 *
 * Switching a line off is not removing it from the statement: its accounts are still declared
 * revenue, so they are SET ASIDE instead of deleted and the balance counts them on the side of what
 * is left out. Without that the note would claim an «unclassified» residue the size of the switched
 * off line, which is exactly the warning that phrase exists to give when something really is wrong.
 *
 * An id no line declares —one of a plan that is no longer open— counts as none: it is the same
 * defence the rest of the module applies to an orphan mark, because emptying the screen would be
 * worse than not narrowing.
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

/** The category a name declares, or `null` — the list's order is the priority. */
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
 * The hospedaje node, in TWO passes, because not every plan writes the word.
 *
 * The first looks for the SHALLOWEST node under Ingresos that is called hospedaje or alojamiento and
 * has a breakdown. Shallowest because a plan repeats the word inwards (`Venta de Hospedaje › Venta de
 * Hospedaje Tarifa 0%`) and the line is the whole branch, not its first grandchild; with a breakdown
 * because a movement account has no children to split between hospedaje and the rest.
 *
 * The second exists because of a REAL plan that does not say «hospedaje» anywhere: it calls its
 * branch `Ingresos de Actividades Ordinarias` and hangs `Ventas Habitaciones`, `Ventas Restaurante`,
 * `Ventas Lavanderia` underneath. There the node is recognised by its CHILDREN — the one that sells
 * rooms —, which is the evidence left when the parent's label says nothing. It comes after and not
 * before because in a plan that does name hospedaje, the WHOLE section has a child that talks about
 * rooms, and taking that one would be taking the section for the business.
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

/** The shallowest account under Ingresos that meets the predicate and has a breakdown. */
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
   * How many lines were removed for not moving in the whole span — said, never silently deleted. A
   * plan declares every account whether or not it has movement (the real one brings `Venta
   * Parqueadero` and `Ventas Telefono` at zero all year), and a legend of invisible bars buries the
   * one that matters. It is the same rule `foldDistribution` prunes its idle children with.
   */
  idle: number;
}

/**
 * The member accounts' series, summed into one series per line.
 *
 * The sum is by INDEX because they all come from one same query and share an axis, and it inherits
 * the rule that holds up the whole engine: a period is `null` only if NONE of its accounts covers it.
 * A month the file did not bring is still a gap and not a `$0`, which would draw a fall.
 *
 * There is no cap to apply: the categories are six and the palette has eight slots, so no line can be
 * left without a colour. That was the reason for declaring them instead of giving each account a bar,
 * which in the real plan gave twelve.
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

/** A line's synthetic code. It does not collide: no account of the plan is called that. */
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
 * What the rotated axis draws: the X axis' columns and, within each one, the bars of what is being
 * compared. It is the usual figure —the comparison axis is not declared, it comes out of what is
 * marked— but rotated: the category stops being a series and becomes a column.
 */
export interface CategoryReading {
  categories: string[];
  /** The axis' top line: which group covers how many columns, in their order. Absent when the columns
   * already are the categories and there is nothing to group. */
  groups?: { label: string; span: number }[];
  series: { id: string; label: string; values: (number | null)[] }[];
}

/** A column of the axis: what it is called, which group it belongs to and the series behind it. */
export interface CategoryColumn {
  label: string;
  /** The category, when the column is an establishment within it. */
  group?: string;
  series: Series;
}

/** One column per CATEGORY — the default reading, with no centers marked. */
export function columnsByCategory(summed: readonly Series[]): CategoryColumn[] {
  return summed.map((series) => ({ label: series.label, series }));
}

/**
 * One column per (category, ESTABLISHMENT) — the exact shape of the accountant's sheet, where under
 * each activity there is one row per sucursal.
 *
 * The columns are grouped by category and within it by center, so those of the same activity stay
 * together. Each one is labelled with the ESTABLISHMENT and the category travels separately, in
 * `group`: the axis writes it once under its columns, on a line of its own, instead of repeating it
 * whole in every label — which is what made «Hospedaje · C. C. ALBEMARLE» five times in a row
 * illegible.
 *
 * A pair that does not move opens NO column: a hotel with no bar would leave an empty column for
 * every month, and it is precisely the empty columns that make the rest illegible.
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
 * One bar per column with the span's TOTAL: the most legible reading, and the only one in which every
 * bar —including the $761 one— prints its figure above it.
 */
export function readTotal(columns: readonly CategoryColumn[], label: string): CategoryReading {
  return {
    categories: columns.map((column) => column.label),
    ...groupsOf(columns),
    series: [{ id: "total", label, values: columns.map((column) => seriesTotal(column.series)) }],
  };
}

/**
 * The group line's spans, by CONSECUTIVES and not by key: the columns' order is what fixes where each
 * category starts and ends, just like `groupViews` in Ocupaciones. With no groups the field does not
 * travel, because a `groups: []` and «there is nothing to group» are not the same shape.
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
 * One bar per PERIOD within each column — the chart the firm already draws by hand.
 *
 * The periods arrive with their INDEX on the axis and not by their position in the list: what is
 * drawn are the COVERED ones, and a year loaded up to May has five out of twelve. Without the index,
 * May would read the value of the axis' fifth column only by coincidence.
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
 * Each line's colour by its place in the reading, with the IDENTITY palette and not with a ramp: here
 * they really are different entities —different businesses—, and the order is the declared one, which
 * does not move when a line stops having movement.
 */
export function businessLineColor(series: readonly Series[]): (key: SeriesKey) => string {
  const order = series.map((entry) => entry.key.code);
  return (key) => colorForEntity(key.code, order);
}

/** The reading's BALANCE against the statement, which the card computes and the note writes. */
export interface BusinessLinesBalance {
  /** Sum of the six lines in the span. */
  lines: number | null;
  /** What the statement declares in the section — this is what it is squared against. */
  section: number | null;
  /** Sum of the accounts left out; negative when they are rebajas, which is the normal case. */
  excluded: number | null;
  /**
   * Sum of the lines SWITCHED OFF in the legend. It is optional because a reading with nothing
   * switched off does not have to declare a zero: the note then stays letter for letter as it was.
   */
  hidden?: number | null;
  /** Categories removed for not moving in the span. */
  idle: number;
}

/**
 * What the reading groups, what it leaves out and —above all— WHY it does not add up to the same as
 * the statement.
 *
 * Without this line a bar called «Hospedaje» is indistinguishable from the plan's `Venta de
 * Hospedaje` account, which is worth something else because it includes the events. And without the
 * balance, the first computation anyone does on seeing six bars is summing them and comparing them
 * with `4.1`: in the real statement they come out $2,047.25 higher, which is exactly the rebajas and
 * descuentos left out. That subtraction is written by the card, because doing it by hand against
 * another tab is what turns a correct reading into a suspicion.
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
    // The switched off ones are NAMED, and here and not in the balance: a missing bar reads as a
    // missing datum, and the balance may not exist —a span with no coverage has no figures to
    // subtract—.
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
  // With CENTS, which is the opposite of the axis' rule: here the figure is not looked at, it is
  // CHECKED against the statement, and $201,998 cannot be checked against $201,998.26.
  const amount = (value: number) => formatCurrency(value, { cents: true });
  // «encendidas» only when some is switched off: otherwise the word is superfluous and this phrase is
  // checked against the accountant's Excel, where every extra letter is a question.
  const drawn = set.hidden.length > 0 ? "líneas encendidas" : "líneas";
  const total = `Las ${set.lines.length} ${drawn} suman ${amount(balance.lines)}`;
  if (sameAmount(balance.lines, balance.section)) {
    return `${total}, que es lo que el estado declara.`;
  }
  const excluded = balance.excluded ?? 0;
  const hidden = balance.hidden ?? 0;
  // The residue is the safety net: if what is outside does not explain the difference, the note says
  // so instead of leaving the reader with two figures that do not close and no clue why. What is
  // switched off enters that computation as one more part of the difference — it is money of the
  // statement that is in no bar, just like the rebajas.
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

/** To the cent: the figures come from floating-point sums and `===` separates them by a `1e-10`. */
function sameAmount(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}
