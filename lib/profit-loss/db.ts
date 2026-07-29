/**
 * IndexedDB persistence via Dexie, and the ONLY door to it. Original datasets and user edits live
 * in SEPARATE tables so the original stays intact — the future original-vs-edited comparison
 * reads both sides as-is.
 *
 * Everything here is partitioned by CLIENT. That is not a convention: with several clients' data
 * sharing four tables, one unbounded query mixes two companies' statements in silence and nothing
 * downstream can tell. So no component reads a table — every read and every write goes through a
 * function below that takes the `clientId`, and `db` itself is exported only for the tests that
 * assert the partition holds.
 *
 * `edits` is the one table with no `clientId`: it hangs off `datasetId`, which is unique across
 * clients, so an edit cannot reach the wrong client even with a bug. What it gains here is
 * CASCADE — deleting a client takes its edits with it.
 */
import Dexie, { type Table } from "dexie";
import { sortClients, type PygClient } from "./clients";
import { segmentAccounts } from "./segment";
import { assignCenterSlots } from "./workspace";
import type { CellEdit, ImportedComment, ParsedDataset, PygDataset, WorkspaceMeta } from "./types";
import { LEGACY_SYSTEM } from "./upload/systems";
import { deriveWorkspaceIdentity, type WorkspaceIdentity } from "./workspace-identity";

/** One client's workspace metadata (company, warnings, active selector id), keyed by `clientId`.
 * It was the singleton row `"workspace"` until v7; it did not gain or lose a field, it just
 * stopped being unique. */
interface WorkspaceMetaRow extends WorkspaceMeta {
  key: string;
}

/** The one-row table that remembers which client is open, so it survives a reload. */
interface ActiveClientRow {
  key: "active";
  clientId: string | null;
}

const ACTIVE_KEY = "active";

class PygDb extends Dexie {
  clients!: Table<PygClient, string>;
  datasets!: Table<PygDataset, string>;
  edits!: Table<CellEdit, number>;
  meta!: Table<WorkspaceMetaRow, string>;
  active!: Table<ActiveClientRow, string>;

  constructor() {
    super("liderboard-pyg");
    this.version(1).stores({
      datasets: "id",
      edits: "++id, datasetId, &[datasetId+code+monthIndex]",
    });
    // v2: datasets may hold several rows (a workspace); add the meta singleton.
    // Existing v1 datasets are stamped role:"single" so they keep working.
    this.version(2)
      .stores({
        datasets: "id, role, order",
        edits: "++id, datasetId, &[datasetId+code+monthIndex]",
        meta: "key",
      })
      .upgrade(async (tx) => {
        await tx
          .table<PygDataset>("datasets")
          .toCollection()
          .modify((d) => {
            if (!d.role) {
              d.role = "single";
            }
          });
      });
    // v3: the by-centers formats that produced "center"/"sin-centro" datasets are retired
    // (see the monthly-cost-center-upload change) — no strategy can read them back under the
    // new model, so they and their edits are discarded. "single" datasets, and their edits,
    // are untouched: the single-statement flow doesn't change.
    this.version(3)
      .stores({
        datasets: "id, role, order",
        edits: "++id, datasetId, &[datasetId+code+monthIndex]",
        meta: "key",
      })
      .upgrade(async (tx) => {
        const datasetsTable = tx.table<PygDataset>("datasets");
        const retired = await datasetsTable
          .filter((d) => d.role === "center" || d.role === "sin-centro")
          .toArray();
        if (retired.length === 0) {
          return;
        }
        const retiredIds = retired.map((d) => d.id);
        await datasetsTable.bulkDelete(retiredIds);
        await tx.table<CellEdit>("edits").where("datasetId").anyOf(retiredIds).delete();
        await tx.table("meta").clear();
      });
    // v4: the two single-statement formats that produced base-anual datasets (the twelve-month
    // export and the Total-only annual export) are retired by `monthly-single-statement-upload`
    // — neither can be reinterpreted as monthly, so they and their edits are discarded. A
    // surviving base-mensual single dataset adopts `loadedMonths` inferred from which months
    // hold a non-zero value anywhere in its accounts — the same heuristic the app already used
    // for coverage, so this is not a regression, just a inference documented as such.
    this.version(4)
      .stores({
        datasets: "id, role, order",
        edits: "++id, datasetId, &[datasetId+code+monthIndex]",
        meta: "key",
      })
      .upgrade(async (tx) => {
        const datasetsTable = tx.table<PygDataset>("datasets");
        const singleDatasets = await datasetsTable.filter((d) => d.role === "single").toArray();
        const annualIds = singleDatasets
          .filter((d) => d.baseFrequency === "anual")
          .map((d) => d.id);
        if (annualIds.length > 0) {
          await datasetsTable.bulkDelete(annualIds);
          await tx.table<CellEdit>("edits").where("datasetId").anyOf(annualIds).delete();
          if ((await datasetsTable.count()) === 0) {
            await tx.table("meta").clear();
          }
        }

        const survivingMonthly = singleDatasets.filter((d) => d.baseFrequency === "mensual");
        if (survivingMonthly.length === 0) {
          return;
        }
        const metaRow = await tx.table("meta").get("workspace");
        if (!metaRow) {
          return;
        }
        const loadedMonths = new Set<number>();
        for (const dataset of survivingMonthly) {
          for (const account of dataset.accounts) {
            account.values.forEach((value, monthIndex) => {
              if (value !== 0) {
                loadedMonths.add(monthIndex);
              }
            });
          }
        }
        await tx.table("meta").put({
          ...metaRow,
          loadedMonths: [...loadedMonths].sort((a, b) => a - b),
        });
      });
    // v5: the workspace records which accounting SYSTEM it came from (`microplus-upload-support`
    // adds a second one). Nothing is discarded — an already-stored workspace can only have come
    // from the single-statement strategy, so it adopts that id.
    this.version(5)
      .stores({
        datasets: "id, role, order",
        edits: "++id, datasetId, &[datasetId+code+monthIndex]",
        meta: "key",
      })
      .upgrade(async (tx) => {
        await tx
          .table<WorkspaceMetaRow>("meta")
          .toCollection()
          .modify((row) => {
            if (!row.sourceSystemId) {
              row.sourceSystemId = LEGACY_SYSTEM;
            }
          });
      });
    // v6: a dataset becomes a CENTER-YEAR (`pyg-multi-year`), so coverage moves onto the year
    // axis. Purely ADDITIVE: nothing is deleted, because a workspace here is the user's only
    // copy of its adjustments — the year that was already loaded simply becomes the first key
    // of `loadedMonthsByYear`, and datasets that never got a year stamped adopt the
    // workspace's. A workspace with no resolvable year is left empty rather than filed under
    // an invented one.
    this.version(6)
      .stores({
        datasets: "id, role, order, year",
        edits: "++id, datasetId, &[datasetId+code+monthIndex]",
        meta: "key",
      })
      .upgrade(async (tx) => {
        const datasetsTable = tx.table<LegacyDataset>("datasets");
        const datasets = await datasetsTable.toArray();
        const metaRow = await tx.table<LegacyMetaRow>("meta").get("workspace");
        if (!metaRow) {
          return;
        }
        const year = datasets.find((d) => d.year != null)?.year ?? null;
        if (year === null) {
          await tx.table("meta").clear();
          return;
        }
        await datasetsTable.toCollection().modify((dataset) => {
          if (dataset.year == null) {
            dataset.year = year;
          }
        });
        const { loadedMonths, ...rest } = metaRow;
        await tx.table("meta").put({ ...rest, loadedMonthsByYear: { [year]: loadedMonths ?? [] } });
      });
    // v7: PyG holds several CLIENTS (`pyg-clients`). The workspace stops being a singleton — it
    // gains a `clients` table, every dataset gains a `clientId`, `meta` goes from the one row
    // `"workspace"` to one row PER CLIENT, and `active` remembers which one is open.
    //
    // Purely ADDITIVE, by design: Dexie has no downgrade, so a defective upgrade cannot be
    // rolled back. Nothing is deleted here — not a dataset, not an edit — so a failure leaves the
    // data readable by a later correction instead of lost. A database that never loaded anything
    // gets NO client: the app starts in its empty state and the user creates the first one.
    this.version(7)
      .stores({
        clients: "id, name",
        datasets: "id, clientId, [clientId+role], [clientId+year]",
        edits: "++id, datasetId, &[datasetId+code+monthIndex]",
        meta: "key",
        active: "key",
      })
      .upgrade(async (tx) => {
        const metaTable = tx.table<WorkspaceMetaRow>("meta");
        const datasetsTable = tx.table<PygDataset>("datasets");
        const workspace = await metaTable.get("workspace");
        const datasets = await datasetsTable.toArray();
        // A database that never loaded anything gets no client. The datasets alone are enough to
        // trigger this, not just the `meta` row: the v3 upgrade could clear the metadata while
        // leaving a `single` dataset behind, and a dataset with no client would be unreachable —
        // which is discarding it by another name.
        if (!workspace && datasets.length === 0) {
          return;
        }
        const clientId = crypto.randomUUID();
        // The company is the only name the app has ever known for this data; `Cliente 1` is the
        // fallback rather than an empty row in the selector. A workspace row that HAS a company,
        // even a blank one, is the authority — falling through to the dataset's would quietly
        // override what the user's own metadata said.
        const name =
          (workspace ? workspace.companyName.trim() : datasets[0]?.companyName.trim()) ||
          "Cliente 1";
        await tx.table<PygClient>("clients").add({ id: clientId, name });
        await datasetsTable.toCollection().modify((dataset) => {
          dataset.clientId = clientId;
        });
        if (workspace) {
          const { key: _key, ...meta } = workspace;
          await metaTable.delete("workspace");
          await metaTable.put({ key: clientId, ...meta });
        }
        await tx.table<ActiveClientRow>("active").put({ key: ACTIVE_KEY, clientId });
      });
  }
}

/** The pre-v6 shapes, needed only to read the old rows during the upgrade. Pre-v7 rows have no
 * `clientId` either, which is why these build on `ParsedDataset`. */
type LegacyDataset = Omit<ParsedDataset, "year"> & { year: number | null };
type LegacyMetaRow = Omit<WorkspaceMetaRow, "loadedMonthsByYear"> & { loadedMonths?: number[] };

export const db = new PygDb();

/** Stamps the open client onto what the pure layer produced. The one place a dataset acquires
 * an owner — see `ParsedDataset`. */
function owned(clientId: string, datasets: readonly ParsedDataset[]): PygDataset[] {
  return datasets.map((dataset) => ({ ...dataset, clientId }));
}

/** Turns an imported comment/adjustment payload into `edits` rows. */
function seedEdits(
  commentsByDataset: readonly { datasetId: string; comments: ImportedComment[] }[],
): Omit<CellEdit, "id">[] {
  const now = Date.now();
  return commentsByDataset.flatMap(({ datasetId, comments }) =>
    comments.map((c) => ({
      datasetId,
      code: c.code,
      monthIndex: c.monthIndex,
      ...(c.value !== undefined ? { value: c.value } : {}),
      ...(c.comment ? { comment: c.comment } : {}),
      updatedAt: now,
    })),
  );
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

/** Every client, ordered by name — the list's only order (see `clients.ts`). */
export async function listClients(): Promise<PygClient[]> {
  return sortClients(await db.clients.toArray());
}

/**
 * Creates an EMPTY client and opens it. The name is taken as given: validation and duplicate
 * checking are `clients.ts`'s, and the caller runs them where it can say what is wrong.
 */
export async function createClient(name: string): Promise<PygClient> {
  const client: PygClient = { id: crypto.randomUUID(), name };
  await db.transaction("rw", db.clients, db.active, async () => {
    await db.clients.add(client);
    await db.active.put({ key: ACTIVE_KEY, clientId: client.id });
  });
  return client;
}

/** Renaming touches the label and NOTHING else: the identity is derived from the data. */
export async function renameClient(clientId: string, name: string): Promise<void> {
  await db.clients.update(clientId, { name });
}

/**
 * Deletes a client and everything that hangs off it — its datasets, their edits and its `meta`
 * row — in ONE transaction, so a failure can never leave edits orphaned from the datasets they
 * overlay. No other client is touched.
 *
 * Deleting the OPEN client hands the app to the first remaining one BY NAME; deleting the last
 * one leaves no active client and the app falls back to its empty state.
 */
export async function deleteClient(clientId: string): Promise<void> {
  await db.transaction("rw", db.clients, db.datasets, db.edits, db.meta, db.active, async () => {
    const ids = (await db.datasets.where("clientId").equals(clientId).toArray()).map((d) => d.id);
    if (ids.length > 0) {
      await db.edits.where("datasetId").anyOf(ids).delete();
      await db.datasets.bulkDelete(ids);
    }
    await db.meta.delete(clientId);
    await db.clients.delete(clientId);

    const active = await db.active.get(ACTIVE_KEY);
    if (active?.clientId !== clientId) {
      return;
    }
    const remaining = sortClients(await db.clients.toArray());
    await db.active.put({ key: ACTIVE_KEY, clientId: remaining[0]?.id ?? null });
  });
}

export async function setActiveClient(clientId: string | null): Promise<void> {
  await db.active.put({ key: ACTIVE_KEY, clientId });
}

/** The open client's id, or `null` — which is also what a brand-new install reads. */
export async function getActiveClientId(): Promise<string | null> {
  return (await db.active.get(ACTIVE_KEY))?.clientId ?? null;
}

/** One client as the selector shows it: its name, what it is, and which years it holds. */
export interface ClientSummary extends PygClient {
  /** `null` for a client with no data yet — it has no identity until its first upload adopts one. */
  identity: WorkspaceIdentity | null;
  /** Ascending; `[]` for a client with no data. */
  years: number[];
}

/**
 * Every client with what it holds — ONE query behind both the selector's sublines and
 * `findClientForIdentity`, which is what lets the clash dialog say «este archivo sí es de
 * Dingoo» without the caller reading a table.
 */
export async function listClientSummaries(): Promise<ClientSummary[]> {
  const [clients, datasets, metaRows] = await Promise.all([
    db.clients.toArray(),
    db.datasets.toArray(),
    db.meta.toArray(),
  ]);
  const metaByClient = new Map(metaRows.map((row) => [row.key, row]));
  const byClient = new Map<string, PygDataset[]>();
  for (const dataset of datasets) {
    byClient.set(dataset.clientId, [...(byClient.get(dataset.clientId) ?? []), dataset]);
  }
  return sortClients(
    clients.map((client) => {
      const own = byClient.get(client.id) ?? [];
      return {
        ...client,
        identity: deriveWorkspaceIdentity(own, metaByClient.get(client.id)),
        years: [...new Set(own.map((d) => d.year))].sort((a, b) => a - b),
      };
    }),
  );
}

/** What a client holds, in the terms the delete confirmation counts in. */
export interface ClientContents {
  years: number[];
  centers: number;
  accounts: number;
  comments: number;
}

/**
 * Quantifies what deleting a client discards. Naming it in the abstract («sus datos») is what
 * makes an irreversible action easy to confirm by accident, so the modal counts instead.
 */
export async function describeClientContents(clientId: string): Promise<ClientContents> {
  const datasets = await db.datasets.where("clientId").equals(clientId).toArray();
  const edits = await editsOfDatasets(datasets.map((d) => d.id));
  return {
    years: [...new Set(datasets.map((d) => d.year))].sort((a, b) => a - b),
    // Centers are counted across years: the same center in 2025 and 2026 is one center.
    centers: new Set(
      datasets.filter((d) => d.centerId !== undefined).map((d) => d.centerId as string),
    ).size,
    accounts: new Set(datasets.flatMap((d) => d.accounts.map((a) => a.code))).size,
    comments: edits.filter((edit) => Boolean(edit.comment)).length,
  };
}

// ---------------------------------------------------------------------------
// Scoped reads
// ---------------------------------------------------------------------------

/** Every dataset of one client. `toArray()` (never an index scan on `order`): IndexedDB indexes
 * exclude rows whose key is undefined, so `order`-less single datasets would vanish. */
export async function clientDatasets(clientId: string): Promise<PygDataset[]> {
  return db.datasets.where("clientId").equals(clientId).toArray();
}

/** Every edit of one client, resolved through its datasets — `edits` has no `clientId` of its
 * own, and does not need one (`datasetId` is unique across clients). */
export async function clientEdits(clientId: string): Promise<CellEdit[]> {
  const ids = (await clientDatasets(clientId)).map((d) => d.id);
  return editsOfDatasets(ids);
}

export async function datasetEdits(datasetId: string): Promise<CellEdit[]> {
  return db.edits.where("datasetId").equals(datasetId).toArray();
}

/** One cell's stored edit, if any — what «Quitar ajuste» reads to keep its comment. */
export async function getCellEdit(
  datasetId: string,
  code: string,
  monthIndex: number,
): Promise<CellEdit | undefined> {
  return db.edits
    .where("[datasetId+code+monthIndex]")
    .equals([datasetId, code, monthIndex])
    .first();
}

/** How many adjustments and comments live in the given years of one client — what the
 * «Excel completo» replace confirmation puts a number on. */
export async function countEditsForYears(
  clientId: string,
  years: readonly number[],
): Promise<number> {
  const datasets = await clientDatasets(clientId);
  const ids = datasets.filter((d) => years.includes(d.year)).map((d) => d.id);
  return ids.length === 0 ? 0 : db.edits.where("datasetId").anyOf(ids).count();
}

async function editsOfDatasets(datasetIds: readonly string[]): Promise<CellEdit[]> {
  return datasetIds.length === 0
    ? []
    : db.edits
        .where("datasetId")
        .anyOf([...datasetIds])
        .toArray();
}

// ---------------------------------------------------------------------------
// Scoped writes
// ---------------------------------------------------------------------------

/**
 * Replaces ONE client's workspace — the destructive path the clash dialog gates behind an
 * explicit confirmation. Every other client is untouched, which is the whole point: this used to
 * be a `clear()` of three tables.
 *
 * The COMMENTS of accounts that also exist in the new file survive; the value adjustments do not.
 * A comment is a note the accountant wrote about an account, and it stays true when the same
 * account arrives again from a renamed company or a new accounting system — whereas an adjustment
 * is a correction over one specific figure, which the new file has just replaced. A comment whose
 * account is not in the new file goes with its account.
 */
export async function replaceClientWorkspace(
  clientId: string,
  datasets: ParsedDataset[],
  meta: WorkspaceMeta,
  commentsByDataset: { datasetId: string; comments: ImportedComment[] }[] = [],
): Promise<void> {
  const next = owned(clientId, datasets);
  await db.transaction("rw", db.datasets, db.edits, db.meta, async () => {
    const previous = await clientDatasets(clientId);
    const previousIds = previous.map((d) => d.id);
    const survivors = survivingComments(previous, await editsOfDatasets(previousIds), next);

    if (previousIds.length > 0) {
      await db.edits.where("datasetId").anyOf(previousIds).delete();
      await db.datasets.bulkDelete(previousIds);
    }
    await db.datasets.bulkAdd(next);
    await db.meta.put({ key: clientId, ...meta });

    const seeds = [...survivors, ...seedEdits(commentsByDataset)];
    if (seeds.length > 0) {
      await db.edits.bulkAdd(seeds);
    }
  });
}

/**
 * The comments that survive a replace, re-pointed at the datasets that now hold their accounts.
 * A comment is matched by (centro, año, cuenta, mes): the same account of another center is a
 * different cell, so moving a note there would be inventing it somewhere it was never written.
 */
function survivingComments(
  previous: readonly PygDataset[],
  edits: readonly CellEdit[],
  next: readonly PygDataset[],
): Omit<CellEdit, "id">[] {
  const slotOf = (dataset: ParsedDataset) => `${dataset.centerId ?? dataset.role}|${dataset.year}`;
  const previousById = new Map(previous.map((d) => [d.id, d]));
  const nextBySlot = new Map(next.map((d) => [slotOf(d), d]));
  const codesById = new Map(next.map((d) => [d.id, new Set(d.accounts.map((a) => a.code))]));

  const now = Date.now();
  const kept: Omit<CellEdit, "id">[] = [];
  for (const edit of edits) {
    if (!edit.comment) {
      continue;
    }
    const source = previousById.get(edit.datasetId);
    const target = source && nextBySlot.get(slotOf(source));
    if (!target || !codesById.get(target.id)?.has(edit.code)) {
      continue;
    }
    kept.push({
      datasetId: target.id,
      code: edit.code,
      monthIndex: edit.monthIndex,
      comment: edit.comment,
      updatedAt: now,
    });
  }
  return kept;
}

/**
 * Applies a merged month onto the by-centers workspace: upserts `datasets` (existing centers
 * overwritten, new ones added — `mergeMonthSlice` already produced the complete set, nothing
 * is ever deleted here) and writes `meta`, WITHOUT touching `edits`. This is what lets a
 * reload survive the user's adjustments: the base changes, the overlay does not.
 */
export async function applyMonthSlice(
  clientId: string,
  datasets: ParsedDataset[],
  meta: WorkspaceMeta,
): Promise<void> {
  const next = owned(clientId, datasets);
  await db.transaction("rw", db.datasets, db.meta, async () => {
    await db.datasets.bulkPut(next);
    await db.meta.put({ key: clientId, ...meta });
  });
}

/**
 * Loads the app's own workbook, MERGING BY YEAR: every year the file carries replaces that year
 * whole (its datasets and its adjustments), and a year the file does NOT carry is left exactly
 * as it was.
 *
 * This is the difference between «Excel completo» being a restore and being a wipe. With 2025,
 * 2026 and 2027 loaded, re-uploading a backup taken when only 2025 and 2026 existed used to
 * discard 2027 without ever naming it; now it does not touch it.
 *
 * The trade-off is deliberate and specified: the file stops being a faithful snapshot of the
 * whole workspace — restoring it does not guarantee the exact state you had, because the years
 * it omits survive. That is preferred to the alternative, where an old file silently destroys a
 * year loaded after it.
 */
export async function mergeWorkspaceYears(
  clientId: string,
  datasets: ParsedDataset[],
  meta: WorkspaceMeta,
  commentsByDataset: { datasetId: string; comments: ImportedComment[] }[] = [],
): Promise<void> {
  const next = owned(clientId, datasets);
  await db.transaction("rw", db.datasets, db.edits, db.meta, async () => {
    const incomingYears = new Set(next.map((dataset) => dataset.year));

    // Out with the years the file brings — datasets AND their adjustments, since the file
    // carries its own and keeping both would double them. Scoped to this client: another
    // client's 2026 is not this file's business.
    const replaced = (await clientDatasets(clientId)).filter((d) => incomingYears.has(d.year));
    if (replaced.length > 0) {
      const ids = replaced.map((d) => d.id);
      await db.edits.where("datasetId").anyOf(ids).delete();
      await db.datasets.bulkDelete(ids);
    }
    await db.datasets.bulkAdd(next);

    // The slot pass sees the whole workspace OF THIS CLIENT, surviving years included, so a
    // re-upload cannot renumber the centers of a year it never touched.
    await db.datasets.bulkPut(assignCenterSlots(await clientDatasets(clientId)));

    const previous = await db.meta.get(clientId);
    await db.meta.put({
      key: clientId,
      ...meta,
      loadedMonthsByYear: {
        ...(previous?.loadedMonthsByYear ?? {}),
        ...meta.loadedMonthsByYear,
      },
    });

    const seeds = seedEdits(commentsByDataset);
    if (seeds.length > 0) {
      await db.edits.bulkAdd(seeds);
    }
  });
}

/**
 * Deletes one year: its datasets, their edits, and its coverage entry — in one transaction, so
 * a failure can never leave edits orphaned from the datasets they overlay. Deleting the last
 * year clears the workspace, which is what makes PyG fall back to its empty state instead of
 * showing a company with nothing in it.
 *
 * Returns how many adjustments went with it, so the caller can say what was lost.
 */
export async function deleteYear(
  clientId: string,
  year: number,
): Promise<{ deletedEdits: number }> {
  return db.transaction("rw", db.datasets, db.edits, db.meta, async () => {
    const doomed = await db.datasets.where("[clientId+year]").equals([clientId, year]).toArray();
    if (doomed.length === 0) {
      return { deletedEdits: 0 };
    }
    const ids = doomed.map((dataset) => dataset.id);
    const deletedEdits = await db.edits.where("datasetId").anyOf(ids).count();
    await db.edits.where("datasetId").anyOf(ids).delete();
    await db.datasets.bulkDelete(ids);

    if ((await db.datasets.where("clientId").equals(clientId).count()) === 0) {
      // The client stays; what it holds is gone, so it falls back to «Sin datos cargados» and
      // its next upload adopts a fresh identity.
      await db.meta.delete(clientId);
      return { deletedEdits };
    }
    const row = await db.meta.get(clientId);
    if (row) {
      const { [year]: _gone, ...rest } = row.loadedMonthsByYear;
      await db.meta.put({ ...row, loadedMonthsByYear: rest });
    }
    return { deletedEdits };
  });
}

/**
 * Segments non-operating utility for all datasets of ONE client. Adds a zeroed block
 * to datasets with a 5.2 account. Consolidated data is derived from segmented centers.
 * Returns names of skipped datasets for UI feedback.
 */
export async function segmentWorkspace(
  clientId: string,
): Promise<{ segmented: number; skipped: string[] }> {
  return db.transaction("rw", db.datasets, async () => {
    const skipped: string[] = [];
    const next: PygDataset[] = [];
    for (const dataset of await clientDatasets(clientId)) {
      const accounts = segmentAccounts(dataset.accounts);
      if (accounts === dataset.accounts) {
        skipped.push(dataset.costCenterName || dataset.companyName);
        continue;
      }
      next.push({ ...dataset, accounts });
    }
    await db.datasets.bulkPut(next);
    return { segmented: next.length, skipped };
  });
}

export async function getWorkspaceMeta(clientId: string): Promise<WorkspaceMeta | undefined> {
  const row = await db.meta.get(clientId);
  if (!row) {
    return undefined;
  }
  const { key: _key, ...meta } = row;
  return meta;
}

export async function saveActiveCenter(clientId: string, activeCenterId: string): Promise<void> {
  const row = await db.meta.get(clientId);
  if (row) {
    await db.meta.put({ ...row, activeCenterId });
  }
}

/**
 * Upserts one cell's override. An edit with no value and no comment means "back to
 * original" — the record is deleted, keeping the edits table a true diff.
 *
 * The lookup + write run in one explicit transaction so concurrent saves to the same
 * cell serialize instead of both inserting and colliding on the unique
 * &[datasetId+code+monthIndex] index (which two writes did in the browser).
 */
export async function saveCellEdit(edit: Omit<CellEdit, "id" | "updatedAt">): Promise<void> {
  await saveCellEdits([edit]);
}

/**
 * The same upsert over several cells in ONE transaction — what a reclassification needs: the
 * non-operating amount and the discount on its twin are a single move, so a failure between them
 * would leave the pair no longer adding up to what the file brought.
 */
export async function saveCellEdits(edits: Omit<CellEdit, "id" | "updatedAt">[]): Promise<void> {
  if (edits.length === 0) {
    return;
  }
  await db.transaction("rw", db.edits, async () => {
    for (const edit of edits) {
      await upsertCellEdit(edit);
    }
  });
}

/** One cell's upsert. Caller owns the transaction. */
async function upsertCellEdit(edit: Omit<CellEdit, "id" | "updatedAt">): Promise<void> {
  const key: [string, string, number] = [edit.datasetId, edit.code, edit.monthIndex];
  const existing = await db.edits.where("[datasetId+code+monthIndex]").equals(key).first();

  const isEmpty = edit.value === undefined && !edit.comment;
  if (isEmpty) {
    if (existing?.id !== undefined) {
      await db.edits.delete(existing.id);
    }
    return;
  }
  await db.edits.put({
    ...(existing?.id !== undefined ? { id: existing.id } : {}),
    ...edit,
    updatedAt: Date.now(),
  });
}
