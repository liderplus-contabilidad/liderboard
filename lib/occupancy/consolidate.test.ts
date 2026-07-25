import { describe, expect, it } from "vitest";
import { consolidate } from "./consolidate";
import { emptyDataset, toOccupancyGrid } from "./derive";
import { CONSOLIDATED_CENTER_ID, type OccupancyDataset } from "./types";

/** A sucursal-year with January filled in; every array is sized to January's 31 days. */
function sucursal(
  id: string,
  values: {
    available?: number[];
    revenue?: number[];
    sold?: number[];
    channels?: Record<string, number[]>;
    rooms?: { simples?: number[]; dobles?: number[]; triples?: number[] };
    pax?: (number | null)[];
  },
): OccupancyDataset {
  const dataset = emptyDataset(2026, "HOTEL A", { id, name: id.toUpperCase() });
  const january = dataset.months[0];
  const put = (target: number[], source?: number[]) => {
    (source ?? []).forEach((value, day) => {
      target[day] = value;
    });
  };
  put(january.inputs.available, values.available);
  put(january.inputs.revenue, values.revenue);
  put(january.inputs.sold, values.sold);
  put(january.inputs.rooms.simples, values.rooms?.simples);
  put(january.inputs.rooms.dobles, values.rooms?.dobles);
  put(january.inputs.rooms.triples, values.rooms?.triples);
  (values.pax ?? []).forEach((value, day) => {
    january.inputs.pax[day] = value;
  });
  for (const [channelId, series] of Object.entries(values.channels ?? {})) {
    january.inputs.channels[channelId] = new Array<number>(january.days).fill(0);
    put(january.inputs.channels[channelId], series);
    if (!dataset.channels.some((c) => c.id === channelId)) {
      dataset.channels.push({ id: channelId, name: channelId });
    }
  }
  return dataset;
}

const agg = (dataset: OccupancyDataset, rowId: string) =>
  toOccupancyGrid(dataset, 0).rows.find((row) => row.id === rowId)?.agg;

describe("consolidate", () => {
  it("has nothing to consolidate without datasets", () => {
    expect(consolidate([])).toBeNull();
  });

  it("identifies itself as the reserved consolidated view", () => {
    const merged = consolidate([sucursal("a", {}), sucursal("b", {})]);
    expect(merged?.centerId).toBe(CONSOLIDATED_CENTER_ID);
    expect(merged?.year).toBe(2026);
    expect(merged?.hotelName).toBe("HOTEL A");
  });

  it("sums the raw inputs day by day", () => {
    const merged = consolidate([
      sucursal("a", { sold: [9, 5], available: [22, 22] }),
      sucursal("b", { sold: [1, 2], available: [10, 10] }),
    ]);
    expect(merged?.months[0].inputs.sold.slice(0, 2)).toEqual([10, 7]);
    expect(merged?.months[0].inputs.available.slice(0, 2)).toEqual([32, 32]);
  });

  it("computes ADR as a ratio of sums, not an average of the sucursales' ADR", () => {
    // A charges 100/room, B charges 50/room. The average of the two ADR is 75 only because
    // both sold the same number of rooms; the ratio of sums is the definition that holds.
    const merged = consolidate([
      sucursal("a", { revenue: [1000], sold: [10] }),
      sucursal("b", { revenue: [500], sold: [10] }),
    ]);
    expect(agg(merged as OccupancyDataset, "adr")).toBeCloseTo(75, 10);
  });

  it("keeps ADR × Ocupación = RevPAR on the consolidated total", () => {
    const merged = consolidate([
      sucursal("a", { revenue: [1000, 400], sold: [10, 4], available: [20, 20] }),
      sucursal("b", { revenue: [300], sold: [2], available: [8, 8] }),
    ]) as OccupancyDataset;
    const adr = agg(merged, "adr") ?? 0;
    const occupancy = agg(merged, "occupancy") ?? 0;
    expect(adr * occupancy).toBeCloseTo(agg(merged, "revpar") ?? 0, 10);
  });

  it("unions the channels by id and sums the ones both sucursales sell through", () => {
    const merged = consolidate([
      sucursal("a", { channels: { booking: [7, 5], "pagina-web": [3, 1] } }),
      sucursal("b", { channels: { booking: [1, 1] } }),
    ]);
    expect(merged?.channels.map((c) => c.id).sort()).toEqual(["booking", "pagina-web"]);
    expect(merged?.months[0].inputs.channels.booking.slice(0, 2)).toEqual([8, 6]);
    // A channel only one sucursal uses keeps its own figures rather than disappearing.
    expect(merged?.months[0].inputs.channels["pagina-web"].slice(0, 2)).toEqual([3, 1]);
  });

  it("adds up the PAX each sucursal actually counted", () => {
    const merged = consolidate([
      // 4 doubles would be 8 guests; the file counted 9 (an extra bed).
      sucursal("a", { rooms: { dobles: [4] }, pax: [9] }),
      sucursal("b", { rooms: { dobles: [1] } }),
    ]);
    // 9 counted + 2 derived = 11, and the room types alone would say 10 — so it is an override.
    expect(merged?.months[0].inputs.pax[0]).toBe(11);
  });

  it("leaves PAX tracking the room types when no sucursal overrode it", () => {
    const merged = consolidate([
      sucursal("a", { rooms: { dobles: [4] } }),
      sucursal("b", { rooms: { simples: [3] } }),
    ]) as OccupancyDataset;
    // Stored as null, so consolidating does not by itself raise the "PAX a mano" notice.
    expect(merged.months[0].inputs.pax[0]).toBeNull();
    expect(toOccupancyGrid(merged, 0).paxOverrides).toEqual([]);
    expect(agg(merged, "pax")).toBe(11); // 4·2 + 3·1
  });

  it("is never shown verbatim from a workbook", () => {
    const verbatim = sucursal("a", { sold: [9] });
    verbatim.months[0].imported = { cells: { sold: [999] }, aggregates: { sold: 999 } };
    const merged = consolidate([verbatim, sucursal("b", { sold: [1] })]) as OccupancyDataset;

    expect(merged.months[0].imported).toBeUndefined();
    const grid = toOccupancyGrid(merged, 0);
    expect(grid.asImported).toBe(false);
    // The sucursal's own file figure never leaks into the sum.
    expect(grid.rows.find((r) => r.id === "sold")?.cells[0]).toBe(10);
  });

  it("sizes every month from the calendar", () => {
    const merged = consolidate([sucursal("a", {}), sucursal("b", {})]) as OccupancyDataset;
    expect(merged.months).toHaveLength(12);
    expect(merged.months[1].days).toBe(28); // febrero 2026
    expect(merged.months[1].inputs.sold).toHaveLength(28);
  });

  it("carries no declared nights: the sucursales' own are not summable", () => {
    const a = sucursal("a", {});
    a.months[0].nights = 25;
    const merged = consolidate([a, sucursal("b", {})]);
    expect(merged?.months[0].nights).toBeNull();
  });
});
