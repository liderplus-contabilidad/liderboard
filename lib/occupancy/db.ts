/**
 * A record is one CENTER-YEAR, keyed by `[centerId+year]`: that pair is the unit written, merged
 * and deleted. The consolidated view is never stored — it is derived on read, because an edit in
 * any center would otherwise leave a saved copy stale.
 *
 * The dataset is edited IN PLACE. Every mutation is a read-modify-write inside a transaction, so
 * concurrent cell saves cannot clobber one another.
 */
import Dexie, { type Table } from "dexie";
import { daysInMonth, emptyDataset, emptyMonth, ROOM_ROW_IDS } from "./derive";
import { slugify } from "./slug";
import {
  DEFAULT_CENTER_ID,
  type CenterRow,
  type InputRowId,
  type MonthInputs,
  type OccupancyDataset,
  type OccupancyMeta,
  type OccupancyMonth,
  type OccupancyParseResult,
  type RoomRowId,
} from "./types";

export interface DatasetKey {
  centerId: string;
  year: number;
}

/** The v1 shapes, needed only to read the old tables during the upgrade. */
type LegacyYear = Omit<OccupancyDataset, "centerId" | "centerName">;
interface LegacyMeta {
  key: string;
  activeYear?: number;
}

class OccupancyDb extends Dexie {
  datasets!: Table<OccupancyDataset, [string, number]>;
  meta!: Table<OccupancyMeta, string>;

  constructor() {
    super("liderboard-occupancy");
    this.version(1).stores({ years: "year", meta: "key" });
    // Dexie cannot change a table's primary key in place, so v2 copies into a new table while
    // `years` is still readable...
    this.version(2)
      .stores({ datasets: "[centerId+year]" })
      .upgrade(async (tx) => {
        const legacy = await tx.table<LegacyYear, number>("years").toArray();
        if (legacy.length === 0) {
          return;
        }
        const stored = await tx.table<LegacyMeta, string>("meta").get("workspace");
        const hotelName = legacy[0].hotelName || "—";
        await tx.table<OccupancyDataset>("datasets").bulkPut(
          legacy.map((year) => ({
            ...year,
            centerId: DEFAULT_CENTER_ID,
            centerName: year.hotelName || hotelName,
          })),
        );
        await tx.table<OccupancyMeta, string>("meta").put({
          key: "workspace",
          hotelName,
          activeCenterId: DEFAULT_CENTER_ID,
          activeYear: stored?.activeYear ?? legacy[0].year,
        });
      });
    // ...and only then drops it, once nothing reads from it any more.
    this.version(3).stores({ years: null });
  }
}

export const db = new OccupancyDb();

const INPUT_ROW_IDS: InputRowId[] = [
  "available",
  "revenue",
  "sold",
  "complimentary",
  "cancellations",
  "noShows",
  "noShowsOta",
];

const CHANNEL_PREFIX = "channel:";

/** Gives an empty table somewhere to type instead of a wall of "add channel". */
const DEFAULT_CHANNELS = [
  "Booking",
  "Página web",
  "Agencias de viajes",
  "Walk in",
  "Complementarias",
];

/** Ordered as the UI reads them: by center name, then by year. */
export async function listDatasets(): Promise<OccupancyDataset[]> {
  const datasets = await db.datasets.toArray();
  return datasets.sort((a, b) => a.centerName.localeCompare(b.centerName, "es") || a.year - b.year);
}

/** Derived, not stored: a center exists exactly while it has a year, so they cannot disagree. */
export function centersOf(datasets: OccupancyDataset[]): CenterRow[] {
  const byId = new Map<string, CenterRow>();
  for (const dataset of datasets) {
    if (!byId.has(dataset.centerId)) {
      byId.set(dataset.centerId, { id: dataset.centerId, name: dataset.centerName });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export async function getMeta(): Promise<OccupancyMeta | undefined> {
  return db.meta.get("workspace");
}

export async function saveActiveView(key: DatasetKey): Promise<void> {
  await db.transaction("rw", db.meta, async () => {
    const meta = await db.meta.get("workspace");
    await db.meta.put({
      key: "workspace",
      hotelName: meta?.hotelName ?? "—",
      activeCenterId: key.centerId,
      activeYear: key.year,
    });
  });
}

/**
 * Inherits the channel catalogue of the newest year of the SAME center, then of any center, so
 * consecutive years line up; with nothing to inherit it falls back to the defaults.
 */
export async function addYear(key: DatasetKey, hotelName?: string): Promise<void> {
  await db.transaction("rw", db.datasets, db.meta, async () => {
    if (await db.datasets.get([key.centerId, key.year])) {
      return;
    }
    const existing = await db.datasets.toArray();
    const byRecency = [...existing].sort((a, b) => b.year - a.year);
    const sibling = byRecency.find((d) => d.centerId === key.centerId) ?? byRecency[0];
    const inherited = sibling?.channels ?? [];
    const channels =
      inherited.length > 0
        ? inherited.map((channel) => ({ ...channel }))
        : DEFAULT_CHANNELS.map((name) => ({ id: slugify(name), name }));

    const meta = await db.meta.get("workspace");
    const hotel = hotelName ?? meta?.hotelName ?? sibling?.hotelName ?? "—";
    // A brand-new center has only its id to go by; `principal` takes the hotel's name.
    const center: CenterRow = {
      id: key.centerId,
      name:
        existing.find((d) => d.centerId === key.centerId)?.centerName ??
        (key.centerId === DEFAULT_CENTER_ID ? hotel : key.centerId),
    };
    const created = emptyDataset(key.year, hotel, center);
    created.channels = channels;
    created.months = created.months.map((month) => emptyMonth(month.index, month.days, channels));
    created.updatedAt = Date.now();
    await db.datasets.put(created);
    await putMeta(hotel, key);
  });
}

/**
 * Seeds the default channels into still-untouched months. Channels only leave through
 * `removeChannel` (which marks the month `edited`), so a deliberately emptied month is left alone.
 */
function seedEmptyMonths(dataset: OccupancyDataset): void {
  const defaults = DEFAULT_CHANNELS.map((name) => ({ id: slugify(name), name }));
  let seededAny = false;
  for (const month of dataset.months) {
    if (month.edited || Object.keys(month.inputs.channels).length > 0) {
      continue;
    }
    for (const channel of defaults) {
      month.inputs.channels[channel.id] = new Array<number>(month.days).fill(0);
    }
    seededAny = true;
  }
  if (seededAny) {
    const known = new Set(dataset.channels.map((c) => c.id));
    for (const channel of defaults) {
      if (!known.has(channel.id)) {
        dataset.channels.push(channel);
      }
    }
  }
}

/** Deletes one center-year and, if it was active, falls back to whatever remains. */
export async function deleteYear(key: DatasetKey): Promise<void> {
  await db.transaction("rw", db.datasets, db.meta, async () => {
    await db.datasets.delete([key.centerId, key.year]);
    await repairActive();
  });
}

/** Deletes a whole center — every year of it. */
export async function deleteCenter(centerId: string): Promise<void> {
  await db.transaction("rw", db.datasets, db.meta, async () => {
    const doomed = await db.datasets.toArray();
    await db.datasets.bulkDelete(
      doomed.filter((d) => d.centerId === centerId).map((d) => [d.centerId, d.year] as const),
    );
    await repairActive();
  });
}

/**
 * Only the months the file actually carries are replaced, so a hand-typed month survives a later
 * upload. The stored catalogue wins on naming; the file's unseen channels are appended.
 */
export async function mergeParsedDataset(parsed: OccupancyParseResult): Promise<void> {
  await db.transaction("rw", db.datasets, db.meta, async () => {
    await mergeWithin(parsed);
  });
}

/** For workbooks of a different hotel: keeping the old centers would mix two companies. */
export async function replaceAll(
  results: OccupancyParseResult[],
  hotelName: string,
): Promise<void> {
  await db.transaction("rw", db.datasets, db.meta, async () => {
    await db.datasets.clear();
    await db.meta.delete("workspace");
    for (const parsed of results) {
      await mergeWithin({ ...parsed, dataset: { ...parsed.dataset, hotelName } });
    }
  });
}

/** The merge itself. Assumes an open `rw` transaction over datasets + meta. */
async function mergeWithin(parsed: OccupancyParseResult): Promise<void> {
  const incoming = parsed.dataset;
  const key: DatasetKey = { centerId: incoming.centerId, year: incoming.year };
  const existing = await db.datasets.get([key.centerId, key.year]);

  if (!existing) {
    const fresh: OccupancyDataset = { ...incoming, updatedAt: Date.now() };
    fresh.months = fresh.months.map(sizeChannels);
    seedEmptyMonths(fresh);
    await db.datasets.put(fresh);
    await putMeta(fresh.hotelName, key);
    return;
  }

  const channels = [...existing.channels];
  const known = new Set(channels.map((c) => c.id));
  for (const channel of incoming.channels) {
    if (!known.has(channel.id)) {
      known.add(channel.id);
      channels.push(channel);
    }
  }

  const months = existing.months.map((month) =>
    parsed.parsedMonths.includes(month.index) ? incoming.months[month.index] : month,
  );

  const merged: OccupancyDataset = {
    ...existing,
    hotelName: incoming.hotelName || existing.hotelName,
    // The file's spelling wins: the workbook is where that name comes from.
    centerName: incoming.centerName || existing.centerName,
    channels,
    months: months.map(sizeChannels),
    warnings: incoming.warnings,
    updatedAt: Date.now(),
  };
  seedEmptyMonths(merged);
  await db.datasets.put(merged);
  await putMeta(merged.hotelName, key);
}

/** Writes one editable cell. Unknown row ids and out-of-range days are no-ops. */
export async function saveCell(
  key: DatasetKey,
  monthIndex: number,
  rowId: string,
  dayIndex: number,
  value: number,
): Promise<void> {
  await mutate(key, (stored) => {
    const month = stored.months[monthIndex];
    if (!month || dayIndex < 0 || dayIndex >= month.days) {
      return false;
    }
    // A typed value matching the formula stores null, so the row goes back to TRACKING the room
    // types instead of freezing a now-redundant override.
    if (rowId === "pax") {
      const { simples, dobles, triples } = month.inputs.rooms;
      const fromRooms =
        (simples[dayIndex] ?? 0) + 2 * (dobles[dayIndex] ?? 0) + 3 * (triples[dayIndex] ?? 0);
      month.inputs.pax[dayIndex] = value === fromRooms ? null : value;
      month.edited = true;
      return true;
    }
    const target = seriesFor(month.inputs, rowId);
    if (!target) {
      return false;
    }
    target[dayIndex] = value;
    // From here on the month is computed from its inputs instead of shown as imported.
    month.edited = true;
    return true;
  });
}

export async function saveNights(
  key: DatasetKey,
  monthIndex: number,
  nights: number | null,
): Promise<void> {
  await mutate(key, (stored) => {
    const month = stored.months[monthIndex];
    if (!month) {
      return false;
    }
    month.nights = nights;
    return true;
  });
}

/** Channel membership is PER MONTH; the catalogue only records the name and display order. */
export async function addChannel(key: DatasetKey, monthIndex: number, name: string): Promise<void> {
  const id = slugify(name);
  if (!id) {
    return;
  }
  await mutate(key, (stored) => {
    const month = stored.months[monthIndex];
    if (!month || month.inputs.channels[id] !== undefined) {
      return false;
    }
    if (!stored.channels.some((channel) => channel.id === id)) {
      stored.channels.push({ id, name: name.trim() });
    }
    month.inputs.channels[id] = new Array<number>(month.days).fill(0);
    // A new row changes "Total canales", so the month can no longer be shown as imported.
    month.edited = true;
    return true;
  });
}

/** Renames a channel. The id — and therefore the stored data — is deliberately untouched. */
export async function renameChannel(key: DatasetKey, id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) {
    return;
  }
  await mutate(key, (stored) => {
    const channel = stored.channels.find((candidate) => candidate.id === id);
    if (!channel) {
      return false;
    }
    channel.name = trimmed;
    return true;
  });
}

/** The catalogue entry survives while any other month still uses it, and is dropped once none does. */
export async function removeChannel(
  key: DatasetKey,
  monthIndex: number,
  id: string,
): Promise<void> {
  await mutate(key, (stored) => {
    const month = stored.months[monthIndex];
    if (!month || month.inputs.channels[id] === undefined) {
      return false;
    }
    delete month.inputs.channels[id];
    month.edited = true;
    const stillUsed = stored.months.some((other) => other.inputs.channels[id] !== undefined);
    if (!stillUsed) {
      stored.channels = stored.channels.filter((channel) => channel.id !== id);
    }
    return true;
  });
}

/** Read-modify-write in one transaction; `apply` returns false to skip the write. */
async function mutate(
  key: DatasetKey,
  apply: (stored: OccupancyDataset) => boolean,
): Promise<void> {
  await db.transaction("rw", db.datasets, async () => {
    const stored = await db.datasets.get([key.centerId, key.year]);
    if (!stored) {
      return;
    }
    if (apply(stored)) {
      stored.updatedAt = Date.now();
      await db.datasets.put(stored);
    }
  });
}

async function putMeta(hotelName: string, key: DatasetKey): Promise<void> {
  await db.meta.put({
    key: "workspace",
    hotelName,
    activeCenterId: key.centerId,
    activeYear: key.year,
  });
}

/** Prefers another year of the same center: deleting 2025 should not also move the user. */
async function repairActive(): Promise<void> {
  const meta = await db.meta.get("workspace");
  if (!meta) {
    return;
  }
  if (await db.datasets.get([meta.activeCenterId, meta.activeYear])) {
    return;
  }
  const remaining = await db.datasets.toArray();
  if (remaining.length === 0) {
    await db.meta.delete("workspace");
    return;
  }
  const sameCenter = remaining
    .filter((d) => d.centerId === meta.activeCenterId)
    .sort((a, b) => b.year - a.year)[0];
  const fallback =
    sameCenter ??
    [...remaining].sort(
      (a, b) => a.centerName.localeCompare(b.centerName, "es") || a.year - b.year,
    )[0];
  await db.meta.put({ ...meta, activeCenterId: fallback.centerId, activeYear: fallback.year });
}

/** Resolves a grid row id to the array that backs it, or null for derived rows. */
function seriesFor(inputs: MonthInputs, rowId: string): number[] | null {
  if (rowId.startsWith(CHANNEL_PREFIX)) {
    return inputs.channels[rowId.slice(CHANNEL_PREFIX.length)] ?? null;
  }
  if ((ROOM_ROW_IDS as string[]).includes(rowId)) {
    return inputs.rooms[rowId as RoomRowId];
  }
  if ((INPUT_ROW_IDS as string[]).includes(rowId)) {
    return inputs[rowId as InputRowId];
  }
  return null;
}

/**
 * Keeps EXACTLY the channels that month holds and deliberately does not add the rest of the
 * catalogue: a channel absent from March must stay absent from March.
 */
function sizeChannels(month: OccupancyMonth): OccupancyMonth {
  const next: Record<string, number[]> = {};
  for (const [id, values] of Object.entries(month.inputs.channels)) {
    next[id] = Array.from({ length: month.days }, (_, d) => values?.[d] ?? 0);
  }
  return { ...month, inputs: { ...month.inputs, channels: next } };
}

/** Re-exported so callers can size a fresh month without importing derive directly. */
export { daysInMonth };
