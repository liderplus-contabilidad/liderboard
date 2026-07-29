/**
 * IndexedDB persistence via Dexie. Original datasets and user edits live in SEPARATE
 * tables so the original stays intact — the future original-vs-edited comparison
 * reads both sides as-is. One dataset at a time: uploading replaces everything.
 */
import Dexie, { type Table } from "dexie";
import { segmentAccounts } from "./segment";
import { assignCenterSlots } from "./workspace";
import type { CellEdit, ImportedComment, PygDataset, WorkspaceMeta } from "./types";
import { LEGACY_SYSTEM } from "./upload/systems";

/** Singleton workspace metadata row (company, warnings, active selector id). */
interface WorkspaceMetaRow extends WorkspaceMeta {
  key: "workspace";
}

class PygDb extends Dexie {
  datasets!: Table<PygDataset, string>;
  edits!: Table<CellEdit, number>;
  meta!: Table<WorkspaceMetaRow, string>;

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
  }
}

/** The pre-v6 shapes, needed only to read the old rows during the upgrade. */
type LegacyDataset = Omit<PygDataset, "year"> & { year: number | null };
type LegacyMetaRow = Omit<WorkspaceMetaRow, "loadedMonthsByYear"> & { loadedMonths?: number[] };

export const db = new PygDb();

/** Replaces the workspace: clears all tables, inserts datasets, meta, and re-seeds edits. */
export async function replaceWorkspace(
  datasets: PygDataset[],
  meta: WorkspaceMeta,
  commentsByDataset: { datasetId: string; comments: ImportedComment[] }[] = [],
): Promise<void> {
  await db.transaction("rw", db.datasets, db.edits, db.meta, async () => {
    await db.edits.clear();
    await db.datasets.clear();
    await db.meta.clear();
    await db.datasets.bulkAdd(datasets);
    await db.meta.add({ key: "workspace", ...meta });
    const now = Date.now();
    const seeds = commentsByDataset.flatMap(({ datasetId, comments }) =>
      comments.map((c) => ({
        datasetId,
        code: c.code,
        monthIndex: c.monthIndex,
        ...(c.value !== undefined ? { value: c.value } : {}),
        ...(c.comment ? { comment: c.comment } : {}),
        updatedAt: now,
      })),
    );
    if (seeds.length > 0) {
      await db.edits.bulkAdd(seeds);
    }
  });
}

/**
 * Applies a merged month onto the by-centers workspace: upserts `datasets` (existing centers
 * overwritten, new ones added — `mergeMonthSlice` already produced the complete set, nothing
 * is ever deleted here) and writes `meta`, WITHOUT touching `edits`. This is what lets a
 * reload survive the user's adjustments: the base changes, the overlay does not.
 */
export async function applyMonthSlice(datasets: PygDataset[], meta: WorkspaceMeta): Promise<void> {
  await db.transaction("rw", db.datasets, db.meta, async () => {
    await db.datasets.bulkPut(datasets);
    await db.meta.put({ key: "workspace", ...meta });
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
  datasets: PygDataset[],
  meta: WorkspaceMeta,
  commentsByDataset: { datasetId: string; comments: ImportedComment[] }[] = [],
): Promise<void> {
  await db.transaction("rw", db.datasets, db.edits, db.meta, async () => {
    const incomingYears = new Set(datasets.map((dataset) => dataset.year));

    // Out with the years the file brings — datasets AND their adjustments, since the file
    // carries its own and keeping both would double them.
    const replaced = (await db.datasets.toArray()).filter((d) => incomingYears.has(d.year));
    if (replaced.length > 0) {
      const ids = replaced.map((d) => d.id);
      await db.edits.where("datasetId").anyOf(ids).delete();
      await db.datasets.bulkDelete(ids);
    }
    await db.datasets.bulkAdd(datasets);

    // The slot pass sees the WHOLE workspace, surviving years included, so a re-upload cannot
    // renumber the centers of a year it never touched.
    const all = assignCenterSlots(await db.datasets.toArray());
    await db.datasets.bulkPut(all);

    const previous = await db.meta.get("workspace");
    await db.meta.put({
      key: "workspace",
      ...meta,
      loadedMonthsByYear: {
        ...(previous?.loadedMonthsByYear ?? {}),
        ...meta.loadedMonthsByYear,
      },
    });

    const now = Date.now();
    const seeds = commentsByDataset.flatMap(({ datasetId, comments }) =>
      comments.map((c) => ({
        datasetId,
        code: c.code,
        monthIndex: c.monthIndex,
        ...(c.value !== undefined ? { value: c.value } : {}),
        ...(c.comment ? { comment: c.comment } : {}),
        updatedAt: now,
      })),
    );
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
export async function deleteYear(year: number): Promise<{ deletedEdits: number }> {
  return db.transaction("rw", db.datasets, db.edits, db.meta, async () => {
    const doomed = await db.datasets.where("year").equals(year).toArray();
    if (doomed.length === 0) {
      return { deletedEdits: 0 };
    }
    const ids = doomed.map((dataset) => dataset.id);
    const deletedEdits = await db.edits.where("datasetId").anyOf(ids).count();
    await db.edits.where("datasetId").anyOf(ids).delete();
    await db.datasets.bulkDelete(ids);

    if ((await db.datasets.count()) === 0) {
      await db.meta.clear();
      return { deletedEdits };
    }
    const row = await db.meta.get("workspace");
    if (row) {
      const { [year]: _gone, ...rest } = row.loadedMonthsByYear;
      await db.meta.put({ ...row, loadedMonthsByYear: rest });
    }
    return { deletedEdits };
  });
}

/**
 * Segments non-operating utility for all datasets in the workspace. Adds a zeroed block
 * to datasets with a 5.2 account. Consolidated data is derived from segmented centers.
 * Returns names of skipped datasets for UI feedback.
 */
export async function segmentWorkspace(): Promise<{ segmented: number; skipped: string[] }> {
  return db.transaction("rw", db.datasets, async () => {
    const skipped: string[] = [];
    const next: PygDataset[] = [];
    for (const dataset of await db.datasets.toArray()) {
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

export async function getWorkspaceMeta(): Promise<WorkspaceMeta | undefined> {
  const row = await db.meta.get("workspace");
  if (!row) {
    return undefined;
  }
  const { key: _key, ...meta } = row;
  return meta;
}

export async function saveActiveCenter(activeCenterId: string): Promise<void> {
  const row = await db.meta.get("workspace");
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
