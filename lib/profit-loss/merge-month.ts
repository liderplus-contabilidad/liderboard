/**
 * Merges one month-slice onto the by-cost-centers workspace: a `mergeMonthSlice` call writes
 * exactly one column (the slice's month) across every center and leaves every other column
 * byte-for-byte the same. This is the pure heart of "an archivo is a month" (design.md
 * decision 2) — `PygDataset.values` stays a plain `number[12]`, so everything downstream
 * (derive.ts, the analytics engine, export) keeps working unmodified.
 */
import { MONTHS_FULL_ES } from "@/lib/date";
import type { StagedUpload } from "./upload/types";
import { CENTER_PALETTE, slugifyCenter } from "./workspace";
import type { AccountRow, DatasetRole, PygDataset } from "./types";

type MonthSlice = Extract<StagedUpload, { kind: "month-slice" }>;

const SIN_CENTRO = /sin\s+centro\s+de\s+costo/i;
/** Tolerance for float drift when validating file sums (one cent) — matches `parse.ts`. */
const SUM_TOLERANCE = 0.011;
/** Design.md decision 8: verified against the six real 2026 files (906 up / 4 down = 0.44%). */
const ACCUMULATED_MIN_UPS = 20;
const ACCUMULATED_MAX_DOWN_SHARE = 0.05;

export interface MergeMonthResult {
  datasets: PygDataset[];
  loadedMonths: number[];
  /** Cuadre-against-GENERAL and accumulated-file notices — never block the merge. */
  warnings: string[];
}

/** `4.1.7` before `4.1.11` — numeric per dot-segment, never lexicographic. */
export function compareAccountCodes(a: string, b: string): number {
  const segA = a.split(".").map(Number);
  const segB = b.split(".").map(Number);
  const len = Math.max(segA.length, segB.length);
  for (let i = 0; i < len; i++) {
    const diff = (segA[i] ?? -1) - (segB[i] ?? -1);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

export function sortAccountCodes(codes: readonly string[]): string[] {
  return [...codes].sort(compareAccountCodes);
}

function blankValues(): number[] {
  return Array.from({ length: 12 }, () => 0);
}

function cloneDataset(dataset: PygDataset): PygDataset {
  return { ...dataset, accounts: dataset.accounts.map((a) => ({ ...a, values: [...a.values] })) };
}

function roleFor(centerName: string): DatasetRole {
  return SIN_CENTRO.test(centerName) ? "sin-centro" : "center";
}

function newCenterDataset(
  name: string,
  slice: MonthSlice,
  order: number,
  paletteIndex: number,
): PygDataset {
  return {
    id: crypto.randomUUID(),
    fileName: `PyG-${slice.year}-${String(slice.month + 1).padStart(2, "0")}`,
    uploadedAt: Date.now(),
    companyName: slice.companyName,
    periodLabel: `Ene–Dic ${slice.year}`,
    year: slice.year,
    baseFrequency: "mensual",
    role: roleFor(name),
    centerId: slugifyCenter(name),
    centerColor: CENTER_PALETTE[paletteIndex % CENTER_PALETTE.length],
    order,
    costCenterName: name,
    accounts: [],
    resultFromFile: [],
    warnings: [],
  };
}

/**
 * `current` is the workspace's existing center/sin-centro datasets (in any order — this
 * rebuilds `order` from scratch); `loadedMonths` is the workspace's declared coverage before
 * this slice. Both come back updated. `current` is never mutated — every touched dataset is
 * cloned first.
 */
export function mergeMonthSlice(
  current: readonly PygDataset[],
  loadedMonths: readonly number[],
  slice: MonthSlice,
): MergeMonthResult {
  const month = slice.month;
  const centersByCenterId = new Map<string, PygDataset>(
    current.map((dataset) => [dataset.centerId as string, cloneDataset(dataset)]),
  );
  const preMergeById = new Map<string, PygDataset>(
    current.map((dataset) => [dataset.centerId as string, dataset]),
  );

  // Any center the slice names that isn't in the workspace yet is created now, with 12 zero
  // columns and the next palette slot — its accounts get filled in below like every other.
  for (const centerSlice of slice.centers) {
    const centerId = slugifyCenter(centerSlice.name);
    if (!centersByCenterId.has(centerId)) {
      centersByCenterId.set(
        centerId,
        newCenterDataset(centerSlice.name, slice, centersByCenterId.size, centersByCenterId.size),
      );
    }
  }

  // The union of every code ever seen, workspace-wide plus this month's file — a code new to
  // the workspace gets inserted into every center at once, zero in every month but this one.
  const codeSet = new Set<string>();
  const nameByCode = new Map<string, string>();
  for (const dataset of centersByCenterId.values()) {
    for (const account of dataset.accounts) {
      codeSet.add(account.code);
      if (!nameByCode.has(account.code)) {
        nameByCode.set(account.code, account.name);
      }
    }
  }
  for (const centerSlice of slice.centers) {
    for (const account of centerSlice.accounts) {
      codeSet.add(account.code);
      nameByCode.set(account.code, account.name); // the file's current name wins
    }
  }
  const orderedCodes = sortAccountCodes([...codeSet]);

  const sliceValuesByCenterId = new Map<string, Map<string, number>>();
  for (const centerSlice of slice.centers) {
    sliceValuesByCenterId.set(
      slugifyCenter(centerSlice.name),
      new Map(centerSlice.accounts.map((a) => [a.code, a.values[0] ?? 0])),
    );
  }

  for (const [centerId, dataset] of centersByCenterId) {
    const oldByCode = new Map(dataset.accounts.map((a) => [a.code, a.values]));
    const sliceMap = sliceValuesByCenterId.get(centerId);
    dataset.accounts = orderedCodes.map((code): AccountRow => {
      const values = oldByCode.get(code) ? [...(oldByCode.get(code) as number[])] : blankValues();
      // Absent from the slice entirely (center not in this month's file) or absent just for
      // this code (the file dropped it this month) both zero the month — never carry forward.
      values[month] = sliceMap?.get(code) ?? 0;
      return { code, name: nameByCode.get(code) ?? code, values };
    });
  }

  const mergedDatasets = [...centersByCenterId.values()].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  const nextLoadedMonths = loadedMonths.includes(month)
    ? [...loadedMonths]
    : [...loadedMonths, month].sort((a, b) => a - b);

  const warnings: string[] = [
    ...cuadreWarnings(mergedDatasets, orderedCodes, slice, month),
    ...accumulatedFileWarning(preMergeById, centersByCenterId, orderedCodes, month, loadedMonths),
  ];

  return { datasets: mergedDatasets, loadedMonths: nextLoadedMonths, warnings };
}

/** One warning per month naming how many accounts don't sum to GENERAL — never one per account. */
function cuadreWarnings(
  datasets: readonly PygDataset[],
  codes: readonly string[],
  slice: MonthSlice,
  month: number,
): string[] {
  const generalByCode = new Map(slice.general.map((a) => [a.code, a.values[0] ?? 0]));
  let mismatches = 0;
  for (const code of codes) {
    const general = generalByCode.get(code);
    if (general === undefined) {
      continue;
    }
    const sum = datasets.reduce((total, dataset) => {
      const account = dataset.accounts.find((a) => a.code === code);
      return total + (account?.values[month] ?? 0);
    }, 0);
    if (Math.abs(sum - general) > SUM_TOLERANCE) {
      mismatches++;
    }
  }
  if (mismatches === 0) {
    return [];
  }
  const label = MONTHS_FULL_ES[month] ?? `mes ${month + 1}`;
  return [`El mes de ${label} no cuadra con GENERAL en ${mismatches} cuenta(s).`];
}

/**
 * Design.md decision 8: a month indistinguishable in shape from a year-to-date accumulated
 * export shows nearly every (account, center) pair rising and almost none falling versus the
 * prior month. Only a warning — the values load exactly as given either way.
 */
function accumulatedFileWarning(
  preMergeById: Map<string, PygDataset>,
  postMergeById: Map<string, PygDataset>,
  codes: readonly string[],
  month: number,
  loadedMonths: readonly number[],
): string[] {
  if (month === 0 || !loadedMonths.includes(month - 1)) {
    return [];
  }
  let ups = 0;
  let downs = 0;
  for (const [centerId, postDataset] of postMergeById) {
    const preDataset = preMergeById.get(centerId);
    const preByCode = new Map(preDataset?.accounts.map((a) => [a.code, a.values[month - 1]]) ?? []);
    for (const code of codes) {
      const previous = preByCode.get(code) ?? 0;
      const account = postDataset.accounts.find((a) => a.code === code);
      const current = account?.values[month] ?? 0;
      if (Math.abs(previous) <= SUM_TOLERANCE && Math.abs(current) <= SUM_TOLERANCE) {
        continue; // neither month moved this pair — not part of "changed"
      }
      const delta = current - previous;
      if (delta > SUM_TOLERANCE) {
        ups++;
      } else if (delta < -SUM_TOLERANCE) {
        downs++;
      }
    }
  }
  const changed = ups + downs;
  if (ups < ACCUMULATED_MIN_UPS || changed === 0 || downs / changed > ACCUMULATED_MAX_DOWN_SHARE) {
    return [];
  }
  return [
    `Este archivo se parece a un acumulado del año y no al mes de ${MONTHS_FULL_ES[month] ?? month + 1}: ` +
      `${ups} de ${changed} cuentas por centro suben respecto al mes anterior y solo ${downs} bajan. ` +
      `Revisa el filtro de fechas del export si no era la intención.`,
  ];
}
