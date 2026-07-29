/**
 * IndexedDB persistence via Dexie. Original datasets and user edits live in SEPARATE
 * tables so the original stays intact — the future original-vs-edited comparison
 * reads both sides as-is. One dataset at a time: uploading replaces everything.
 */
import Dexie, { type Table } from "dexie";
import { segmentAccounts } from "./segment";
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
  }
}

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
