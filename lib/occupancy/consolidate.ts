/**
 * Sums a hotel's centers for one year into a synthetic dataset the grid renders like any other.
 *
 * Only RAW INPUTS are summed; `derive.ts` recomputes the indicators as ratios of those sums, the
 * only definition under which `ADR × Ocupación = RevPAR` survives. Never stored: deriving it on
 * read is what keeps an edit in any center from leaving a saved copy stale.
 */
import { daysInMonth, ROOM_ROW_IDS } from "./derive";
import {
  CONSOLIDATED_CENTER_ID,
  type ChannelRow,
  type MonthInputs,
  type OccupancyDataset,
  type OccupancyMonth,
} from "./types";

export const CONSOLIDATED_NAME = "Consolidado";

function zeros(days: number): number[] {
  return new Array<number>(days).fill(0);
}

function addInto(target: number[], source: number[] | undefined): void {
  if (!source) {
    return;
  }
  for (let day = 0; day < target.length; day++) {
    const value = source[day];
    if (typeof value === "number" && Number.isFinite(value)) {
      target[day] += value;
    }
  }
}

function paxFromRooms(inputs: MonthInputs, days: number): number[] {
  const weights = { simples: 1, dobles: 2, triples: 3 };
  return Array.from({ length: days }, (_, day) =>
    ROOM_ROW_IDS.reduce((total, id) => total + (inputs.rooms[id]?.[day] ?? 0) * weights[id], 0),
  );
}

/** Every dataset is expected to be the same year; `null` when there is nothing to sum. */
export function consolidate(datasets: OccupancyDataset[]): OccupancyDataset | null {
  const first = datasets[0];
  if (!first) {
    return null;
  }

  // Union in the order the centers list them, so the table reads like the one you came from.
  const channels: ChannelRow[] = [];
  const known = new Set<string>();
  for (const dataset of datasets) {
    for (const channel of dataset.channels) {
      if (!known.has(channel.id)) {
        known.add(channel.id);
        channels.push({ ...channel });
      }
    }
  }

  const months = Array.from({ length: 12 }, (_, index) =>
    consolidateMonth(datasets, first.year, index),
  );

  return {
    centerId: CONSOLIDATED_CENTER_ID,
    centerName: CONSOLIDATED_NAME,
    year: first.year,
    hotelName: first.hotelName,
    channels,
    months,
    // Each center shows its own parse notices in its own tab.
    warnings: [],
    updatedAt: datasets.reduce((newest, d) => Math.max(newest, d.updatedAt), 0),
  };
}

function consolidateMonth(
  datasets: OccupancyDataset[],
  year: number,
  index: number,
): OccupancyMonth {
  const days = daysInMonth(year, index);
  const inputs: MonthInputs = {
    available: zeros(days),
    revenue: zeros(days),
    sold: zeros(days),
    complimentary: zeros(days),
    cancellations: zeros(days),
    noShows: zeros(days),
    noShowsOta: zeros(days),
    channels: {},
    rooms: { simples: zeros(days), dobles: zeros(days), triples: zeros(days) },
    pax: new Array<number | null>(days).fill(null),
  };
  // A stated PAX wins over the room-type formula, so the extra beds the files record survive.
  const countedPax = zeros(days);

  for (const dataset of datasets) {
    const month = dataset.months[index];
    if (!month) {
      continue;
    }
    addInto(inputs.available, month.inputs.available);
    addInto(inputs.revenue, month.inputs.revenue);
    addInto(inputs.sold, month.inputs.sold);
    addInto(inputs.complimentary, month.inputs.complimentary);
    addInto(inputs.cancellations, month.inputs.cancellations);
    addInto(inputs.noShows, month.inputs.noShows);
    addInto(inputs.noShowsOta, month.inputs.noShowsOta);
    for (const id of ROOM_ROW_IDS) {
      addInto(inputs.rooms[id], month.inputs.rooms[id]);
    }

    for (const [channelId, series] of Object.entries(month.inputs.channels)) {
      inputs.channels[channelId] ??= zeros(days);
      addInto(inputs.channels[channelId], series);
    }

    const fromRooms = paxFromRooms(month.inputs, days);
    for (let day = 0; day < days; day++) {
      countedPax[day] += month.inputs.pax[day] ?? fromRooms[day];
    }
  }

  // Consolidating must not by itself raise the "PAX declarado a mano" notice.
  const fromRooms = paxFromRooms(inputs, days);
  for (let day = 0; day < days; day++) {
    inputs.pax[day] = countedPax[day] === fromRooms[day] ? null : countedPax[day];
  }

  return {
    index,
    days,
    // Not summable: two centers open 25 nights do not make 50.
    nights: null,
    fromFile: false,
    inputs,
    edited: false,
  };
}
