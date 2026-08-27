/**
 * PyG's PRESET VIEWS: readings the firm always presents and that no combination of marks produces.
 *
 * They exist because the rest of the bar selects ACCOUNTS, and there are questions that are neither an
 * account nor a set of accounts of the plan: «revenue by business line» groups whole branches, splits
 * one account in two by the name of its children and leaves the rebajas out. Marking does not draw
 * that.
 *
 * The catalogue is a LIST and not an `if` for two reasons: the bar's section renders nothing on its
 * own when the open plan admits none —no dead control— and adding the next view is one entry here plus
 * its branch in `cards.ts`, without touching either the bar or the filters. `isAvailable` lives in the
 * entry because who can draw each view belongs to the view: the lines one needs a hotel plan, and
 * whichever comes next will need something else.
 */
import { frequencyLabel } from "@/lib/period";
import type { AnalyticsSource } from "../analytics/types";
import type { Frequency } from "../types";
import { buildBusinessLines } from "./business-lines";
import { expenseRootsOf, leavesOfAny } from "./presets";

/** The id travels in `PygFilters.preset`, which is a `string | null` so as not to drag `charts/` into
 * `filters.ts` — the same boundary by which `PygDataProvider` does not import from here either. */
export const BUSINESS_LINES_PRESET = "lineas-de-negocio";
export const EXPENSE_DISTRIBUTION_PRESET = "distribucion-de-gastos";

/** A breakdown needs at least two parts; with one, «distribución» is the same computation under
 *  another name. */
const MIN_CATEGORIES = 2;

/**
 * What it is decided against whether a view can be drawn. It is a named object and not the bare source
 * because what decides it does not have to be in the chart of accounts: the expense annex was tied to
 * the SYSTEM the file came from, which is a datum of the workspace, and whichever view comes next may
 * need another. That way that datum is added here without rewriting every `isAvailable`.
 */
export interface PresetContext {
  source: AnalyticsSource | undefined;
}

export interface PresetView {
  id: string;
  label: string;
  /** What it presents, in one line: it is the switch's `title`, because a one-word label («Ventas»)
   * does not say what will happen on pressing it. */
  description: string;
  isAvailable: (context: PresetContext) => boolean;
  /**
   * What the view marks on being switched on, and it belongs to the VIEW for the same reason as
   * `isAvailable`: what is seeded depends on what is drawn. «Ventas» breaks down by establishment and
   * by month, so it marks the centers and the covered periods so what is drawn and what is marked are
   * the same. The expense annex breaks down by none of that —it is ONE column per line—, and seeding
   * centers into it would open a column per establishment of something that is read as a single total.
   */
  seeds?: { centers?: boolean; periods?: boolean };
  /**
   * That marking an account NARROWS this view instead of contradicting it. Normally marks and views
   * are mutually exclusive —they are two answers to «what do I draw» and nothing arbitrates them—, and
   * that holds when what the view draws is NOT a set of accounts: «Ventas» groups whole branches and
   * splits one account in two by the name of its children, so there is no mark that represents what it
   * draws. In the expense annex the lines ARE accounts of the plan, so the mark and the view say the
   * same thing and unmarking narrows the breakdown; switching the whole view off would be the opposite
   * of what marks are for.
   *
   * It is DECLARED here instead of derived from a seeding —which is how it used to be decided— because
   * they are two different things: a view may seed nothing and still allow being narrowed by accounts.
   */
  narrowedByCodes?: boolean;
  /**
   * The granularity the view is read at, when it has one. The annex is ANNUAL: its table is «from 01
   * January to 30 June» in a single column, and in monthly there would be six bars per line that are
   * not the breakdown but its evolution. It is applied on switching on and is not undone on switching
   * off —«Ver por» is in plain sight and is restored with one click—, unlike the marks, which do leave
   * chips the user did not make.
   */
  frequency?: Frequency;
}

export const PRESET_VIEWS: readonly PresetView[] = [
  {
    id: BUSINESS_LINES_PRESET,
    label: "Ventas",
    description: "Ventas por línea de negocio: hospedaje, sus servicios, restaurante y bar",
    isAvailable: ({ source }) => buildBusinessLines(source).lines.length > 0,
    seeds: { centers: true, periods: true },
  },
  {
    id: EXPENSE_DISTRIBUTION_PRESET,
    label: "Costos y gastos",
    description:
      "Anexo de gastos: en qué se reparten, cuánto pesa cada rubro sobre el gasto y sobre el ingreso",
    /**
     * Any plan that declares expense accounts, without looking at which system the file came from.
     *
     * It was tied to MicroPlus, and it was a LEGIBILITY restriction and not a matter of the
     * computation failing: the breakdown is done over the MOVEMENT accounts of the expense tree, and
     * there each plan gives a very different number —MicroPlus' stays in the tens, others go much
     * further down and return over a hundred lines—. What makes that case legible is no longer the
     * lock but the CUT, which belongs to the card and holds for any plan: fourteen lines and an
     * «Otros» grouping the tail, with the table twin listing them all one by one with their figure.
     * MicroPlus' real plan brings seventeen lines, so that client was already reading the fold.
     *
     * And that is why `isAvailable` no longer looks at the system: the rule is structural —there are
     * at least two movement accounts to break down— and it serves a hospital, a hotel and a shop with
     * no line of code per client, including the cross-client consolidado, where there is no system to
     * speak of.
     */
    isAvailable: ({ source }) =>
      leavesOfAny(source, expenseRootsOf(source)).length >= MIN_CATEGORIES,
    // It seeds NOTHING, and the accounts are the case that has to be explained: the annex's lines are
    // accounts of the plan, so marking them would be «seeing which ones go in»; but they are all the
    // movement ones of the expense tree, and a real plan declares over a hundred — a hundred and
    // thirty-one chips in the filter strip is not seeing anything. Seeding only the fourteen drawn does
    // not work either: which ones they are depends on the AMOUNTS, which come from the engine and from
    // the span, and a mark NARROWS what the annex sums, so marking fourteen would take with it the
    // «Otros» that groups the rest. With no seeding the bar is left with one chip, the annex reads the
    // whole tree and marking by hand still narrows the breakdown —that is `narrowedByCodes`—, which is
    // what was to be kept.
    narrowedByCodes: true,
    frequency: "anual",
  },
];

/**
 * What happens to the screen on switching a view on, in one phrase per effect.
 *
 * It comes out of what the view already DECLARES (`seeds`, `frequency`, `narrowedByCodes`) and not out
 * of a list written by hand per card, for the same reason `isAvailable` lives in the entry: adding the
 * next view has to be one entry here and nothing else. A parallel list in the component would fall
 * short the day someone adds a seeding, and no figure would give it away — the card would keep
 * promising the old thing.
 *
 * It exists because these views REPLACE the reading and along the way move marks the user did not
 * make: «Ventas» marks centers and months, and the annex forces the frequency. A button that does that
 * without saying so reads as a bug the first time it is pressed.
 *
 * `[]` is a legitimate answer —a view may touch nothing—, and the card draws no strip.
 */
export function presetEffects(view: PresetView): string[] {
  const effects: string[] = [];
  if (view.seeds?.centers) {
    effects.push("Marca los centros");
  }
  if (view.seeds?.periods) {
    effects.push("Marca los meses cargados");
  }
  if (view.frequency) {
    effects.push(`Se lee en ${frequencyLabel(view.frequency).toLowerCase()}`);
  }
  if (view.narrowedByCodes) {
    effects.push("Se acota marcando cuentas");
  }
  return effects;
}

/** The ones the open statement can draw; `[]` leaves the whole section out of the bar. */
export function availablePresets(context: PresetContext): PresetView[] {
  return PRESET_VIEWS.filter((preset) => preset.isAvailable(context));
}

/** The selected view, or `undefined` — which is also what an already retired id returns. */
export function findPreset(id: string | null): PresetView | undefined {
  return id === null ? undefined : PRESET_VIEWS.find((preset) => preset.id === id);
}
