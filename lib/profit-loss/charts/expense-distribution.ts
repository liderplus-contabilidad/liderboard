/**
 * The EXPENSE ANNEX: what the span's costs and expenses break down into, how much each category
 * weighs over 100 % of the expense and how much over the revenue.
 *
 * It is the reading the firm keeps by hand in a separate book —a table of code · description · value
 * · percentage, with its bar chart and its pie beside it— and it is the TWO figures of its header
 * that define it: the total of the expense, which is the breakdown's 100 %, and the total of the
 * revenue, which that expense is measured against. A breakdown that only said the percentage over
 * itself does not answer «how much of what I sold went on medical fees?», which is the question the
 * annex opens with.
 *
 * **It does not need the vocabulary «Ventas» does need**, and that is the whole difference between
 * the two preset views. There the categories are invisible in the plan —hospedaje crosses whole
 * branches, restaurante and bar share an account— and `business-lines.ts` locates them by label,
 * which ties it to a hotel plan. Here the annex's categories ARE accounts of the plan, and they are
 * at different depths depending on the branch (`5.2.02` next to `5.3.03.01`) precisely because they
 * are the MOVEMENT accounts of the expense tree — which is what `leavesOfAny` already returns. A
 * structural rule and not a domain one: it serves a hospital, a hotel and a shop with no line of code
 * per client.
 *
 * Nothing here decides how many are DRAWN — that belongs to the card, because a pie's cut and a set
 * of bars' cut are not the same number. This file returns the WHOLE, ordered breakdown, which is what
 * the annex's table prints uncut.
 */
import { OTHERS_CODE } from "../analytics/structure";
import type { AmountEntry } from "../analytics/structure";
import type { AnalyticsSource } from "../analytics/types";
import { childrenOf, expenseRootsOf } from "./presets";

/**
 * How many lines the annex draws before folding the tail into «Otros» — the SAME number for the bars
 * and for the doughnut, which is what makes them talk about the same list.
 *
 * Fifteen was asked for by the firm and it is a LEGIBILITY limit, not a colour one: the bars all go
 * in the same hue, so there is no cap there, and the doughnut has hues for more. What does not
 * stretch further is the reading — an expense plan can bring 133 movement accounts, and there the
 * slices fall below 0.1 %: they cannot be seen, they cannot be labelled and the pie stops breaking
 * anything down—. The folded ones are not lost: they are still there one by one in the annex's table,
 * which does not cut.
 */
export const ANNEX_MAX_SLICES = 15;

/**
 * THE ANNEX THE CLINIC DECLARES: the seventeen lines the firm builds this chart with, with the code
 * and the LABEL its own sheet prints, in the order it lists them.
 *
 * **It is a list and not a rule, and that was tried the other way round first.** The seventeen looked
 * like a level derivable from the tree —the deepest ancestor with children, which is the row an annex
 * usually subtotals—, and against the real plan they are not: eleven meet it and six do not (`5.2.02`,
 * `5.3.02`, `5.3.03.12`, `5.5.01.01`, `5.5.01.02`, `5.5.02.01` have grandchildren and
 * great-grandchildren), so that rule would have split them into subaccounts and left the reading with
 * eleven bars and an enormous «Otros». They are not a fixed level either: `5.2.02` (level 3) and
 * `5.3.03.01` (level 4) coexist. They are a SELECTION of the accountant, and what the plan does not
 * list —`5.2.03`, `5.2.04`, `5.3.03.05`, `.08`, `.10`, `.15`, `.16`, `.18`, `.20`— are the accounts
 * that do not move, which is what makes the seventeen add up to the whole expense.
 *
 * The list also **NAMES** as well as choosing: the label is tied to the code and OVERRIDES the chart
 * of accounts', because the file calls `5.2.02` «MANO DE OBRA DIRECTA / FARMACIA/…», `5.3.03.14`
 * «AGUA, ENERGIA, LUZ Y TELECOMUNICACIONES» and `5.5.01.01` «GASTOS NOMINA /ADMINISTRACION», and this
 * chart is checked row by row against the sheet where they are called something else. They go
 * VERBATIM, with their capitals and their spare spaces (`FARMACIA/ LABORATORIO`), the same rule Rol de
 * Pagos keeps the accountant's typos with in the journal entry and in the payslip.
 *
 * The codes come from the file without the trailing dot MicroPlus marks a parent with (`5.2.01.01.`),
 * which is what `microplus-grid.ts` already discards on import. None hangs off another, so the
 * breakdown cannot count the same dollar twice.
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
  /** The lines that are drawn: the declared ones the open plan brings, narrowed by the marks. */
  rows: AnnexRow[];
  /**
   * Whether «Otros» collects the rest of the expense. Only with the COMPLETE annex on screen: with
   * marked accounts a piece is being looked at on purpose, and there the column adds up to less than
   * 100 % —which is what says it is a piece— instead of dragging everything else into one bar.
   */
  residual: boolean;
}

/**
 * The declared annex's plan, or `null` when the open statement is not that one — and then the view
 * breaks down by movement accounts, exactly as before this existed.
 *
 * The door opens with the MAJORITY of the declared lines present in the plan, and not with all of
 * them: the accountant withdrawing or renumbering one cannot change the shape of the chart they
 * review every month. And it does not look at which SYSTEM the file came from, which would identify
 * all of MicroPlus and not this chart of accounts; what opens it is the plan itself, which is what the
 * list talks about.
 *
 * The marked accounts NARROW the breakdown (`PresetView.narrowedByCodes`) with the usual rule: a
 * marked section leaves its lines, a marked line leaves itself. The door is judged BEFORE narrowing,
 * so marking one cannot close it.
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
  /** What part of the expense's 100 % it is. `null` when the total gives no base. */
  shareOfExpenses: number | null;
  /** What part of the SAME span's revenue it is. `null` when there is no revenue to divide by. */
  shareOfRevenue: number | null;
}

export interface ExpenseDistribution {
  /** The whole breakdown, largest to smallest. Uncut: cutting belongs to whoever draws. */
  categories: ExpenseCategory[];
  /** The breakdown's 100 % — the engine's rollup, never the sum of what happens to be on screen. */
  totalExpenses: number | null;
  totalRevenue: number | null;
  /** How much of the revenue went on expenses: the figure the annex opens with. */
  expensesOverRevenue: number | null;
  /** Accounts of the universe that did not move in the span. They are counted, not named. */
  idle: number;
  /**
   * How many lines the two cards draw before folding the TAIL into «Otros».
   *
   * It is decided by the breakdown and not by the card because the cut of fifteen exists for a
   * universe of a hundred and thirty-one movement accounts: with the DECLARED annex there are
   * seventeen lines the accountant checks row by row, and folding the three smallest hides exactly
   * what their sheet lists. There they are all drawn, which is what the slice palette (eighteen hues)
   * allows.
   */
  maxSlices: number;
  /**
   * Whether «Otros» is the REST of the expense the annex does not name and not the tail folded by
   * size. They are two different things and the note says them differently: one is a fold of rows the
   * table still lists, the other is money of the statement this list does not mention.
   */
  residual: boolean;
}

/**
 * A percentage over a total, and the ONLY definition of that in this file — the annex's two columns
 * and the account ficha, which asks the same question for a single account, share it.
 *
 * A `null` total (no coverage) and a `0` total give `null`, never `0 %`: the first is «it is not
 * known» and the second would be dividing by zero, and both are different from «it weighs nothing».
 * It is the same rule `toPctOfAccount` applies in the engine and that the vertical analysis applies
 * to its «Total año».
 */
export function shareOf(value: number, total: number | null): number | null {
  if (total === null || total === 0) {
    return null;
  }
  return (value / total) * 100;
}

/**
 * The breakdown, from the amounts the engine already summed over the span.
 *
 * The accounts WITH NO MOVEMENT go and are counted, `topEntries`' and `foldDistribution`'s rule: a
 * statement declares every account of its plan whether or not it has movement, and the accountant's
 * annex only lists the ones that moved —ten rows at zero bury the one that matters—. The negative
 * ones DO stay: in an expense breakdown a credit note is a finding, not noise, and the table can
 * print a negative percentage even though the pie cannot draw a slice.
 *
 * The denominator is the one `totals` brings, which is the rollup of the expense roots, and NOT the
 * sum of the categories. With the whole universe they are the same; with marked accounts they are
 * not, and then the column adds up to less than 100 % — which is correct and is what says a piece is
 * being looked at.
 */
export function buildExpenseDistribution(
  entries: readonly AmountEntry[],
  totals: { expenses: number | null; revenue: number | null },
  options: { annex?: AnnexPlan | null } = {},
): ExpenseDistribution {
  // With no line to name there is no annex to draw —it happens when narrowing below its level, with a
  // movement account marked— and the breakdown goes back to the ordinary one: each account with its
  // name and the tail folded by size.
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
    // The synthetic «Otros» does not count as an idle account: when the annex covers the whole
    // expense it is worth zero, and without this exception the note said «1 account did not move»
    // when there was none.
    idle: reparto.filter((entry) => entry.value === 0 && entry.code !== OTHERS_CODE).length,
    // The declared annex is drawn WHOLE: its lines are the list the accountant checks row by row, and
    // folding the smallest by size would take away exactly the ones they look for.
    maxSlices: annex ? categories.length : ANNEX_MAX_SLICES,
    residual: annex?.residual === true && categories.some((entry) => entry.code === OTHERS_CODE),
  };
}

/**
 * The annex's lines with THEIR label, and «Otros» with whatever the annex does not name.
 *
 * The residue is computed against the TOTAL EXPENSE and not by summing the accounts that were left
 * out: those accounts were not queried —the annex asks for seventeen codes, not for the whole tree—
 * and summing them would require a second batch that could square against another span. Subtracting
 * against the denominator makes both cards close at 100 % by construction, with any plan and no
 * matter how many accounts are left out.
 *
 * It can come out NEGATIVE —the plan carries a `(-) DESCUENTO EN COMPRAS` outside the list—, and then
 * it is the pie that sets it aside with its usual note; the bars and the table still say it. It is
 * rounded to cents so floating-point noise does not invent a $0.00 slice.
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
 * THE ACCOUNTS «Otros» GROUPS: the exact reverse of `annexEntries`, which SUBTRACTS the residual
 * without ever looking at them.
 *
 * Subtracting is the right thing for the FIGURE — it is what makes the two cards close at 100 % by
 * construction with any chart of accounts — but it leaves a bar that cannot be opened: its code is
 * the `OTHERS_CODE` sentinel, so clicking it asked for the children of an account that does not
 * exist and the window answered «this is a movement account», which is wrong twice over. This
 * enumerates what the subtraction hides, and what it enumerates is CHECKED against it:
 * `buildAccountBreakdown` compares their sum with the residual and says so when they disagree,
 * rather than leaving two figures nobody adds up by hand.
 *
 * It stops at the HIGHEST level the annex does not cover and not at the movement accounts at the
 * bottom: that is `buildAccountBreakdown`'s own rule — direct children, the next level is reached
 * by going DOWN — and it is what leaves the few rows that read at a glance, at the same depth as
 * the annex's own lines, each one openable in turn through the breadcrumb the window already has.
 * A real plan returns three or four codes here where the leaves would be dozens.
 *
 * An expense root with no declared line under it (the `6` of a segmented statement) comes out
 * WHOLE, which is exactly what the annex does not name of it.
 */
export function residualCodes(source: AnalyticsSource | undefined, annex: AnnexPlan): string[] {
  const declared = new Set(annex.rows.map((row) => row.code));
  // Descend through an ANCESTOR of a declared line and emit everything else; a declared line and
  // its whole branch are skipped, because the annex already names them in their own bar.
  const leadsToDeclared = (code: string) =>
    annex.rows.some((row) => row.code.startsWith(`${code}.`));
  const codes: string[] = [];
  const visit = (code: string) => {
    if (declared.has(code)) {
      return;
    }
    if (leadsToDeclared(code)) {
      childrenOf(source, code).forEach(visit);
      return;
    }
    codes.push(code);
  };
  expenseRootsOf(source).forEach(visit);
  return codes;
}

/**
 * The annex's footnote, in plain Spanish: what it is being measured against and what was left out.
 *
 * It says the BALANCE first —the breakdown's total and what part of the revenue it is—, because it is
 * what the accountant checks against their own sheet, and that is why it carries cents just like the
 * «Ventas» note. What is folded and what is idle come afterwards and as a COUNT, not named: they are
 * the rows the table twin does list, so naming them here would say them twice.
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
    // With the declared annex «Otros» means something else: it is not the small tail but the rest of
    // the expense this list does not mention, and the table does not break it down either. Saying so
    // is what stops that slice being read as one more line of the accountant's sheet.
    parts.push("«Otros» es el resto del gasto que el anexo no nombra.");
  } else if (grouped > 0) {
    // It says HOW MANY it groups and where they are whole, which is what stops «Otros» being read as
    // one more account. The wording is the one the cascade already uses for its own fold.
    parts.push(`«Otros» agrupa ${grouped} rubros más pequeños, que la tabla lista uno a uno.`);
  }
  if (distribution.idle > 0) {
    parts.push(
      `${distribution.idle} ${distribution.idle === 1 ? "cuenta no se movió" : "cuentas no se movieron"} en el tramo.`,
    );
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}
