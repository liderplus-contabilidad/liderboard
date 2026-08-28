/**
 * Sums ALL the clients into a single estado de resultados — the same Consolidado that already exists
 * between cost centers and between sucursales, one level up.
 *
 * It is DERIVED on read and never stored: a stored copy would go stale as soon as any of the five
 * clients adjusted a cell, and nothing on screen would say so.
 *
 * It sums just ONCE, with every center of every client flattened into one call to `mergeCenters`. The
 * sum is associative, so summing the centers within each client and then the clients with one another
 * gives exactly the same — and that way no second definition of «summing» appears that could diverge
 * from the first.
 *
 * The charts of accounts are UNITED, not merged: two accounting systems with different numbering
 * (`4.1.01.01.01` of Dingoo vs `4.1.1.1.1` of MicroPlus) produce sibling branches and the totals per
 * root balance all the same, because both hang off `4`.
 *
 * **The COST CENTERS are crossed between clients.** The consolidado returns, besides the total, one
 * dataset per (client, center) pair: that is what the «Centro de costo» filter lists inside the
 * consolidado and what Gráficos compares. Marking centers NARROWS the sum —just as marking clients
 * does—, and it does not fuse them by name: the `restaurante` of three companies is three columns, not
 * one. With centers marked the sum is EXACTLY those centers: a single-statement client has none to
 * come in with and is left out, with a notice saying so, because it does not appear in that list and
 * its absence would not be visible anywhere else.
 */
import { MONTHS_SHORT_ES } from "@/lib/date";
import { formatList, pluralize } from "@/lib/format";
import { FREQUENCY_ORDER, applyEditsToLeafAccounts, mergeCenters } from "./derive";
import type { CellEdit, Frequency, PygDataset } from "./types";
import { CENTER_PALETTE } from "./workspace";

/**
 * The consolidado's id, which is NOT any client's. It lives in the pure layer because it is at once
 * what `db.ts` stores in the `active` table (and therefore what makes it survive a reload) and what
 * the selector marks; one single definition for both things.
 *
 * The two underscores are not decoration: `crypto.randomUUID()` does not produce this shape, so it
 * cannot collide with a real client.
 */
export const CONSOLIDATED_CLIENT_ID = "__consolidado__";

export const CONSOLIDATED_CLIENT_NAME = "Consolidado";

/**
 * Separator of a center's id INSIDE the consolidado. The double colon appears neither in a client
 * uuid nor in a center slug (`slugifyCenter` only leaves letters, digits and hyphens), so the composed
 * id never collides with a loose center's.
 */
const CENTER_REF_SEPARATOR = "::";

/**
 * What a PARTICULAR client's center is called when it is crossed with the others': it is at once the
 * «Centro de costo» filter's mark and the view's id.
 *
 * It is composed because `restaurante` exists in three clients at once and they are three different
 * columns — what is crossed is the PAIR (client, center), not the center's name. Fusing them by name
 * would have summed three companies' restaurants under a single label with nothing saying so.
 */
export function consolidatedCenterId(clientId: string, centerId: string): string {
  return `${clientId}${CENTER_REF_SEPARATOR}${centerId}`;
}

/** What a client contributes to the consolidado: what it holds, already read from its partition. */
export interface ClientContribution {
  clientId: string;
  /** The label the user set — what the notices name. */
  name: string;
  datasets: PygDataset[];
  edits: CellEdit[];
  loadedMonthsByYear: Record<number, number[]>;
}

/**
 * A PIECE of the sum: the statement that went in and which client it came from.
 *
 * It is what makes the consolidado writable sheet by sheet without the Excel having to decide again
 * who went in — the list already is exactly what was summed, so the invariant «the Consolidado is the
 * sum of its sheets» does not depend on two places applying the same filter.
 *
 * The `clientId` is the REAL client's and not the sentinel's, because it is the only thing that pairs
 * the piece with its company's logo; the `dataset`, on the other hand, already arrives with the
 * consolidado's partition set, like everything else that comes out of here.
 */
export interface SummedDetail {
  clientId: string;
  dataset: PygDataset;
}

/** A client that was left out of the sum, and in what words to say it. */
export interface ExcludedClient {
  name: string;
  reason: string;
}

export interface ConsolidatedWorkspace {
  /** One synthetic per year, ascending. Empty if there is nothing to sum. */
  datasets: PygDataset[];
  /**
   * One dataset per (client · center) and year — what the «Centro de costo» filter lists inside the
   * consolidado and what Gráficos compares as series.
   *
   * ALL of the universe's are there, marked or not: marking narrows what `datasets` SUMS, not what can
   * be marked. Empty when no client carries centers, and then the consolidado is still the usual
   * single statement.
   */
  centerDatasets: PygDataset[];
  /**
   * The pieces the total SUMMED, client by client and year by year: the centers that were left inside
   * for whoever has centers, and the whole statement of whoever is single-statement.
   *
   * It is not `centerDatasets` narrowed: that one is the filter's UNIVERSE —marked or not, and centers
   * only—, and this is what was actually summed. With marks, one grows and the other does not.
   */
  summedDatasets: SummedDetail[];
  /** Union of the coverage of the clients that went in. */
  loadedMonthsByYear: Record<number, number[]>;
  /** Coverage gaps, structural conflicts and exclusions, in that order. */
  warnings: string[];
  /** The clients that went in, by name and in the order they arrived (alphabetical). */
  contributors: string[];
  excluded: ExcludedClient[];
}

const EMPTY: ConsolidatedWorkspace = {
  datasets: [],
  centerDatasets: [],
  summedDatasets: [],
  loadedMonthsByYear: {},
  warnings: [],
  contributors: [],
  excluded: [],
};

/**
 * TWO clients with data are needed: with one, the «consolidado» would be that same client under
 * another name, and offering it would be promising a sum that does not exist.
 */
export function canConsolidate(contributions: readonly ClientContribution[]): boolean {
  return eligible(contributions).length >= 2;
}

/**
 * The clients the filter bar left in. **None marked is ALL**, not none — the same rule as cost center
 * and year, so the bar reads the same wherever it is.
 *
 * Marking just one is legitimate and gives that client: the «two are needed» rule decides whether the
 * consolidado is OFFERED (`canConsolidate`), not what whoever is already inside can look at. Leaving
 * it empty on unmarking the second-to-last would be a dead end.
 */
export function selectContributions(
  contributions: readonly ClientContribution[],
  markedIds: readonly string[],
): ClientContribution[] {
  const all = eligible(contributions);
  const marked = new Set(markedIds);
  const picked = all.filter((contribution) => marked.has(contribution.clientId));
  return picked.length > 0 ? picked : all;
}

/** A client that has been created and is still empty contributes nothing: it has neither identity nor
 *  data. */
function eligible(contributions: readonly ClientContribution[]): ClientContribution[] {
  return contributions.filter((contribution) => contribution.datasets.length > 0);
}

/**
 * The centers the filter left in, or `null` —«all»— when there is no LIVE mark.
 *
 * It is the same rule as `selectContributions`, and «live» is what makes it safe: on opening the
 * consolidado, the bar may still carry the marks of a particular client, which do not exist here.
 * Without this cross-check against the universe, those orphan marks would empty the screen instead of
 * saying nothing.
 */
function selectCenters(
  universe: readonly PygDataset[],
  marked: readonly string[],
): Set<string> | null {
  const available = new Set(universe.map((dataset) => dataset.centerId as string));
  const picked = marked.filter((id) => available.has(id));
  return picked.length > 0 ? new Set(picked) : null;
}

/**
 * Whether a dataset goes into the SUM.
 *
 * **Marking centers leads over «Cliente»**: filtering by centers is asking for the sum of THOSE
 * centers and of nothing else, so a single-statement client —which has none to come in with— is left
 * out while there are marks, and it is said (`withoutCentersNotice`). Slipping it in whole turned «the
 * group's three restaurants» into «the three restaurants plus a whole company», and since MicroPlus'
 * and Dingoo's files are single-statement, that was almost always the entire sum.
 *
 * With no mark at all there is nothing to narrow and everything «Cliente» left in goes in.
 */
function contributes(dataset: PygDataset, clientId: string, selected: Set<string> | null): boolean {
  if (selected === null) {
    return true;
  }
  if (dataset.centerId === undefined) {
    return false;
  }
  return selected.has(consolidatedCenterId(clientId, dataset.centerId));
}

export function consolidateClients(
  contributions: readonly ClientContribution[],
  /**
   * The (client · center) pairs marked in the bar. None marked is ALL, the same rule as the rest of
   * the filters — and marking narrows what is SUMMED, not what can be marked.
   */
  markedCenterIds: readonly string[] = [],
): ConsolidatedWorkspace {
  const withData = eligible(contributions);
  if (withData.length === 0) {
    return EMPTY;
  }

  const base = referenceFrequency(withData);
  const excluded: ExcludedClient[] = [];
  const included: ClientContribution[] = [];
  for (const contribution of withData) {
    if (contribution.datasets.every((dataset) => dataset.baseFrequency === base)) {
      included.push(contribution);
    } else {
      excluded.push({
        name: contribution.name,
        reason: `su estado es ${describeFrequencies(contribution)} y el resto es ${base}`,
      });
    }
  }
  if (included.length === 0) {
    return EMPTY;
  }

  // The universe of centers is assembled over the INCLUDED clients and before looking at any mark:
  // the filter has to be able to offer what is not marked yet.
  const centerDatasets = buildCenterDatasets(included);
  const selected = selectCenters(centerDatasets, markedCenterIds);

  // What each client contributes to the sum, already narrowed. A client whose centers were all left
  // out contributes nothing, and stops counting for the coverage too: a notice naming it among the
  // absent ones would talk about a client the user themselves set aside.
  const contributing = included
    .map((contribution) => ({
      contribution,
      datasets: contribution.datasets.filter((dataset) =>
        contributes(dataset, contribution.clientId, selected),
      ),
    }))
    .filter((entry) => entry.datasets.length > 0);
  if (contributing.length === 0) {
    return EMPTY;
  }

  const years = [
    ...new Set(contributing.flatMap((e) => e.datasets.map((dataset) => dataset.year))),
  ].sort((a, b) => a - b);

  const loadedMonthsByYear: Record<number, number[]> = {};
  for (const year of years) {
    const covered = new Set<number>();
    for (const { contribution } of contributing) {
      for (const month of contribution.loadedMonthsByYear[year] ?? []) {
        covered.add(month);
      }
    }
    loadedMonthsByYear[year] = [...covered].sort((a, b) => a - b);
  }

  const structural = new Set<string>();
  const datasets = years.map((year) => {
    // Every center that was left inside, of every client of that year, with their adjustments already
    // applied. A client by centers contributes those of its own that are marked; a single-statement
    // one contributes its own — the sum does not tell them apart, which is precisely why the
    // consolidado does not need to know which mode each one is in.
    const contributed = contributing.flatMap(({ contribution, datasets: own }) =>
      own
        .filter((dataset) => dataset.year === year)
        .map((dataset) =>
          applyEditsToLeafAccounts(
            dataset.accounts,
            contribution.edits.filter((edit) => edit.datasetId === dataset.id),
          ),
        ),
    );
    const merged = mergeCenters(contributed, "cliente");
    for (const warning of merged.warnings) {
      structural.add(warning);
    }
    return syntheticDataset(year, base, merged.accounts, loadedMonthsByYear[year]);
  });

  const summed = contributing.map((entry) => entry.contribution);
  return {
    datasets,
    centerDatasets,
    summedDatasets: buildSummedDatasets(contributing, centerDatasets),
    loadedMonthsByYear,
    warnings: [
      ...coverageWarnings(summed, years, loadedMonthsByYear),
      ...structural,
      ...withoutCentersNotice(selected === null ? [] : withoutCenters(included)),
      ...excluded.map(({ name, reason }) => `«${name}» quedó fuera del consolidado: ${reason}.`),
    ],
    contributors: summed.map((contribution) => contribution.name),
    excluded,
  };
}

/**
 * The pieces of the sum, in the order they are read: client on the outside —alphabetical,
 * `contributions`'— and, within each one, its centers by their `order` and then by year.
 *
 * A center REUSES its `centerDatasets` entry, which already brings the composed id, the colour and the
 * applied adjustments: deriving a second version of the same center is exactly how the two end up
 * saying different figures. A single-statement client has none, so its own is derived with the same
 * rule —adjustments folded and the consolidado's partition set.
 */
function buildSummedDatasets(
  contributing: readonly { contribution: ClientContribution; datasets: PygDataset[] }[],
  centerDatasets: readonly PygDataset[],
): SummedDetail[] {
  const byCenterYear = new Map(
    centerDatasets.map((dataset) => [`${dataset.centerId}|${dataset.year}`, dataset]),
  );
  return contributing.flatMap(({ contribution, datasets }) =>
    [...datasets]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.year - b.year)
      .map((dataset) => ({
        clientId: contribution.clientId,
        dataset:
          (dataset.centerId === undefined
            ? undefined
            : byCenterYear.get(
                `${consolidatedCenterId(contribution.clientId, dataset.centerId)}|${dataset.year}`,
              )) ?? consolidatedDataset(contribution, dataset),
      })),
  );
}

/**
 * A client's dataset as it goes into the consolidado: its adjustments already folded into the accounts
 * —applying them again downstream would count them twice— and the consolidado's partition set. The
 * name it carries is the LABEL the user gave the client and not the file's razón social, which is how
 * the consolidado names its clients on every other screen.
 */
function consolidatedDataset(contribution: ClientContribution, dataset: PygDataset): PygDataset {
  return {
    ...dataset,
    id: `${CONSOLIDATED_CLIENT_ID}-${contribution.clientId}-${dataset.year}`,
    clientId: CONSOLIDATED_CLIENT_ID,
    companyName: contribution.name,
    accounts: applyEditsToLeafAccounts(
      dataset.accounts,
      contribution.edits.filter((edit) => edit.datasetId === dataset.id),
    ),
    // No file declares the profit of a loose piece inside a sum of companies.
    resultFromFile: [],
    warnings: [],
  };
}

/**
 * A synthetic dataset per (client · center) and year: the «Centro de costo» filter's universe inside
 * the consolidado, and the views Gráficos compares.
 *
 * The label's two halves travel SEPARATELY —`costCenterName` is the center, `companyName` the client—
 * because the dropdown reads them separately (the client's heading above, its centers below) and
 * everything else reads them together («Restaurante · Dingoo» in the chip, in the legend and in the
 * report, because the same center exists in several companies). Composing them here would have forced
 * the dropdown to undo the composition to split it again.
 *
 * The colour and the order are handed out over the WHOLE universe, client on the outside and center on
 * the inside, so those of one same company stay together in the dropdown and a center does not change
 * colour on changing year. `sin-centro` keeps the last place within its client, which is where the
 * source `order` had already put it.
 */
function buildCenterDatasets(included: readonly ClientContribution[]): PygDataset[] {
  // One slot per PAIR, not per dataset: a center with two years takes just one, so it keeps its colour
  // and its place on changing year.
  const slots = new Map<string, number>();
  const out: PygDataset[] = [];
  for (const contribution of included) {
    const ofClient = [...contribution.datasets]
      .filter((dataset) => dataset.centerId !== undefined)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.year - b.year);
    for (const dataset of ofClient) {
      const id = consolidatedCenterId(contribution.clientId, dataset.centerId as string);
      const slot = slots.get(id) ?? slots.size;
      slots.set(id, slot);
      out.push({
        ...dataset,
        id: `${CONSOLIDATED_CLIENT_ID}-${id}-${dataset.year}`,
        clientId: CONSOLIDATED_CLIENT_ID,
        centerId: id,
        order: slot,
        centerColor: CENTER_PALETTE[slot % CENTER_PALETTE.length],
        costCenterName: dataset.costCenterName || (dataset.centerId as string),
        companyName: contribution.name,
        accounts: applyEditsToLeafAccounts(
          dataset.accounts,
          contribution.edits.filter((edit) => edit.datasetId === dataset.id),
        ),
        // No file declares the profit of a loose center inside a sum of companies.
        resultFromFile: [],
        warnings: [],
      });
    }
  }
  return out;
}

/** The single-statement clients: the ones with no center to come in with. */
function withoutCenters(included: readonly ClientContribution[]): string[] {
  return included
    .filter((contribution) =>
      contribution.datasets.every((dataset) => dataset.centerId === undefined),
    )
    .map((contribution) => contribution.name);
}

/**
 * The notice of who a filter by centers leaves out without it being visible.
 *
 * It only appears with centers marked, and only for single-statement clients: a client by centers that
 * is left out is so because the user marked none of its own, and that is in plain sight in the list
 * itself. This one does not even appear in it —it has no centers to offer—, so without this line it
 * would disappear from the sum with nothing saying so.
 */
function withoutCentersNotice(names: readonly string[]): string[] {
  if (names.length === 0) {
    return [];
  }
  const quoted = names.map((name) => `«${name}»`);
  return [
    names.length === 1
      ? `${quoted[0]} no tiene centros de costo: queda fuera mientras filtres por centro.`
      : `${formatList(quoted)} no tienen centros de costo: quedan fuera mientras filtres por centro.`,
  ];
}

/**
 * The TOTAL is presented as a SINGLE STATEMENT (`role: "single"`), not as a center: it is the sum of
 * the centers that went in plus the clients that have none, so it belongs to no center in particular.
 * The centers travel separately, in `centerDatasets`, and that is where the filter lists them and
 * Gráficos compares them.
 */
function syntheticDataset(
  year: number,
  base: Frequency,
  accounts: PygDataset["accounts"],
  covered: number[],
): PygDataset {
  return {
    id: `${CONSOLIDATED_CLIENT_ID}-${year}`,
    clientId: CONSOLIDATED_CLIENT_ID,
    fileName: "",
    uploadedAt: 0,
    companyName: CONSOLIDATED_CLIENT_NAME,
    periodLabel: coverageLabel(year, base, covered),
    year,
    baseFrequency: base,
    role: "single",
    accounts,
    // No file declares the profit of a sum of companies: it is derived or it does not exist.
    resultFromFile: [],
    warnings: [],
  };
}

/** «Ene–Jun 2026» over the real coverage, so the header does not promise a complete year. */
function coverageLabel(year: number, base: Frequency, covered: number[]): string {
  if (base !== "mensual" || covered.length === 0) {
    return `${year}`;
  }
  const first = MONTHS_SHORT_ES[covered[0]];
  const last = MONTHS_SHORT_ES[covered[covered.length - 1]];
  return first === last ? `${first} ${year}` : `${first}–${last} ${year}`;
}

/**
 * The base frequency the rest is measured against: the one MOST clients share, and on a tie the finest.
 *
 * Fixing it at `"mensual"` would have excluded everyone in an entirely annual space, and taking the
 * first one's would have left the sum at the mercy of alphabetical order. Today everything is monthly,
 * so this excludes nobody; it exists so a legacy annual one is not summed against twelve columns.
 */
function referenceFrequency(contributions: readonly ClientContribution[]): Frequency {
  const votes = new Map<Frequency, number>();
  for (const contribution of contributions) {
    for (const frequency of new Set(contribution.datasets.map((d) => d.baseFrequency))) {
      votes.set(frequency, (votes.get(frequency) ?? 0) + 1);
    }
  }
  return [...votes.entries()].sort(
    ([freqA, countA], [freqB, countB]) =>
      countB - countA || FREQUENCY_ORDER.indexOf(freqA) - FREQUENCY_ORDER.indexOf(freqB),
  )[0][0];
}

function describeFrequencies(contribution: ClientContribution): string {
  return formatList([...new Set(contribution.datasets.map((d) => d.baseFrequency))]);
}

/**
 * One notice per SPAN of consecutive months missing the same clients — never one per month or per
 * account, the same rule as the balance.
 *
 * Without this, a partial sum is indistinguishable from a real fall in the business: April with three
 * of five clients reads as the group having sold half.
 */
function coverageWarnings(
  included: readonly ClientContribution[],
  years: readonly number[],
  loadedMonthsByYear: Record<number, number[]>,
): string[] {
  const warnings: string[] = [];
  for (const year of years) {
    const covered = loadedMonthsByYear[year] ?? [];
    // Who is missing in each covered month, in the order of the client list.
    const missingByMonth = new Map<number, string[]>();
    for (const month of covered) {
      const missing = included
        .filter((contribution) => !(contribution.loadedMonthsByYear[year] ?? []).includes(month))
        .map((contribution) => contribution.name);
      if (missing.length > 0) {
        missingByMonth.set(month, missing);
      }
    }

    let run: { start: number; end: number; missing: string[] } | null = null;
    const flush = () => {
      if (run) {
        warnings.push(describeGap(year, run.start, run.end, run.missing, included.length));
        run = null;
      }
    };
    for (const month of covered) {
      const missing = missingByMonth.get(month);
      if (!missing) {
        flush();
        continue;
      }
      // The same set of absentees AND consecutive months: a single span. A month gap breaks the span
      // even if the same ones are missing, because «Abril–Junio» would say May is loaded too.
      if (run && run.end === month - 1 && sameNames(run.missing, missing)) {
        run.end = month;
        continue;
      }
      flush();
      run = { start: month, end: month, missing };
    }
    flush();
  }
  return warnings;
}

function describeGap(
  year: number,
  start: number,
  end: number,
  missing: readonly string[],
  total: number,
): string {
  const span =
    start === end
      ? `${MONTHS_SHORT_ES[start]} ${year}`
      : `${MONTHS_SHORT_ES[start]}–${MONTHS_SHORT_ES[end]} ${year}`;
  const loaded = total - missing.length;
  return `${span}: ${loaded} de ${pluralize(total, "cliente")} con datos (${
    missing.length === 1 ? "falta" : "faltan"
  } ${formatList(missing)}).`;
}

function sameNames(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((name, index) => name === b[index]);
}
