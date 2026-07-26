import { describe, expect, it } from "vitest";
import { emptyDataset, emptyMonth, toAnnualGrid, toOccupancyGrid } from "./derive";
import type { OccupancyGridRow } from "./derive";
import type { MonthInputs, OccupancyDataset } from "./types";

/** A 3-day January 2026 whose inputs are supplied per row; the rest stay at zero. */
function january(inputs: Partial<MonthInputs>, channels: { id: string; name: string }[] = []) {
  const year: OccupancyDataset = emptyDataset(2026, "HOTEL X");
  year.channels = channels;
  const month = year.months[0];
  month.days = 3;
  month.inputs = { ...emptyMonth(0, 3, channels).inputs, ...inputs };
  return year;
}

function row(year: OccupancyDataset, id: string): OccupancyGridRow {
  const found = toOccupancyGrid(year, 0).rows.find((r) => r.id === id);
  if (!found) {
    throw new Error(`No row ${id}`);
  }
  return found;
}

describe("emptyDataset", () => {
  it("creates 12 months sized to the real calendar", () => {
    const year = emptyDataset(2026, "HOTEL X");
    expect(year.months).toHaveLength(12);
    expect(year.months.map((m) => m.days)).toEqual([
      31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ]);
  });

  it("sizes February to 29 days in a leap year", () => {
    expect(emptyDataset(2028, "HOTEL X").months[1].days).toBe(29);
  });
});

describe("toOccupancyGrid · indicadores por día", () => {
  it("computes ADR as revenue / sold", () => {
    const year = january({ revenue: [900, 400, 0], sold: [9, 5, 0] });
    expect(row(year, "adr").cells).toEqual([100, 80, null]);
  });

  it("computes occupancy as sold / available", () => {
    const year = january({ sold: [11, 5, 0], available: [22, 20, 20] });
    expect(row(year, "occupancy").cells).toEqual([0.5, 0.25, 0]);
  });

  it("computes RevPAR as revenue / available", () => {
    const year = january({ revenue: [880, 400, 0], available: [22, 20, 20] });
    expect(row(year, "revpar").cells).toEqual([40, 20, 0]);
  });

  it("yields null instead of Infinity when there are no rooms available", () => {
    const year = january({ revenue: [100], available: [0, 0, 0], sold: [0, 0, 0] });
    expect(row(year, "occupancy").cells[0]).toBeNull();
    expect(row(year, "revpar").cells[0]).toBeNull();
    expect(row(year, "adr").cells[0]).toBeNull();
  });

  it("accumulates occupancy over the days elapsed", () => {
    const year = january({ sold: [10, 0, 5], available: [20, 20, 20] });
    expect(row(year, "cumulativeOccupancy").cells).toEqual([0.5, 0.25, 0.25]);
  });
});

describe("toOccupancyGrid · columna Total / prom.", () => {
  it("aggregates ADR as total revenue over total rooms sold, not the average of daily ADRs", () => {
    // Daily ADRs are 100 and 50, so the mean of ratios is 75; 1200/14 is the answer.
    const year = january({ revenue: [1000, 200, 0], sold: [10, 4, 0] });
    expect(row(year, "adr").agg).toBeCloseTo(1200 / 14, 10);
    expect(row(year, "adr").agg).not.toBe(75);
  });

  it("keeps RevPAR = ADR × ocupación in the aggregate, which averaging ratios would break", () => {
    // (ΣR/ΣS) × (ΣS/ΣA) = ΣR/ΣA — a mean of the daily ratios would not satisfy it.
    const year = january({
      revenue: [1000, 200, 350],
      sold: [10, 4, 5],
      available: [22, 20, 18],
    });
    const adr = row(year, "adr").agg as number;
    const occupancy = row(year, "occupancy").agg as number;
    expect(row(year, "revpar").agg).toBeCloseTo(adr * occupancy, 10);
  });

  it("still defines RevPAR on a day with nothing sold, where ADR has no value", () => {
    // ADR × ocupación would be undefined here; RevPAR does not depend on `sold`.
    const year = january({ revenue: [0, 0, 0], sold: [0, 0, 0], available: [22, 22, 22] });
    expect(row(year, "adr").cells[0]).toBeNull();
    expect(row(year, "revpar").cells[0]).toBe(0);
  });

  it("aggregates occupancy and RevPAR as ratios of sums", () => {
    const year = january({ revenue: [600, 300, 0], sold: [6, 3, 0], available: [20, 10, 10] });
    expect(row(year, "occupancy").agg).toBeCloseTo(9 / 40, 10);
    expect(row(year, "revpar").agg).toBeCloseTo(900 / 40, 10);
  });

  it("averages the available-rooms row because it is a stock, not a flow", () => {
    const year = january({ available: [22, 22, 19] });
    expect(row(year, "available").agg).toBe(21);
  });

  it("rounds the available-rooms average: a hotel cannot have a fraction of a room", () => {
    // Real January 2026: 22 rooms every day but one with 20 → 680/31 = 21,935.
    expect(row(january({ available: [22, 22, 20] }), "available").agg).toBe(21);
    expect(row(january({ available: [22, 22, 21] }), "available").agg).toBe(22);
  });

  it("sums the revenue row", () => {
    const year = january({ revenue: [10, 20, 30] });
    expect(row(year, "revenue").agg).toBe(60);
  });

  it("takes the last value for the cumulative rows", () => {
    const year = january({
      sold: [10, 0, 5],
      available: [20, 20, 20],
      rooms: { simples: [1, 0, 0], dobles: [0, 1, 0], triples: [0, 0, 1] },
    });
    expect(row(year, "cumulativeOccupancy").agg).toBeCloseTo(0.25, 10);
    expect(row(year, "cumulativePax").agg).toBe(6);
  });
});

describe("toOccupancyGrid · habitaciones y PAX", () => {
  it("computes PAX as simples·1 + dobles·2 + triples·3", () => {
    const year = january({ rooms: { simples: [4, 0, 0], dobles: [4, 1, 0], triples: [2, 0, 0] } });
    expect(row(year, "pax").cells).toEqual([18, 2, 0]);
  });

  it("lets a stored PAX override the formula, day by day", () => {
    // A double room can sleep three with an extra bed; the hotel records that.
    const year = january({
      rooms: { simples: [4, 0, 0], dobles: [4, 1, 0], triples: [2, 0, 0] },
      pax: [19, null, null],
    });
    expect(row(year, "pax").cells).toEqual([19, 2, 0]);
    expect(row(year, "pax").editable).toBe(true);
  });

  it("reports which days carry a PAX override so the difference is visible", () => {
    const year = january({
      rooms: { simples: [4, 0, 0], dobles: [4, 1, 0], triples: [2, 0, 0] },
      pax: [19, 2, null],
    });
    // Day 2's override equals the formula, so it is not a difference worth reporting.
    expect(toOccupancyGrid(year, 0).paxOverrides).toEqual([0]);
  });

  it("accumulates PAX from the effective values, overrides included", () => {
    const year = january({
      rooms: { simples: [4, 0, 0], dobles: [4, 1, 0], triples: [2, 0, 0] },
      pax: [19, null, null],
    });
    expect(row(year, "cumulativePax").cells).toEqual([19, 21, 21]);
  });

  it("totals the room types per day", () => {
    const year = january({ rooms: { simples: [4, 0, 0], dobles: [4, 1, 0], triples: [2, 0, 0] } });
    expect(row(year, "totalRooms").cells).toEqual([10, 1, 0]);
  });
});

describe("toOccupancyGrid · canales", () => {
  const channels = [
    { id: "booking", name: "Booking" },
    { id: "web", name: "Página web" },
  ];

  it("renders one editable row per channel of the year catalogue, in order", () => {
    const year = january({ channels: { booking: [7, 5, 0], web: [1, 1, 0] } }, channels);
    const rows = toOccupancyGrid(year, 0).rows.filter((r) => r.kind === "channel");
    expect(rows.map((r) => r.id)).toEqual(["channel:booking", "channel:web"]);
    expect(rows.map((r) => r.label)).toEqual(["Booking", "Página web"]);
    expect(rows.every((r) => r.editable)).toBe(true);
  });

  it("renders only the channels the month actually holds, so each table is its own", () => {
    // "web" is in the year catalogue but this month does not use it: no row for it.
    const year = january({ channels: { booking: [7, 5, 0] } }, channels);
    const ids = toOccupancyGrid(year, 0)
      .rows.filter((r) => r.kind === "channel")
      .map((r) => r.id);
    expect(ids).toEqual(["channel:booking"]);
  });

  it("keeps catalogue order regardless of the order the month's keys were written", () => {
    const year = january({ channels: { web: [1, 1, 0], booking: [7, 5, 0] } }, channels);
    const ids = toOccupancyGrid(year, 0)
      .rows.filter((r) => r.kind === "channel")
      .map((r) => r.id);
    expect(ids).toEqual(["channel:booking", "channel:web"]);
  });

  it("totals the channels per day", () => {
    const year = january({ channels: { booking: [7, 5, 0], web: [1, 1, 0] } }, channels);
    expect(row(year, "totalChannels").cells).toEqual([8, 6, 0]);
  });
});

describe("toOccupancyGrid · cuadres", () => {
  const channels = [{ id: "booking", name: "Booking" }];

  /** Every day squares: channels = rooms = sold + complimentary. */
  function balanced() {
    return january(
      {
        sold: [7, 5, 0],
        complimentary: [1, 1, 0],
        channels: { booking: [8, 6, 0] },
        rooms: { simples: [8, 6, 0], dobles: [0, 0, 0], triples: [0, 0, 0] },
      },
      channels,
    );
  }

  it("reports no mismatch when channels and room types match sold + complimentary", () => {
    expect(toOccupancyGrid(balanced(), 0).mismatch).toEqual([]);
  });

  it("flags the day whose channel total does not match sold + complimentary", () => {
    const year = balanced();
    year.months[0].inputs.channels.booking = [8, 99, 0];
    const grid = toOccupancyGrid(year, 0);
    expect(grid.mismatch).toEqual([1]);
    expect(grid.channelMismatch).toEqual([1]);
    expect(grid.roomMismatch).toEqual([]);
  });

  it("unions both checks into mismatch without repeating a day that fails twice", () => {
    const year = balanced();
    year.months[0].inputs.channels.booking = [8, 99, 0];
    year.months[0].inputs.rooms.simples = [3, 99, 0];
    const grid = toOccupancyGrid(year, 0);
    expect(grid.mismatch).toEqual([0, 1]);
    expect(grid.roomMismatch).toEqual([0, 1]);
  });
});

describe("toOccupancyGrid · mes tal cual el archivo", () => {
  /** A month whose inputs say one thing and whose file said another. */
  function imported(edited: boolean) {
    const year = january({ revenue: [900, 400, 0], sold: [9, 5, 0], available: [22, 22, 22] });
    year.months[0].edited = edited;
    year.months[0].imported = {
      // The file's ADR is deliberately impossible from the inputs above.
      cells: { adr: [111, 222, null], sold: [9, 5, 0] },
      aggregates: { adr: 333, revenue: 4444 },
    };
    return year;
  }

  it("shows the file's own figures while the month is untouched", () => {
    const year = imported(false);
    expect(row(year, "adr").cells).toEqual([111, 222, null]);
    expect(row(year, "adr").agg).toBe(333);
    expect(row(year, "revenue").agg).toBe(4444);
  });

  it("computes everything once the month has been edited", () => {
    const year = imported(true);
    expect(row(year, "adr").cells).toEqual([100, 80, null]);
    expect(row(year, "adr").agg).toBeCloseTo(1300 / 14, 10);
    expect(row(year, "revenue").agg).toBe(1300);
  });

  it("computes the rows the file left without a value, even while untouched", () => {
    // The workbook stores many TOTAL cells as uncached formulas: there is no number to show.
    const year = imported(false);
    expect(row(year, "occupancy").cells).toEqual([9 / 22, 5 / 22, 0]);
    expect(row(year, "sold").agg).toBe(14);
  });

  it("ignores the snapshot on a month that never came from a file", () => {
    const year = january({ revenue: [900, 400, 0], sold: [9, 5, 0] });
    expect(row(year, "adr").cells).toEqual([100, 80, null]);
  });
});

describe("toOccupancyGrid · forma de la parrilla", () => {
  it("asks for whole percents on the accumulated row and decimals on Ocupación", () => {
    const year = january({});
    expect(row(year, "occupancy").format).toBe("percent");
    expect(row(year, "cumulativeOccupancy").format).toBe("percent-whole");
  });

  it("gives every row exactly one cell per day of the month", () => {
    const grid = toOccupancyGrid(emptyDataset(2026, "HOTEL X"), 1);
    expect(grid.columns).toBe(28);
    expect(grid.rows.every((r) => r.cells.length === 28)).toBe(true);
  });

  it("makes raw inputs editable and every derived row read-only", () => {
    const year = january({});
    const rows = toOccupancyGrid(year, 0).rows;
    const editable = rows.filter((r) => r.editable).map((r) => r.id);
    expect(editable).toEqual([
      "available",
      "revenue",
      "sold",
      "complimentary",
      "cancellations",
      "noShows",
      "noShowsOta",
      "simples",
      "dobles",
      "triples",
      // PAX is editable too: the room-type formula is only its default.
      "pax",
    ]);
    expect(rows.filter((r) => r.kind === "derived").every((r) => !r.editable)).toBe(true);
  });
});

/** A year whose months carry the given values on day 0; the rest stay at zero. */
function yearWith(
  perMonth: Partial<Record<keyof MonthInputs, number>>[],
  channels: { id: string; name: string }[] = [],
): OccupancyDataset {
  const dataset = emptyDataset(2026, "HOTEL X");
  dataset.channels = channels;
  perMonth.forEach((values, index) => {
    const month = dataset.months[index];
    month.inputs = emptyMonth(index, month.days, channels).inputs;
    for (const [key, value] of Object.entries(values)) {
      const target = month.inputs[key as keyof MonthInputs];
      if (Array.isArray(target)) {
        target[0] = value as number;
      }
    }
  });
  return dataset;
}

function annualRow(dataset: OccupancyDataset, id: string): OccupancyGridRow {
  const found = toAnnualGrid(dataset).rows.find((r) => r.id === id);
  if (!found) {
    throw new Error(`No row ${id}`);
  }
  return found;
}

describe("toAnnualGrid", () => {
  it("has one column per month plus the yearly total", () => {
    const grid = toAnnualGrid(emptyDataset(2026, "HOTEL X"));
    expect(grid.scope).toBe("year");
    expect(grid.columns).toBe(12);
    expect(grid.columnLabels).toEqual([
      "Ene",
      "Feb",
      "Mar",
      "Abr",
      "May",
      "Jun",
      "Jul",
      "Ago",
      "Sep",
      "Oct",
      "Nov",
      "Dic",
    ]);
    expect(grid.rows.every((r) => r.cells.length === 12)).toBe(true);
  });

  it("sums each input row over the month, and the year over the months", () => {
    const dataset = emptyDataset(2026, "HOTEL X");
    dataset.months[0].inputs.sold = [9, 5, 4, ...new Array(28).fill(0)];
    dataset.months[1].inputs.sold = [2, 1, ...new Array(26).fill(0)];

    const sold = annualRow(dataset, "sold");
    expect(sold.cells[0]).toBe(18);
    expect(sold.cells[1]).toBe(3);
    expect(sold.agg).toBe(21);
  });

  it("counts available rooms as room-nights, the denominator of occupancy", () => {
    const dataset = emptyDataset(2026, "HOTEL X");
    dataset.months[0].inputs.available = new Array(31).fill(22);

    // 22 rooms every day of January, not the 22 the monthly view reports as "the hotel's rooms".
    expect(annualRow(dataset, "available").cells[0]).toBe(682);
    expect(annualRow(dataset, "available").hint).toMatch(/noche/i);
  });

  it("computes the indicators as a ratio of each month's sums", () => {
    const dataset = yearWith([{ revenue: 1000, sold: 10, available: 40 }]);
    expect(annualRow(dataset, "adr").cells[0]).toBe(100);
    expect(annualRow(dataset, "occupancy").cells[0]).toBe(0.25);
    expect(annualRow(dataset, "revpar").cells[0]).toBe(25);
  });

  it("keeps ADR × Ocupación = RevPAR on the yearly total", () => {
    const dataset = yearWith([
      { revenue: 1000, sold: 10, available: 40 },
      { revenue: 300, sold: 6, available: 30 },
    ]);
    const adr = annualRow(dataset, "adr").agg ?? 0;
    const occupancy = annualRow(dataset, "occupancy").agg ?? 0;
    expect(adr * occupancy).toBeCloseTo(annualRow(dataset, "revpar").agg ?? 0, 10);
  });

  it("accumulates occupancy month by month, ending at the year's own figure", () => {
    const dataset = yearWith([
      { sold: 10, available: 40 },
      { sold: 10, available: 60 },
    ]);
    const cumulative = annualRow(dataset, "cumulativeOccupancy");
    expect(cumulative.cells[0]).toBeCloseTo(0.25, 10); // 10/40
    expect(cumulative.cells[1]).toBeCloseTo(0.2, 10); // 20/100
    expect(cumulative.agg).toBe(annualRow(dataset, "occupancy").agg);
  });

  it("leaves an empty month's indicators empty instead of zero", () => {
    const dataset = yearWith([{ revenue: 1000, sold: 10, available: 40 }]);
    expect(annualRow(dataset, "sold").cells[5]).toBe(0);
    expect(annualRow(dataset, "adr").cells[5]).toBeNull();
    expect(annualRow(dataset, "occupancy").cells[5]).toBeNull();
  });

  it("sums the channels of every month under one row each", () => {
    const channels = [{ id: "booking", name: "Booking" }];
    const dataset = yearWith([{}, {}], channels);
    dataset.months[0].inputs.channels.booking[0] = 7;
    dataset.months[0].inputs.channels.booking[1] = 5;
    dataset.months[1].inputs.channels.booking[0] = 3;

    const row = annualRow(dataset, "channel:booking");
    expect(row.cells[0]).toBe(12);
    expect(row.cells[1]).toBe(3);
    expect(row.agg).toBe(15);
  });

  it("never shows a month verbatim from the workbook", () => {
    const dataset = emptyDataset(2026, "HOTEL X");
    dataset.months[0].inputs.sold[0] = 9;
    dataset.months[0].imported = { cells: { sold: [999] }, aggregates: { sold: 999 } };

    const grid = toAnnualGrid(dataset);
    expect(grid.asImported).toBe(false);
    expect(grid.rows.find((r) => r.id === "sold")?.cells[0]).toBe(9);
  });

  it("reports the cuadre checks by month", () => {
    const dataset = yearWith([{ sold: 5 }, { sold: 5 }], [{ id: "booking", name: "Booking" }]);
    // February's channels account for its rooms; January's do not.
    dataset.months[1].inputs.channels.booking[0] = 5;

    const grid = toAnnualGrid(dataset);
    expect(grid.channelMismatch).toEqual([0]);
    // Neither month declares room types for what it sold, so both fail that second check.
    expect(grid.roomMismatch).toEqual([0, 1]);
    expect(grid.mismatch).toEqual([0, 1]);
  });

  it("is never editable: a month's cell is an aggregate of days", () => {
    const grid = toAnnualGrid(yearWith([{ sold: 5 }]));
    expect(grid.rows.every((r) => !r.editable)).toBe(true);
  });
});

describe("toAnnualGrid · agrupado por trimestre y semestre", () => {
  /** Ene/Feb/Mar and Abr, so T1 covers three months and T2 only one. */
  const quarters = () =>
    yearWith([
      { revenue: 300, sold: 10, available: 40 },
      { revenue: 400, sold: 20, available: 60 },
      { revenue: 500, sold: 30, available: 100 },
      { revenue: 200, sold: 5, available: 50 },
    ]);

  const cell = (dataset: OccupancyDataset, id: string, frequency: "trimestral" | "semestral") => {
    const found = toAnnualGrid(dataset, frequency).rows.find((r) => r.id === id);
    if (!found) {
      throw new Error(`No row ${id}`);
    }
    return found;
  };

  it("has one column per period, named the way PyG names them", () => {
    const grid = toAnnualGrid(emptyDataset(2026, "HOTEL X"), "trimestral");
    expect(grid.scope).toBe("year");
    expect(grid.frequency).toBe("trimestral");
    expect(grid.columns).toBe(4);
    expect(grid.columnLabels).toEqual(["T1", "T2", "T3", "T4"]);

    const semesters = toAnnualGrid(emptyDataset(2026, "HOTEL X"), "semestral");
    expect(semesters.columns).toBe(2);
    expect(semesters.columnLabels).toEqual(["S1", "S2"]);
  });

  it("defaults to months, so the existing annual view is unchanged", () => {
    expect(toAnnualGrid(quarters()).columnLabels).toHaveLength(12);
    expect(toAnnualGrid(quarters(), "mensual").rows).toEqual(toAnnualGrid(quarters()).rows);
  });

  it("sums the raw inputs of the months it covers", () => {
    expect(cell(quarters(), "sold", "trimestral").cells).toEqual([60, 5, 0, 0]);
    expect(cell(quarters(), "revenue", "trimestral").cells).toEqual([1200, 200, 0, 0]);
    expect(cell(quarters(), "available", "trimestral").cells).toEqual([200, 50, 0, 0]);
    expect(cell(quarters(), "sold", "semestral").cells).toEqual([65, 0]);
  });

  it("computes the indicators as ratios OF THOSE SUMS, not averages of the months", () => {
    // ADR of T1 = 1200 / 60 = 20, not the mean of 30, 20 and 16,67.
    expect(cell(quarters(), "adr", "trimestral").cells[0]).toBeCloseTo(20, 10);
    expect(cell(quarters(), "occupancy", "trimestral").cells[0]).toBeCloseTo(0.3, 10);
    expect(cell(quarters(), "revpar", "trimestral").cells[0]).toBeCloseTo(6, 10);
  });

  it("keeps ADR × Ocupación = RevPAR inside a quarter", () => {
    const adr = cell(quarters(), "adr", "trimestral").cells[0] ?? 0;
    const occupancy = cell(quarters(), "occupancy", "trimestral").cells[0] ?? 0;
    expect(adr * occupancy).toBeCloseTo(cell(quarters(), "revpar", "trimestral").cells[0] ?? 0, 10);
  });

  it("leaves a period with nothing in it empty instead of zero", () => {
    expect(cell(quarters(), "sold", "trimestral").cells[2]).toBe(0);
    expect(cell(quarters(), "adr", "trimestral").cells[2]).toBeNull();
    expect(cell(quarters(), "occupancy", "trimestral").cells[2]).toBeNull();
  });

  it("keeps the Total column on the whole year whatever the columns are", () => {
    expect(cell(quarters(), "sold", "trimestral").agg).toBe(65);
    expect(cell(quarters(), "sold", "semestral").agg).toBe(65);
  });

  it("folds the channels into the same periods", () => {
    const channels = [{ id: "booking", name: "Booking" }];
    const dataset = yearWith([{}, {}, {}, {}], channels);
    dataset.months[0].inputs.channels.booking[0] = 7;
    dataset.months[2].inputs.channels.booking[0] = 5;
    dataset.months[3].inputs.channels.booking[0] = 3;

    expect(cell(dataset, "channel:booking", "trimestral").cells).toEqual([12, 3, 0, 0]);
  });

  it("reports the cuadre checks by period, not by month", () => {
    const dataset = yearWith([{ sold: 5 }, { sold: 5 }], [{ id: "booking", name: "Booking" }]);
    dataset.months[0].inputs.channels.booking[0] = 5;
    dataset.months[1].inputs.channels.booking[0] = 5;
    // Both months cuadran on channels, so T1 does too — and no other quarter sold anything.
    expect(toAnnualGrid(dataset, "trimestral").channelMismatch).toEqual([]);
    // Neither month declares room types for what it sold, so T1 fails that second check.
    expect(toAnnualGrid(dataset, "trimestral").roomMismatch).toEqual([0]);
  });

  it("stays read-only: a quarter's cell is an aggregate of days", () => {
    expect(toAnnualGrid(quarters(), "trimestral").rows.every((r) => !r.editable)).toBe(true);
  });
});
