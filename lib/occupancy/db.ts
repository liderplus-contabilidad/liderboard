/**
 * IndexedDB persistence via Dexie, and the ONLY door to it.
 *
 * Everything here is partitioned by HOTEL. That is not tidiness, it is the mitigation of this
 * design's one real risk: with several hotels' sucursales sharing one table, an unbounded query
 * mixes two companies' occupancy in silence, and nothing downstream — not `consolidate.ts`, not the
 * series engine, not the grid — can tell. So no component reads a table: every read and every write
 * goes through a function below that takes the `hotelId`, and `db` itself is exported only for the
 * tests that assert the partition holds.
 *
 * A record is one HOTEL-SUCURSAL-YEAR, keyed `[hotelId+centerId+year]`: that triple is the unit
 * written, merged and deleted. The consolidated view is never stored — it is derived on read, and
 * from the sucursales of ONE hotel, because an edit in any of them would otherwise leave a saved
 * copy stale.
 *
 * The dataset is edited IN PLACE. Every mutation is a read-modify-write inside a transaction, so
 * concurrent cell saves cannot clobber one another.
 */
import Dexie, { type Table } from "dexie";
import { sortByName, type CenterLogos, type EntityLogo } from "@/lib/workspaces";
import { daysInMonth, emptyDataset, emptyMonth, monthHasData, ROOM_ROW_IDS } from "./derive";
import { deriveHotelIdentity, type HotelIdentity } from "./hotel-identity";
import type { OccupancyHotel } from "./hotels";
import { slugify } from "./slug";
import {
  DEFAULT_CENTER_ID,
  type CenterRow,
  type InputRowId,
  type MonthInputs,
  type OccupancyDataset,
  type OccupancyMonth,
  type OccupancyParseResult,
  type RoomRowId,
  type StoredOccupancyDataset,
} from "./types";

/** A stored record's key: which hotel, which sucursal, which year. */
export interface DatasetKey {
  hotelId: string;
  centerId: string;
  year: number;
}

/**
 * One hotel as it is stored. It absorbs what the singleton `meta` row used to hold — which sucursal
 * and which year were open — because that belongs to the hotel and not to the workspace: switching
 * hotels and coming back should land where you left it.
 */
export interface StoredHotel extends OccupancyHotel {
  activeCenterId?: string;
  activeYear?: number;
}

/** The one-row table that remembers which hotel is open, so it survives a reload. */
interface ActiveHotelRow {
  key: "active";
  hotelId: string | null;
}

const ACTIVE_KEY = "active";

/** The v1 shape, needed only to read the old table during the v2 upgrade. */
type LegacyYear = Omit<OccupancyDataset, "centerId" | "centerName">;
interface LegacyMeta {
  key: string;
  hotelName?: string;
  activeCenterId?: string;
  activeYear?: number;
}

class OccupancyDb extends Dexie {
  hotels!: Table<StoredHotel, string>;
  centerYears!: Table<StoredOccupancyDataset, [string, string, number]>;
  active!: Table<ActiveHotelRow, string>;

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
        await tx.table<LegacyMeta, string>("meta").put({
          key: "workspace",
          hotelName,
          activeCenterId: DEFAULT_CENTER_ID,
          activeYear: stored?.activeYear ?? legacy[0].year,
        });
      });
    // ...and only then drops it, once nothing reads from it any more.
    this.version(3).stores({ years: null });
    // v4: Ocupaciones holds several HOTELS (`occupancy-hotels`). The primary key gains the hotel,
    // so the same dance as v2: `centerYears` is filled while `datasets` is still readable, and
    // only v5 drops it. `hotels` absorbs the `meta` row's open view, and `active` remembers which
    // hotel is open.
    //
    // Purely ADDITIVE, by design: Dexie has no downgrade, so a defective upgrade cannot be rolled
    // back. Nothing is deleted here — this workspace is the user's only copy of what they typed by
    // hand — so a failure leaves the data readable by a later correction instead of lost. A
    // database that never loaded anything gets NO hotel: the module starts in its empty state and
    // the user creates the first one.
    this.version(4)
      .stores({
        hotels: "id, name",
        centerYears: "[hotelId+centerId+year], hotelId",
        active: "key",
      })
      .upgrade(async (tx) => {
        const legacy = await tx.table<OccupancyDataset>("datasets").toArray();
        const meta = await tx.table<LegacyMeta, string>("meta").get("workspace");
        if (legacy.length === 0 && !meta) {
          return;
        }
        const hotelId = crypto.randomUUID();
        // The declared hotel name is the only name the module has ever known for this data;
        // «Hotel 1» is the fallback rather than an empty row in the selector.
        const name = meta?.hotelName?.trim() || legacy[0]?.hotelName.trim() || "Hotel 1";
        const hotel: StoredHotel = {
          id: hotelId,
          name,
          ...(meta?.activeCenterId ? { activeCenterId: meta.activeCenterId } : {}),
          ...(meta?.activeYear !== undefined ? { activeYear: meta.activeYear } : {}),
        };
        await tx.table<StoredHotel>("hotels").add(hotel);
        await tx
          .table<StoredOccupancyDataset>("centerYears")
          .bulkPut(legacy.map((dataset) => ({ ...dataset, hotelId })));
        await tx.table<ActiveHotelRow>("active").put({ key: ACTIVE_KEY, hotelId });
      });
    // v5: drop the pre-hotel tables, once nothing reads from them any more.
    this.version(5).stores({ datasets: null, meta: null });
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

// ---------------------------------------------------------------------------
// Hotels
// ---------------------------------------------------------------------------

/** Every hotel, ordered by name — the list's only order (see `hotels.ts`). */
export async function listHotels(): Promise<StoredHotel[]> {
  return sortByName(await db.hotels.toArray());
}

export async function getHotel(hotelId: string): Promise<StoredHotel | undefined> {
  return db.hotels.get(hotelId);
}

/**
 * Creates an EMPTY hotel and opens it. The name is taken as given: validation and duplicate
 * checking are `hotels.ts`'s, and the caller runs them where it can say what is wrong.
 */
export async function createHotel(name: string, logo?: EntityLogo): Promise<StoredHotel> {
  const hotel: StoredHotel = { id: crypto.randomUUID(), name, ...(logo ? { logo } : {}) };
  await db.transaction("rw", db.hotels, db.active, async () => {
    await db.hotels.add(hotel);
    await db.active.put({ key: ACTIVE_KEY, hotelId: hotel.id });
  });
  return hotel;
}

/**
 * Changes the hotel's LABEL — its name, its logo and those of its sucursales — and NOTHING else:
 * the identity is derived from the data, so no sucursal-año is touched. They travel in one write
 * because the dialog edits them together; `logo: null` removes it, and an `undefined` in a Dexie
 * `update` deletes the property, which is what that means here.
 *
 * `centerLogos` ALWAYS travels, even when it arrives empty: the caller is the same dialog that edits
 * them, so what it brings is the complete picture and there is no need to tell «do not touch them»
 * from «remove them».
 */
export async function updateHotel(
  hotelId: string,
  name: string,
  logo: EntityLogo | null,
  centerLogos: CenterLogos | undefined,
): Promise<void> {
  await db.hotels.update(hotelId, { name, logo: logo ?? undefined, centerLogos });
}

/**
 * Deletes a hotel and every sucursal-año that hangs off it, in ONE transaction. No other hotel is
 * touched.
 *
 * Deleting the OPEN hotel hands the module to the first remaining one BY NAME; deleting the last one
 * leaves no active hotel and the module falls back to its empty state.
 */
export async function deleteHotel(hotelId: string): Promise<void> {
  await db.transaction("rw", db.hotels, db.centerYears, db.active, async () => {
    const doomed = await db.centerYears.where("hotelId").equals(hotelId).toArray();
    await db.centerYears.bulkDelete(
      doomed.map((d) => [d.hotelId, d.centerId, d.year] as [string, string, number]),
    );
    await db.hotels.delete(hotelId);

    const active = await db.active.get(ACTIVE_KEY);
    if (active?.hotelId !== hotelId) {
      return;
    }
    const remaining = sortByName(await db.hotels.toArray());
    await db.active.put({ key: ACTIVE_KEY, hotelId: remaining[0]?.id ?? null });
  });
}

export async function setActiveHotel(hotelId: string | null): Promise<void> {
  await db.active.put({ key: ACTIVE_KEY, hotelId });
}

/** The open hotel's id, or `null` — which is also what a brand-new install reads. */
export async function getActiveHotelId(): Promise<string | null> {
  return (await db.active.get(ACTIVE_KEY))?.hotelId ?? null;
}

/** One hotel as the selector shows it: its label, what it IS, and what it holds. */
export interface HotelSummary extends StoredHotel {
  /** `null` for a hotel with no data yet — it has no identity until its first upload adopts one. */
  identity: HotelIdentity | null;
  /** Ascending; `[]` for a hotel with no data. */
  years: number[];
  /** Sucursales counted across years: the same one in 2025 and 2026 is one sucursal. */
  centers: number;
  /**
   * Its sucursales, in the order the selector shows them; `[]` with no data. They travel in the SAME
   * summary that already feeds the dropdown because the dialog that uploads each sucursal's logo can
   * be opened over a hotel that is not open, and the provider's are those of the one that is. It is
   * the list `centers` is the count of, so the two cannot disagree.
   */
  centerOptions: CenterRow[];
}

/**
 * Every hotel with what it holds — ONE query behind both the selector's sublines and
 * `findHotelForIdentity`, which is what lets the clash dialog say «estos archivos sí son de Ambato
 * Centro» without the caller reading a table.
 */
export async function listHotelSummaries(): Promise<HotelSummary[]> {
  const [hotels, datasets] = await Promise.all([db.hotels.toArray(), db.centerYears.toArray()]);
  const byHotel = new Map<string, StoredOccupancyDataset[]>();
  for (const dataset of datasets) {
    byHotel.set(dataset.hotelId, [...(byHotel.get(dataset.hotelId) ?? []), dataset]);
  }
  return sortByName(
    hotels.map((hotel) => {
      const own = byHotel.get(hotel.id) ?? [];
      const centerOptions = centersOf(own);
      return {
        ...hotel,
        identity: deriveHotelIdentity(own),
        years: [...new Set(own.map((d) => d.year))].sort((a, b) => a - b),
        centers: centerOptions.length,
        centerOptions,
      };
    }),
  );
}

/** What a hotel holds, in the terms the delete confirmation counts in. */
export interface HotelContents {
  centers: number;
  years: number[];
  /** Months with sales anywhere in the hotel — the same definition of «con datos» as everywhere. */
  monthsWithData: number;
}

/**
 * Quantifies what deleting a hotel discards. Naming it in the abstract («sus datos») is what makes
 * an irreversible action easy to confirm by accident, so the modal counts instead.
 */
export async function describeHotelContents(hotelId: string): Promise<HotelContents> {
  const datasets = await db.centerYears.where("hotelId").equals(hotelId).toArray();
  return {
    centers: new Set(datasets.map((d) => d.centerId)).size,
    years: [...new Set(datasets.map((d) => d.year))].sort((a, b) => a - b),
    monthsWithData: datasets.reduce(
      (total, dataset) => total + dataset.months.filter((month) => monthHasData(month)).length,
      0,
    ),
  };
}

// ---------------------------------------------------------------------------
// Scoped reads
// ---------------------------------------------------------------------------

/** Every record of ONE hotel, ordered as the UI reads them: by sucursal name, then by year. */
export async function listDatasets(hotelId: string): Promise<StoredOccupancyDataset[]> {
  const datasets = await db.centerYears.where("hotelId").equals(hotelId).toArray();
  return datasets.sort((a, b) => a.centerName.localeCompare(b.centerName, "es") || a.year - b.year);
}

/** Derived, not stored: a sucursal exists exactly while it has a year, so they cannot disagree. */
export function centersOf(datasets: readonly OccupancyDataset[]): CenterRow[] {
  const byId = new Map<string, CenterRow>();
  for (const dataset of datasets) {
    if (!byId.has(dataset.centerId)) {
      byId.set(dataset.centerId, { id: dataset.centerId, name: dataset.centerName });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** Remembers the open sucursal-año ON THE HOTEL, so switching hotels and coming back lands there. */
export async function saveActiveView(key: DatasetKey): Promise<void> {
  await db.hotels.update(key.hotelId, { activeCenterId: key.centerId, activeYear: key.year });
}

// ---------------------------------------------------------------------------
// Scoped writes
// ---------------------------------------------------------------------------

/**
 * Inherits the channel catalogue of the newest year of the SAME sucursal, then of any sucursal OF
 * THE SAME HOTEL, so consecutive years line up; with nothing to inherit it falls back to the
 * defaults.
 *
 * The created record carries the hotel name its siblings DECLARED, or none at all: a year typed by
 * hand must not hand the hotel an identity derived from its label, or the next upload would clash
 * with a name the user invented (see `hotel-identity.ts`).
 */
export async function addYear(key: DatasetKey): Promise<void> {
  await db.transaction("rw", db.hotels, db.centerYears, async () => {
    if (await db.centerYears.get([key.hotelId, key.centerId, key.year])) {
      return;
    }
    const hotel = await db.hotels.get(key.hotelId);
    if (!hotel) {
      return;
    }
    const existing = await db.centerYears.where("hotelId").equals(key.hotelId).toArray();
    const byRecency = [...existing].sort((a, b) => b.year - a.year);
    const sibling = byRecency.find((d) => d.centerId === key.centerId) ?? byRecency[0];
    const inherited = sibling?.channels ?? [];
    const channels =
      inherited.length > 0
        ? inherited.map((channel) => ({ ...channel }))
        : DEFAULT_CHANNELS.map((name) => ({ id: slugify(name), name }));

    const declaredHotelName = existing.find((d) => d.hotelName.trim())?.hotelName ?? "";
    // A brand-new sucursal has only its id to go by; `principal` takes the hotel's own name — the
    // declared one if there is any, the user's label otherwise, because this is display only.
    const center: CenterRow = {
      id: key.centerId,
      name:
        existing.find((d) => d.centerId === key.centerId)?.centerName ??
        (key.centerId === DEFAULT_CENTER_ID ? declaredHotelName || hotel.name : key.centerId),
    };
    const created = emptyDataset(key.year, declaredHotelName, center);
    created.channels = channels;
    created.months = created.months.map((month) => emptyMonth(month.index, month.days, channels));
    created.updatedAt = Date.now();
    await db.centerYears.put({ ...created, hotelId: key.hotelId });
    await db.hotels.update(key.hotelId, { activeCenterId: key.centerId, activeYear: key.year });
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

/** Deletes one sucursal-año of one hotel and, if it was active, falls back to whatever remains. */
export async function deleteYear(key: DatasetKey): Promise<void> {
  await db.transaction("rw", db.hotels, db.centerYears, async () => {
    await db.centerYears.delete([key.hotelId, key.centerId, key.year]);
    await repairActive(key.hotelId);
  });
}

/** Deletes a whole sucursal — every year of it — WITHIN one hotel. */
export async function deleteCenter(hotelId: string, centerId: string): Promise<void> {
  await db.transaction("rw", db.hotels, db.centerYears, async () => {
    const doomed = await db.centerYears.where("hotelId").equals(hotelId).toArray();
    await db.centerYears.bulkDelete(
      doomed
        .filter((d) => d.centerId === centerId)
        .map((d) => [d.hotelId, d.centerId, d.year] as [string, string, number]),
    );
    await repairActive(hotelId);
  });
}

/**
 * Only the months the file actually carries are replaced, so a hand-typed month survives a later
 * upload. The stored catalogue wins on naming; the file's unseen channels are appended.
 */
export async function mergeParsedDataset(
  hotelId: string,
  parsed: OccupancyParseResult,
): Promise<void> {
  await db.transaction("rw", db.hotels, db.centerYears, async () => {
    await mergeWithin(hotelId, parsed);
  });
}

/**
 * Replaces ONE hotel's contents: everything it held is dropped and the parsed workbooks take its
 * place. It is the clash dialog's secondary exit — right only when the hotel really is the same one
 * and its files started declaring a different name. Every other hotel is untouched.
 */
export async function replaceHotel(
  hotelId: string,
  results: OccupancyParseResult[],
): Promise<void> {
  await db.transaction("rw", db.hotels, db.centerYears, async () => {
    const doomed = await db.centerYears.where("hotelId").equals(hotelId).toArray();
    await db.centerYears.bulkDelete(
      doomed.map((d) => [d.hotelId, d.centerId, d.year] as [string, string, number]),
    );
    for (const parsed of results) {
      await mergeWithin(hotelId, parsed);
    }
  });
}

/** The merge itself. Assumes an open `rw` transaction over hotels + centerYears. */
async function mergeWithin(hotelId: string, parsed: OccupancyParseResult): Promise<void> {
  const incoming = parsed.dataset;
  const key: DatasetKey = { hotelId, centerId: incoming.centerId, year: incoming.year };
  const existing = await db.centerYears.get([key.hotelId, key.centerId, key.year]);

  if (!existing) {
    // The owner is stamped HERE, at the door: which hotel a workbook belongs to is decided by which
    // hotel is open, never by the file.
    const fresh: StoredOccupancyDataset = { ...incoming, hotelId, updatedAt: Date.now() };
    fresh.months = fresh.months.map(sizeChannels);
    seedEmptyMonths(fresh);
    await db.centerYears.put(fresh);
    await saveActiveViewWithin(key);
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

  const merged: StoredOccupancyDataset = {
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
  await db.centerYears.put(merged);
  await saveActiveViewWithin(key);
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
  apply: (stored: StoredOccupancyDataset) => boolean,
): Promise<void> {
  await db.transaction("rw", db.centerYears, async () => {
    const stored = await db.centerYears.get([key.hotelId, key.centerId, key.year]);
    if (!stored) {
      return;
    }
    if (apply(stored)) {
      stored.updatedAt = Date.now();
      await db.centerYears.put(stored);
    }
  });
}

/** `saveActiveView`'s body, for callers already inside a transaction. */
async function saveActiveViewWithin(key: DatasetKey): Promise<void> {
  await db.hotels.update(key.hotelId, { activeCenterId: key.centerId, activeYear: key.year });
}

/**
 * Keeps a hotel's open view pointing at something that exists. Prefers another year of the same
 * sucursal: deleting 2025 should not also move the user.
 */
async function repairActive(hotelId: string): Promise<void> {
  const hotel = await db.hotels.get(hotelId);
  if (!hotel) {
    return;
  }
  if (
    hotel.activeCenterId !== undefined &&
    hotel.activeYear !== undefined &&
    (await db.centerYears.get([hotelId, hotel.activeCenterId, hotel.activeYear]))
  ) {
    return;
  }
  const remaining = await db.centerYears.where("hotelId").equals(hotelId).toArray();
  if (remaining.length === 0) {
    // The hotel STAYS, now empty: it is the user's label, not a byproduct of its data.
    await db.hotels.update(hotelId, { activeCenterId: undefined, activeYear: undefined });
    return;
  }
  const sameCenter = remaining
    .filter((d) => d.centerId === hotel.activeCenterId)
    .sort((a, b) => b.year - a.year)[0];
  const fallback =
    sameCenter ??
    [...remaining].sort(
      (a, b) => a.centerName.localeCompare(b.centerName, "es") || a.year - b.year,
    )[0];
  await db.hotels.update(hotelId, {
    activeCenterId: fallback.centerId,
    activeYear: fallback.year,
  });
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
