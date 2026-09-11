"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { SCREEN_SOLID_VIEW, type SolidView } from "@/lib/charts/solid-bars";
import { buildAnalyticsSource } from "@/lib/profit-loss/analytics/source";
import { REVENUE_ROOT } from "@/lib/profit-loss/charts/presets";
import { applyEditsToLeafAccounts, mergeCenters } from "@/lib/profit-loss/derive";
import { loadedMonthsFor } from "@/lib/profit-loss/types";
import type { PygDataset } from "@/lib/profit-loss/types";
import { canCaptureExternal } from "@/lib/revenue/availability";
import { resolveMonthlyRevenue } from "@/lib/revenue/derive";
import {
  buildRevenueCards,
  DEFAULT_ANNUAL_SHAPE,
  DEFAULT_GROWTH_UNIT,
  readRevenueSummary,
  type AnnualShape,
  type ComparisonShape,
  type GrowthUnit,
  type RevenueCards,
  type RevenueCardsInput,
  type RevenueSummary,
} from "@/lib/revenue/cards";
import type { CaptureYearRows } from "@/lib/revenue/capture-workbook";
import {
  deleteRevenueYear,
  externalForClient,
  replaceExternalYears,
  saveExternalMonth,
  saveExternalMonths,
} from "@/lib/revenue/db";
import {
  emptyFilters,
  periodLabel,
  sanitizeFilters,
  selectedMonths,
  withSpanToggled,
  withYearsCleared,
  withMonthsCleared,
  withMonthToggled,
  withYearToggled,
  type RevenueFilters,
  type RevenueUniverse,
} from "@/lib/revenue/filters";
import {
  emptyExternalSeries,
  MONTHS_IN_YEAR,
  type RevenueExternalAmounts,
  type RevenueExternalMonth,
  type RevenueExternalSeries,
  type RevenueYearInput,
} from "@/lib/revenue/types";
import type { NamedSpan } from "@/lib/period";
import { usePygData } from "../pyg-data-provider";

/**
 * «Reportería de ingresos»' state, mounted INSIDE the view and not in the layout.
 *
 * The house rule is that a provider lives in the layout when the HEADER reads from its same state —
 * that is how `ActiveClient` and the panel share it in PyG and in Ocupaciones — and the header reads
 * nothing from this subitem: the client is given by `PygDataProvider`, which is already above.
 * Lifting these marks would put something in the layout no other screen reads.
 *
 * **This is the ONLY place PyG is adapted to `lib/revenue/`.** The pure layer receives a
 * `RevenueYearInput` — a year and twelve numbers — and knows nothing of `PygDataset`, `CellEdit` or
 * `WorkspaceMeta`. That boundary is what lets the whole engine be tested without mounting anything.
 */
interface RevenueDataValue {
  /**
   * The PyG client this belongs to; `null` with none open. Unlike «Ventas por servicio», the
   * consolidado is NOT collapsed into `null` here: the comparison and the growth read estados de
   * resultados, which is exactly what the consolidado sums. What the consolidado cannot do is
   * CAPTURE — see `canCapture`.
   */
  clientId: string | null;
  isConsolidated: boolean;
  clientName: string | undefined;
  /** False until the first read from Dexie: it avoids the empty state flickering over a client that
   *  does have figures captured. */
  ready: boolean;
  /** Whether this workspace can hold captured figures at all. */
  canCapture: boolean;
  universe: RevenueUniverse;
  filters: RevenueFilters;
  /** How the span reads — what the tiles, the subtitles and the report header say. */
  periodName: string;
  /**
   * EXACTLY the input `cards` were built with. The report asks for the same cards with the same
   * arguments instead of recomposing them: two compositions of one input can drift apart, and
   * whoever receives the PDF no longer has the screen beside them to check against.
   */
  cardsInput: RevenueCardsInput;
  cards: RevenueCards;
  summary: RevenueSummary;
  /**
   * The header controls' state. It lives HERE and not inside each card because the cards are rebuilt
   * from `cardsInput` on every read: held locally they would reset to the default on the next mark,
   * and the reader would find the shape they chose undone by an unrelated click.
   */
  growthUnit: GrowthUnit;
  setGrowthUnit: (unit: GrowthUnit) => void;
  /** The comparison's «Ver como». The SCREEN opens flat; the skyline is opted into. */
  comparisonShape: ComparisonShape;
  setComparisonShape: (shape: ComparisonShape) => void;
  /** The annual card's «Cifra» — el total del tramo, o el promedio mensual. */
  annualShape: AnnualShape;
  setAnnualShape: (shape: AnnualShape) => void;
  /**
   * The BODY the annual reading is drawn in — su «Ver como», el mismo que llevan las tres «vs». Abre
   * PLANA: es la forma que el informe y el Excel pueden llevarse. El crecimiento no tiene cuerpo que
   * elegir, así que tampoco tiene estado aquí.
   */
  annualView: SolidView;
  setAnnualView: (view: SolidView) => void;
  /**
   * The body each RATIO card is drawn in, by descriptor id. One record and not three fields, for the
   * reason the three cards come out of one constructor: a fourth ratio is an entry in
   * `RATIO_DESCRIPTORS` and nothing else. Absent, the card is flat — see `SCREEN_SOLID_VIEW`.
   */
  ratioViews: Readonly<Record<string, SolidView>>;
  setRatioView: (id: string, view: SolidView) => void;
  toggleYear: (year: number) => void;
  clearYears: () => void;
  toggleMonth: (monthIndex: number) => void;
  clearMonths: () => void;
  /** Semestre y quimestre: ATAJOS que marcan meses, nunca un cuarto eje. */
  toggleSpan: (span: NamedSpan) => void;
  /** The year the capture drawer is writing — its own selector, independent of the marks. */
  captureYear: number | null;
  setCaptureYear: (year: number) => void;
  /** Every year the drawer can be pointed at: the workspace's, plus the historical ones added. */
  captureYears: readonly number[];
  /** Opens a year in the drawer, creating it if the workspace does not have it. */
  addCaptureYear: (year: number) => void;
  /**
   * Whether a year can be TAKEN OFF the list. A year the estado de resultados declares cannot: it is
   * the workspace's, not the drawer's, and removing it would mean removing months from Datos.
   */
  canRemoveCaptureYear: (year: number) => boolean;
  /** How many months of a year hold stored figures — what the confirmation counts before erasing. */
  storedMonthsIn: (year: number) => number;
  /** Removes a year and ERASES its stored figures. The caller confirms first. */
  removeCaptureYear: (year: number) => Promise<void>;
  /** The captured figures of the year being written, as twelve slots each. */
  captureSeries: RevenueExternalSeries;
  /** The reference year's revenue, so the drawer can highlight a month with sales and no capture. */
  captureRevenue: (number | null)[];
  /**
   * Which months of the year being written come from the estado de resultados. Those are the ones the
   * drawer draws as TEXT rather than as an input: PyG already answers them, and an input over a figure
   * that cannot be changed is a control that means nothing.
   */
  captureCoverage: readonly boolean[];
  saveCapture: (monthIndex: number, amounts: RevenueExternalAmounts) => Promise<void>;
  /** A pasted block: several months of the open year written in ONE transaction. */
  saveCaptureMonths: (
    months: readonly { monthIndex: number; amounts: RevenueExternalAmounts }[],
  ) => Promise<void>;
  /**
   * Every year of the drawer as the Excel of «Datos registrados» writes it: twelve rows, «Ventas»
   * RESOLVED (the raíz 4 where the estado de resultados covers the month, the typed one where not).
   */
  captureRowsForExport: () => CaptureYearRows[];
  /**
   * What loading that Excel back does: each year the file names is replaced WHOLE, in one transaction,
   * and a «Ventas» the estado de resultados answers is never written — the stored value is kept.
   */
  replaceCaptureYears: (years: readonly CaptureYearRows[]) => Promise<void>;
}

const RevenueDataContext = createContext<RevenueDataValue | null>(null);

const NO_EXTERNAL: RevenueExternalMonth[] = [];
const NO_MONTHS: (number | null)[] = Array.from({ length: MONTHS_IN_YEAR }, () => null);
const NO_YEARS: readonly number[] = [];

export function RevenueDataProvider({ children }: { children: ReactNode }) {
  const {
    activeClientId,
    activeClient,
    isConsolidated,
    datasets,
    edits,
    loadedMonthsByYear,
    sourceSystemId,
  } = usePygData();
  const [rawFilters, setRawFilters] = useState<RevenueFilters>(emptyFilters);
  const [growthUnit, setGrowthUnit] = useState<GrowthUnit>(DEFAULT_GROWTH_UNIT);
  const [comparisonShape, setComparisonShape] = useState<ComparisonShape>("plano");
  const [annualShape, setAnnualShape] = useState<AnnualShape>(DEFAULT_ANNUAL_SHAPE);
  const [annualView, setAnnualView] = useState<SolidView>(SCREEN_SOLID_VIEW);
  const [ratioViews, setRatioViews] = useState<Readonly<Record<string, SolidView>>>({});
  const setRatioView = useCallback((id: string, view: SolidView) => {
    setRatioViews((current) => ({ ...current, [id]: view }));
  }, []);
  const [captureYearRaw, setCaptureYear] = useState<number | null>(null);
  /**
   * The historical years «+ Agregar año» has opened, REMEMBERED WITH THEIR CLIENT.
   *
   * A year the user opened and has not written in yet exists nowhere else: it holds no row, because a
   * month with its four amounts empty is deleted rather than stored, and inventing a row of nulls just
   * to remember a tab would put something in the table that means nothing. So it lives here until the
   * first figure lands, and from then on the stored row is what keeps it listed.
   *
   * It carries its `clientId` so it can be pruned on READ, the same way the marks are: switching
   * client must not leave the drawer offering a year that belonged to another company.
   */
  const [addedYearsRaw, setAddedYearsRaw] = useState<{
    clientId: string | null;
    years: readonly number[];
  }>({ clientId: null, years: NO_YEARS });

  const canCapture = canCaptureExternal({ sourceSystemId, isConsolidated });
  // The capture writes into a REAL client and never into the consolidado, so the partition it uses is
  // the one `canCapture` already vouched for.
  const clientId = isConsolidated ? null : activeClientId;

  // The ONLY query, and always bounded by the client: it is what stops two companies' figures mixing
  // in silence.
  const stored = useLiveQuery(() => externalForClient(clientId), [clientId]);
  const external = stored ?? NO_EXTERNAL;
  const ready = stored !== undefined;

  /**
   * The revenue the ESTADO DE RESULTADOS answers, year by year — derived and never stored.
   *
   * It is only half of what the screen reads: `revenueByYear` below folds in the months typed by hand
   * for the years that predate the workspace. Kept apart because the two have different natures —
   * this one is recomputed from Datos on every render, the other is what somebody wrote down— and
   * because the drawer needs to know exactly which months came from here in order to draw them as
   * figures rather than as inputs.
   *
   * It is the same path PyG's own Consolidado por centros walks: fold the edits into the leaves,
   * `mergeCenters` the year's datasets into one, and read the analytics source off the synthetic
   * dataset. The reading is of the COMPANY and not of the marked center, like the Excel it replaces.
   *
   * In the cross-client consolidado `datasets`, `edits` and `loadedMonthsByYear` are ALREADY the
   * consolidated ones —«from here on the consolidado IS the workspace»—, so there is a single code
   * path here and it never asks which of the two is open.
   */
  const pygRevenueByYear = useMemo(() => {
    const byYear = new Map<number, PygDataset[]>();
    for (const dataset of datasets) {
      byYear.set(dataset.year, [...(byYear.get(dataset.year) ?? []), dataset]);
    }

    const result = new Map<number, (number | null)[]>();
    for (const [year, ofYear] of byYear) {
      const covered = loadedMonthsFor({ loadedMonthsByYear }, year);
      if (covered.length === 0) {
        // A year with no declared coverage is a year the workspace does not have: it is not a year of
        // zeros, and it does not enter the universe.
        continue;
      }
      const merged = mergeCenters(
        ofYear.map((dataset) =>
          applyEditsToLeafAccounts(
            dataset.accounts,
            edits.filter((edit) => edit.datasetId === dataset.id),
          ),
        ),
      );
      const source = buildAnalyticsSource(
        { ...ofYear[0], accounts: merged.accounts, warnings: [], resultFromFile: [] },
        // The edits are already folded into the merged accounts; applying them again would count
        // them twice — `buildViews`' same rule for the synthetic Consolidado.
        [],
        new Set(covered),
      );
      // `REVENUE_ROOT` comes from PyG's own presets, never redeclared here. Its stored sign is
      // already normalised by whichever upload strategy created the workspace, and `rootSign` is `+1`
      // for the raíz 4 — applying it would be an operation that does nothing while looking like it
      // does something.
      const values = source.valuesByCode.get(REVENUE_ROOT);
      const inCoverage = new Set(covered);
      result.set(
        year,
        Array.from({ length: MONTHS_IN_YEAR }, (_, month) =>
          inCoverage.has(month) ? (values?.[month] ?? 0) : null,
        ),
      );
    }
    return result;
  }, [datasets, edits, loadedMonthsByYear]);

  /** The captured figures, indexed by year as twelve slots each. */
  const externalByYear = useMemo(() => {
    const byYear = new Map<number, RevenueExternalSeries>();
    for (const row of external) {
      const series = byYear.get(row.year) ?? emptyExternalSeries();
      series.manualRevenue[row.monthIndex] = row.manualRevenue;
      series.cardRevenue[row.monthIndex] = row.cardRevenue;
      series.cardFees[row.monthIndex] = row.cardFees;
      series.adSpend[row.monthIndex] = row.adSpend;
      byYear.set(row.year, series);
    }
    return byYear;
  }, [external]);

  /**
   * **The ventas the whole screen reads**: the estado de resultados wherever it reaches, and what was
   * typed by hand where it does not.
   *
   * `resolveMonthlyRevenue` is the one rule, and it is a FALLBACK — a month PyG carries is never
   * overwritten by a typed figure. Composed here and once, so the tiles, the five cards, the Excel and
   * the printed report cannot end up reading different ventas for the same month.
   *
   * A year survives only if something in it has a figure. A year that holds nothing but cobros con
   * tarjeta has no ventas to compare or grow, so it does not belong in the filter bar's universe — but
   * it is still offered in the drawer (`captureYears`), which is where its figures were written.
   */
  const revenueByYear = useMemo(() => {
    const all = new Set<number>([...pygRevenueByYear.keys(), ...externalByYear.keys()]);
    return [...all]
      .sort((a, b) => a - b)
      .map((year) => ({
        year,
        monthlyRevenue: resolveMonthlyRevenue(
          pygRevenueByYear.get(year) ?? NO_MONTHS,
          externalByYear.get(year)?.manualRevenue ?? NO_MONTHS,
        ),
      }))
      .filter((entry) => entry.monthlyRevenue.some((value) => value !== null));
  }, [pygRevenueByYear, externalByYear]);

  const years = useMemo(() => revenueByYear.map((entry) => entry.year), [revenueByYear]);

  // The YEARS resolve first, because the universe of months is that of the marked years: without that
  // order, marking a year could not open the months only it brings.
  const yearsOnly = useMemo(
    () => sanitizeFilters(rawFilters, { years, months: [] }),
    [rawFilters, years],
  );
  const universe = useMemo<RevenueUniverse>(() => {
    const marked = new Set(yearsOnly.years);
    const months = new Set<number>();
    for (const entry of revenueByYear) {
      if (!marked.has(entry.year)) {
        continue;
      }
      entry.monthlyRevenue.forEach((value, month) => {
        if (value !== null) {
          months.add(month);
        }
      });
    }
    return { years, months: [...months].sort((a, b) => a - b) };
  }, [years, yearsOnly.years, revenueByYear]);

  // Pruned on READ and never in an effect: switching client cannot leave a render marking a year this
  // client does not have.
  const filters = useMemo(() => sanitizeFilters(rawFilters, universe), [rawFilters, universe]);
  const period = useMemo(() => selectedMonths(filters, universe), [filters, universe]);
  /**
   * The RESOLVED span and not the marks: with no month marked the reading still covers a tramo —every
   * loaded month of the marked years— and a subtitle that named only «2024, 2025, 2026» left the
   * reader to guess which months the figures under it were measured over.
   *
   * Composed HERE and once, so the tiles, the five subtitles, the Excel and the report header cannot
   * name different spans for the same reading.
   */
  const periodName = useMemo(() => periodLabel(period, filters.years), [period, filters.years]);

  const cardsInput = useMemo<RevenueCardsInput>(() => {
    const marked = new Set(filters.years);
    const inputs: RevenueYearInput[] = revenueByYear
      .filter((entry) => marked.has(entry.year))
      .map((entry) => ({
        year: entry.year,
        monthlyRevenue: entry.monthlyRevenue,
        external: externalByYear.get(entry.year) ?? emptyExternalSeries(),
      }));
    return { years: inputs, months: period, period: periodName, canCapture };
  }, [revenueByYear, externalByYear, filters.years, period, periodName, canCapture]);

  const cards = useMemo(
    () =>
      buildRevenueCards(cardsInput, {
        growthUnit,
        comparisonShape,
        annualShape,
        annualView,
        ratioViews,
      }),
    [cardsInput, growthUnit, comparisonShape, annualShape, annualView, ratioViews],
  );
  const summary = useMemo(() => readRevenueSummary(cardsInput), [cardsInput]);

  const addedYears = addedYearsRaw.clientId === clientId ? addedYearsRaw.years : NO_YEARS;

  /**
   * Every year the drawer can be pointed at. It is DELIBERATELY wider than the filter bar's universe:
   * a year whose ventas were never typed —only its cobros con tarjeta— has nothing to compare, but it
   * is exactly the year somebody has to reopen to finish filling in.
   */
  const captureYears = useMemo(() => {
    const all = new Set<number>([...years, ...externalByYear.keys(), ...addedYears]);
    return [...all].sort((a, b) => a - b);
  }, [years, externalByYear, addedYears]);

  /**
   * The drawer opens on the most recent year, which is the one being closed; the user can move it and
   * the choice survives, because it is independent of the marks.
   *
   * Pruned on READ like every other selection in this app: a year opened for one client is not a year
   * of the next, and resolving it here rather than in an effect means no render can ever paint the
   * drawer against a year the open client does not have.
   */
  const captureYear =
    captureYearRaw !== null && captureYears.includes(captureYearRaw)
      ? captureYearRaw
      : (captureYears[captureYears.length - 1] ?? null);

  const addCaptureYear = useCallback(
    (year: number) => {
      setAddedYearsRaw((current) => {
        const kept = current.clientId === clientId ? current.years : NO_YEARS;
        return { clientId, years: kept.includes(year) ? kept : [...kept, year] };
      });
      setCaptureYear(year);
    },
    [clientId],
  );

  /**
   * A year the estado de resultados declares is NOT removable. What the drawer owns is the history
   * somebody typed; the workspace's own years are removed by removing their datasets in Datos, and
   * offering an × over them here would promise something this screen cannot do.
   */
  const canRemoveCaptureYear = useCallback(
    (year: number) => !pygRevenueByYear.has(year),
    [pygRevenueByYear],
  );

  const storedMonthsIn = useCallback(
    (year: number) => external.filter((row) => row.year === year).length,
    [external],
  );

  const removeCaptureYear = useCallback(
    async (year: number) => {
      // Off the local list FIRST, so a year that was only ever opened —and therefore has no row to
      // delete— disappears too. The two are independent: one is what was written, the other is what
      // was merely visited.
      setAddedYearsRaw((current) => {
        const kept = current.clientId === clientId ? current.years : NO_YEARS;
        return { clientId, years: kept.filter((kept_year) => kept_year !== year) };
      });
      if (!clientId || !canCapture) {
        return;
      }
      await deleteRevenueYear(clientId, year);
    },
    [clientId, canCapture],
  );

  const captureSeries = useMemo(
    () =>
      (captureYear === null ? emptyExternalSeries() : externalByYear.get(captureYear)) ??
      emptyExternalSeries(),
    [externalByYear, captureYear],
  );
  const captureRevenue = useMemo(
    () => revenueByYear.find((entry) => entry.year === captureYear)?.monthlyRevenue ?? NO_MONTHS,
    [revenueByYear, captureYear],
  );
  /**
   * Which months the estado de resultados already answers. It is read off `pygRevenueByYear` and not
   * off `captureRevenue`, which is the RESOLVED series: there a typed month and a loaded one look
   * identical, and the drawer would offer an input over a figure it cannot change — or refuse one over
   * a figure it can.
   */
  const captureCoverage = useMemo(() => {
    const fromPyg = captureYear === null ? undefined : pygRevenueByYear.get(captureYear);
    return Array.from(
      { length: MONTHS_IN_YEAR },
      (_, month) => (fromPyg?.[month] ?? null) !== null,
    );
  }, [pygRevenueByYear, captureYear]);

  const saveCapture = useCallback(
    async (monthIndex: number, amounts: RevenueExternalAmounts) => {
      // Guarded here as well as in the UI: a write into the consolidado would create a partition that
      // belongs to nobody, and the defence belongs where the write is, not only where the button is.
      if (!clientId || captureYear === null || !canCapture) {
        return;
      }
      await saveExternalMonth(clientId, captureYear, monthIndex, amounts);
    },
    [clientId, captureYear, canCapture],
  );

  const saveCaptureMonths = useCallback(
    async (months: readonly { monthIndex: number; amounts: RevenueExternalAmounts }[]) => {
      if (!clientId || captureYear === null || !canCapture || months.length === 0) {
        return;
      }
      await saveExternalMonths(clientId, captureYear, months);
    },
    [clientId, captureYear, canCapture],
  );

  const captureRowsForExport = useCallback(
    () =>
      captureYears.map((year) => {
        const resolved =
          revenueByYear.find((entry) => entry.year === year)?.monthlyRevenue ?? NO_MONTHS;
        const external = externalByYear.get(year) ?? emptyExternalSeries();
        return {
          year,
          months: Array.from({ length: MONTHS_IN_YEAR }, (_, month) => ({
            // The RESOLVED ventas and not the stored one: the file must say what the grid shows, and a
            // month PyG covers left empty would read as «no sales» where there were.
            manualRevenue: resolved[month],
            cardRevenue: external.cardRevenue[month],
            cardFees: external.cardFees[month],
            adSpend: external.adSpend[month],
          })),
        };
      }),
    [captureYears, revenueByYear, externalByYear],
  );

  const replaceCaptureYears = useCallback(
    async (years: readonly CaptureYearRows[]) => {
      if (!clientId || !canCapture || years.length === 0) {
        return;
      }
      // The coverage is read PER YEAR off `pygRevenueByYear`, not off `captureCoverage`, which is a
      // view of the one open year: the file may carry five.
      const guarded = years.map(({ year, months }) => {
        const fromPyg = pygRevenueByYear.get(year);
        const stored = externalByYear.get(year);
        return {
          year,
          months: months.map((amounts, month) =>
            (fromPyg?.[month] ?? null) !== null
              ? // The file carries the raíz 4 there by construction (it is what the export wrote),
                // and storing it would put a number nobody reads under a figure Datos owns. The same
                // rule the paste applies: that cell keeps what was stored, and the other three land.
                { ...amounts, manualRevenue: stored?.manualRevenue[month] ?? null }
              : amounts,
          ),
        };
      });
      await replaceExternalYears(clientId, guarded);
      // The years the file brought are now the drawer's too —a year of twelve empty rows holds no
      // stored row, so without this it would vanish from the list— and the drawer opens on the most
      // recent one, which is what the user is about to check.
      const brought = years.map((entry) => entry.year);
      setAddedYearsRaw((current) => {
        const kept = current.clientId === clientId ? current.years : NO_YEARS;
        return { clientId, years: [...new Set([...kept, ...brought])] };
      });
      setCaptureYear(Math.max(...brought));
    },
    [clientId, canCapture, pygRevenueByYear, externalByYear],
  );

  /**
   * Every mark goes through here, and it sanitizes BEFORE applying: the marks are pruned on read, so
   * a toggle has to act on the pruned list and not on whatever a previous client left behind.
   */
  const setFilters = useCallback(
    (next: (current: RevenueFilters) => RevenueFilters) => {
      setRawFilters((current) => next(sanitizeFilters(current, universe)));
    },
    [universe],
  );

  /**
   * Every gesture that WRITES a mark, memoized apart from the value.
   *
   * They depend only on the two universes a toggle needs (`years`, `universe.months`) and on
   * `setFilters`, which is a third of what the value itself depends on. Left inline, each of them was
   * a fresh closure on every render of anything the value tracks —a card rebuild, a capture, a shape
   * switch— so the toolbar re-rendered for reasons that had nothing to do with the marks.
   *
   * The three SHAPES stay out of here on purpose: they are what a card is drawn as, not what the
   * screen is narrowed to, and grouping them together would put a chip's dependency on a segmented
   * control.
   */
  const marks = useMemo(
    () => ({
      toggleYear: (year: number) => setFilters((current) => withYearToggled(current, year, years)),
      clearYears: () => setFilters(withYearsCleared),
      toggleMonth: (month: number) =>
        setFilters((current) => withMonthToggled(current, month, universe.months)),
      clearMonths: () => setFilters(withMonthsCleared),
      // A span writes MONTHS and nothing of its own: there is no fourth mark to keep in sync, which
      // is what keeps «ninguna marca = todos» meaning the same thing after adding two controls.
      toggleSpan: (span: NamedSpan) =>
        setFilters((current) => withSpanToggled(current, span, universe.months)),
    }),
    [setFilters, years, universe.months],
  );

  const value = useMemo<RevenueDataValue>(
    () => ({
      clientId: activeClientId,
      isConsolidated,
      clientName: activeClient?.name,
      ready,
      canCapture,
      universe,
      filters,
      periodName,
      cardsInput,
      cards,
      summary,
      growthUnit,
      setGrowthUnit,
      comparisonShape,
      setComparisonShape,
      annualShape,
      setAnnualShape,
      annualView,
      setAnnualView,
      ratioViews,
      setRatioView,
      ...marks,
      captureYear,
      setCaptureYear,
      captureYears,
      addCaptureYear,
      canRemoveCaptureYear,
      storedMonthsIn,
      removeCaptureYear,
      captureSeries,
      captureRevenue,
      captureCoverage,
      saveCapture,
      saveCaptureMonths,
      captureRowsForExport,
      replaceCaptureYears,
    }),
    [
      marks,
      activeClientId,
      activeClient?.name,
      isConsolidated,
      ready,
      canCapture,
      universe,
      filters,
      periodName,
      cardsInput,
      cards,
      summary,
      growthUnit,
      comparisonShape,
      annualShape,
      annualView,
      ratioViews,
      setRatioView,
      captureYear,
      captureYears,
      addCaptureYear,
      canRemoveCaptureYear,
      storedMonthsIn,
      removeCaptureYear,
      captureSeries,
      captureRevenue,
      captureCoverage,
      saveCapture,
      saveCaptureMonths,
      captureRowsForExport,
      replaceCaptureYears,
    ],
  );

  return <RevenueDataContext.Provider value={value}>{children}</RevenueDataContext.Provider>;
}

export function useRevenueData(): RevenueDataValue {
  const value = useContext(RevenueDataContext);
  if (!value) {
    throw new Error("useRevenueData debe usarse dentro de RevenueDataProvider.");
  }
  return value;
}
