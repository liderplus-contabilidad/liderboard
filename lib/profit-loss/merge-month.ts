/**
 * Merges one month-slice onto the by-cost-centers workspace: a `mergeMonthSlice` call writes
 * exactly one column (the slice's month) across every center and leaves every other column
 * byte-for-byte the same. This is the pure heart of "an archivo is a month" (design.md
 * decision 2) — `AccountRow.values` stays a plain `number[12]`, so everything downstream
 * (derive.ts, the analytics engine, export) keeps working unmodified.
 */
import { MONTHS_FULL_ES } from "@/lib/date";
import type { CenterSlice, StagedUpload } from "./upload/types";
import { CENTER_PALETTE } from "./workspace";
import type { AccountRow, DatasetRole, ParsedDataset } from "./types";

type MonthSlice = Extract<StagedUpload, { kind: "month-slice" }>;

const SIN_CENTRO = /sin\s+centro\s+de\s+costo/i;
/** Internal map key for "single" mode's one nameless slice — never written to a persisted
 * `PygDataset.centerId`, which stays unset for a "single" role dataset. */
const SINGLE_KEY = "__single__";
/** Tolerance for float drift when validating file sums (one cent) — matches `parse.ts`. */
const SUM_TOLERANCE = 0.011;

export interface MergeMonthResult {
  datasets: ParsedDataset[];
  loadedMonths: number[];
  /** Cuadre-against-GENERAL notices — never block the merge. */
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

function cloneDataset(dataset: ParsedDataset): ParsedDataset {
  return { ...dataset, accounts: dataset.accounts.map((a) => ({ ...a, values: [...a.values] })) };
}

function roleFor(centerName: string): DatasetRole {
  return SIN_CENTRO.test(centerName) ? "sin-centro" : "center";
}

/** The key `mergeMonthSlice` keys its internal map by — never `null`, unlike the persisted
 * `ParsedDataset.centerId`, which "single" mode leaves unset. */
function keyFor(centerId: string | null | undefined): string {
  return centerId ?? SINGLE_KEY;
}

function newCenterDataset(
  centerSlice: CenterSlice,
  slice: MonthSlice,
  order: number,
  paletteIndex: number,
): ParsedDataset {
  const base = {
    id: crypto.randomUUID(),
    fileName: `PyG-${slice.year}-${String(slice.month + 1).padStart(2, "0")}`,
    uploadedAt: Date.now(),
    companyName: slice.companyName,
    periodLabel: `Ene–Dic ${slice.year}`,
    year: slice.year,
    baseFrequency: "mensual" as const,
    accounts: [],
    resultFromFile: [],
    warnings: [],
  };
  if (slice.mode === "single") {
    return { ...base, role: "single" };
  }
  return {
    ...base,
    role: roleFor(centerSlice.name),
    centerId: centerSlice.centerId as string,
    centerColor: CENTER_PALETTE[paletteIndex % CENTER_PALETTE.length],
    order,
    costCenterName: centerSlice.name,
  };
}

/**
 * `current` is the workspace's existing center/sin-centro datasets (in any order — this
 * rebuilds `order` from scratch); `loadedMonths` is the workspace's declared coverage before
 * this slice. Both come back updated. `current` is never mutated — every touched dataset is
 * cloned first.
 */
export function mergeMonthSlice(
  current: readonly ParsedDataset[],
  loadedMonths: readonly number[],
  slice: MonthSlice,
): MergeMonthResult {
  const month = slice.month;
  const centersByCenterId = new Map<string, ParsedDataset>(
    current.map((dataset) => [keyFor(dataset.centerId), cloneDataset(dataset)]),
  );

  // Any center the slice names that isn't in the workspace yet is created now, with 12 zero
  // columns and the next palette slot — its accounts get filled in below like every other.
  // "single" mode's one slice always resolves to the SAME key, so this only ever creates it once.
  for (const centerSlice of slice.centers) {
    const key = keyFor(centerSlice.centerId);
    if (!centersByCenterId.has(key)) {
      centersByCenterId.set(
        key,
        newCenterDataset(centerSlice, slice, centersByCenterId.size, centersByCenterId.size),
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
      keyFor(centerSlice.centerId),
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

  // The cuadre check doesn't apply to "single" mode: there is no GENERAL column to cuadre
  // against.
  const warnings: string[] =
    slice.mode === "centers" ? cuadreWarnings(mergedDatasets, orderedCodes, slice, month) : [];

  return { datasets: mergedDatasets, loadedMonths: nextLoadedMonths, warnings };
}

/** One warning per month naming how many accounts don't sum to GENERAL — never one per account.
 * Only ever called in "centers" mode (see `mergeMonthSlice`), where `slice.general` is set. */
function cuadreWarnings(
  datasets: readonly ParsedDataset[],
  codes: readonly string[],
  slice: MonthSlice,
  month: number,
): string[] {
  const generalByCode = new Map((slice.general ?? []).map((a) => [a.code, a.values[0] ?? 0]));
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
