import { describe, expect, it } from "vitest";
import { OccupancyParseError } from "./errors";
import { parseOccupancyWorkbook } from "./parse";
import {
  aoaToXlsxBuffer,
  monthBlock,
  occupancySheet,
  type FixtureCell,
  type MonthBlockSpec,
  type SheetSpec,
} from "./parse.fixtures";
import { CONSOLIDATED_CENTER_ID, DEFAULT_CENTER_ID } from "./types";

/** The current file shape: title, hotel line, cost-center line, then the blocks. */
const SHEET: SheetSpec = { hotel: "HOTEL A", center: "CULTURA MANOR" };

function parse(
  blocks: MonthBlockSpec[],
  fileName = "OCUPACION_CULTURA_MANOR_2026.xlsx",
  sheet: SheetSpec = SHEET,
) {
  return parseSheet(occupancySheet(blocks.map(monthBlock), sheet), fileName);
}

function parseSheet(aoa: FixtureCell[][], fileName = "OCUPACION_CULTURA_MANOR_2026.xlsx") {
  return parseOccupancyWorkbook(aoaToXlsxBuffer(aoa), fileName);
}

const ENERO: MonthBlockSpec = {
  name: "ENERO",
  available: [22, 22, 20],
  revenue: [900, 400, 0],
  sold: [9, 5, 0],
  complimentary: [1, 1, 0],
  cancellations: [0, 1, 0],
  noShows: [0, 0, 2],
  noShowsOta: [1, 0, 0],
  channels: [
    ["Booking  ", [7, 5, 0]],
    ["Página web", [3, 1, 0]],
  ],
  rooms: { simples: [4, 2, 0], dobles: [4, 4, 0], triples: [2, 0, 0] },
};

describe("parseOccupancyWorkbook · bloques de mes", () => {
  it("reads each stacked month block into its calendar slot", () => {
    const { dataset, parsedMonths } = parse([ENERO, { name: "FEBRERO", sold: [1, 2, 3] }]);

    expect(parsedMonths).toEqual([0, 1]);
    expect(dataset.months).toHaveLength(12);
    expect(dataset.months[0].inputs.sold.slice(0, 3)).toEqual([9, 5, 0]);
    expect(dataset.months[1].inputs.sold.slice(0, 3)).toEqual([1, 2, 3]);
    expect(dataset.months[0].fromFile).toBe(true);
    expect(dataset.months[2].fromFile).toBe(false);
  });

  it("maps every raw input row through its accented, asterisked label", () => {
    const { inputs } = parse([ENERO]).dataset.months[0];

    expect(inputs.available.slice(0, 3)).toEqual([22, 22, 20]);
    expect(inputs.revenue.slice(0, 3)).toEqual([900, 400, 0]);
    expect(inputs.complimentary.slice(0, 3)).toEqual([1, 1, 0]);
    expect(inputs.cancellations.slice(0, 3)).toEqual([0, 1, 0]);
    expect(inputs.noShows.slice(0, 3)).toEqual([0, 0, 2]);
    expect(inputs.noShowsOta.slice(0, 3)).toEqual([1, 0, 0]);
    expect(inputs.rooms.simples.slice(0, 3)).toEqual([4, 2, 0]);
    expect(inputs.rooms.triples.slice(0, 3)).toEqual([2, 0, 0]);
  });

  it("sizes each month from the real calendar and zero-fills the untouched days", () => {
    const { dataset } = parse([ENERO]);
    expect(dataset.months[0].inputs.sold).toHaveLength(31);
    expect(dataset.months[0].inputs.sold.slice(3)).toEqual(new Array(28).fill(0));
  });

  it("does not let a channel named «Complementarias» overwrite the metric row", () => {
    // The real files carry BOTH a "Complementarias" metric and a "Complementarias" channel.
    const { dataset } = parse([
      {
        name: "ENERO",
        sold: [6, 6, 6],
        complimentary: [2, 2, 1],
        // Distinct on purpose: in the real January the two rows disagree (2 vs 1 on day 11).
        channels: [
          ["Booking", [6, 6, 6]],
          ["Complementarias", [5, 5, 5]],
        ],
      },
    ]);
    expect(dataset.months[0].inputs.complimentary.slice(0, 3)).toEqual([2, 2, 1]);
  });

  it("does not let a room-type row named «Simples» be read as a metric", () => {
    const { dataset } = parse([{ name: "ENERO", rooms: { simples: [3, 0, 0] } }]);
    expect(dataset.months[0].inputs.rooms.simples.slice(0, 3)).toEqual([3, 0, 0]);
    expect(dataset.months[0].inputs.sold.slice(0, 3)).toEqual([0, 0, 0]);
  });

  it("skips a block whose month name is not recognisable and says so", () => {
    const { dataset, parsedMonths } = parse([ENERO, { name: "SETIEMBRÉ ??", sold: [1, 1, 1] }]);
    expect(parsedMonths).toEqual([0]);
    expect(dataset.warnings.join(" ")).toMatch(/SETIEMBR/i);
  });

  it("rejects a workbook with no month blocks at all", () => {
    expect(() => parseSheet([["Ocupación  - 2026"], [null], ["algo"]])).toThrow(
      OccupancyParseError,
    );
  });
});

describe("parseOccupancyWorkbook · valores tal cual del archivo", () => {
  it("keeps the file's own indicators as the month's imported snapshot", () => {
    // The fixture's indicator rows are 999 — impossible from its inputs, so a leak is obvious.
    const { dataset } = parse([ENERO]);
    const snapshot = dataset.months[0].imported;
    expect(snapshot?.cells.adr?.slice(0, 3)).toEqual([999, 999, 999]);
    expect(snapshot?.cells.revpar?.slice(0, 3)).toEqual([999, 999, 999]);
    expect(dataset.months[0].edited).toBe(false);
  });

  it("snapshots the raw rows too, so the whole table matches the file", () => {
    const snapshot = parse([ENERO]).dataset.months[0].imported;
    expect(snapshot?.cells.revenue?.slice(0, 3)).toEqual([900, 400, 0]);
    expect(snapshot?.cells["channel:booking"]?.slice(0, 3)).toEqual([7, 5, 0]);
  });

  it("leaves the aggregate unset where the file has an uncached formula", () => {
    // Every fixture TOTAL is the string "SUM(...)", never a number.
    const snapshot = parse([ENERO]).dataset.months[0].imported;
    expect(snapshot?.aggregates.revenue ?? null).toBeNull();
  });

  it("reads the TOTAL column even when the day headers stop short of it", () => {
    // February's header runs to day 30 while TOTAL stays at AG: assuming adjacency read empty.
    const { dataset } = parse([
      {
        name: "FEBRERO",
        nights: 28,
        dayHeaders: Array.from({ length: 30 }, (_, i) => i + 1),
        sold: [6, 1, 1],
        totals: { "Ocupacion %": 0.2045, "Numero de Habitaciones vendidas y cobradas*": 135 },
      },
    ]);
    expect(dataset.months[1].imported?.aggregates.occupancy).toBeCloseTo(0.2045, 10);
    expect(dataset.months[1].imported?.aggregates.sold).toBe(135);
  });

  it("does not snapshot a month it never read", () => {
    expect(parse([ENERO]).dataset.months[5].imported).toBeUndefined();
  });
});

describe("parseOccupancyWorkbook · indicadores del archivo", () => {
  it("ignores the file's own ADR, Ocupación, RevPAR and PAX rows", () => {
    // The fixture fills them with 999/9 — none of that may reach the stored inputs.
    const { inputs } = parse([ENERO]).dataset.months[0];
    const stored = [
      ...inputs.available,
      ...inputs.revenue,
      ...inputs.sold,
      ...inputs.complimentary,
      ...inputs.cancellations,
      ...inputs.noShows,
      ...inputs.noShowsOta,
      ...Object.values(inputs.channels).flat(),
      ...Object.values(inputs.rooms).flat(),
    ];
    expect(stored).not.toContain(999);
  });

  it("stores PAX only on the days the file disagrees with the room types", () => {
    // Day 1's 19 cannot come from 4+4+2 rooms — an extra bed. Days 2 and 3 match the formula.
    const { dataset } = parse([
      {
        name: "ENERO",
        rooms: { simples: [4, 0, 0], dobles: [4, 1, 0], triples: [2, 0, 0] },
        pax: [19, 2, 0],
      },
    ]);
    expect(dataset.months[0].inputs.pax.slice(0, 3)).toEqual([19, null, null]);
  });

  it("never reads the TOTAL column, which holds an uncached formula string", () => {
    // Day columns stop at the last integer header, so "SUM(...)" is out of reach.
    const { inputs } = parse([ENERO]).dataset.months[0];
    expect(inputs.sold.every((v) => typeof v === "number" && Number.isFinite(v))).toBe(true);
    expect(inputs.sold.reduce((a, b) => a + b, 0)).toBe(14);
  });
});

describe("parseOccupancyWorkbook · catálogo de canales", () => {
  it("unions the channels of every month in order of first appearance", () => {
    const { dataset } = parse([
      {
        name: "ENERO",
        channels: [
          ["Booking", [1, 0, 0]],
          ["HRS", [2, 0, 0]],
        ],
      },
      {
        name: "FEBRERO",
        channels: [
          ["Booking", [3, 0, 0]],
          ["AirBnB", [4, 0, 0]],
        ],
      },
    ]);
    expect(dataset.channels.map((c) => c.name)).toEqual(["Booking", "HRS", "AirBnB"]);
  });

  it("gives each month only the channels its own block listed", () => {
    // Membership is per month: January must not inherit February's AirBnB row.
    const { dataset } = parse([
      { name: "ENERO", channels: [["Booking", [1, 0, 0]]] },
      { name: "FEBRERO", channels: [["AirBnB", [4, 0, 0]]] },
    ]);
    expect(dataset.channels.map((c) => c.name)).toEqual(["Booking", "AirBnB"]);
    expect(Object.keys(dataset.months[0].inputs.channels)).toEqual(["booking"]);
    expect(Object.keys(dataset.months[1].inputs.channels)).toEqual(["airbnb"]);
  });

  it("matches channel names across months ignoring case, accents and stray spaces", () => {
    const { dataset } = parse([
      { name: "ENERO", channels: [["Página web", [1, 0, 0]]] },
      { name: "FEBRERO", channels: [["  PAGINA WEB ", [5, 0, 0]]] },
    ]);
    expect(dataset.channels).toHaveLength(1);
    const id = dataset.channels[0].id;
    expect(dataset.months[0].inputs.channels[id][0]).toBe(1);
    expect(dataset.months[1].inputs.channels[id][0]).toBe(5);
  });

  it("sums a channel label repeated inside one block and warns about it", () => {
    const { dataset } = parse([
      {
        name: "MARZO",
        channels: [
          ["Grupos", [2, 0, 0]],
          ["Booking", [1, 0, 0]],
          ["Grupos", [3, 0, 0]],
        ],
      },
    ]);
    expect(dataset.channels.map((c) => c.name)).toEqual(["Grupos", "Booking"]);
    const grupos = dataset.channels[0].id;
    expect(dataset.months[2].inputs.channels[grupos][0]).toBe(5);
    expect(dataset.warnings.join(" ")).toMatch(/MARZO.*Grupos.*2 veces/i);
  });
});

describe("parseOccupancyWorkbook · metadatos", () => {
  it("takes the year from the sheet title", () => {
    expect(parse([ENERO]).dataset.year).toBe(2026);
  });

  it("falls back to the file name when the sheet has no year, and warns", () => {
    const aoa = occupancySheet([monthBlock(ENERO)], { title: "Ocupación", hotel: "HOTEL A" });
    const { dataset } = parseSheet(aoa, "OCUPACION_CULTURA_MANOR_2024.xlsx");
    expect(dataset.year).toBe(2024);
    expect(dataset.warnings.join(" ")).toMatch(/nombre del archivo/i);
  });

  it("still takes the year from the title with both name lines present", () => {
    expect(parse([ENERO], "OCUPACION.xlsx").dataset.year).toBe(2026);
  });

  it("keeps NUMERO DE NOCHES as informational and still sizes the month from the calendar", () => {
    // JUNIO declaring 31 nights is the real file's defect: June has 30 days.
    const { dataset } = parse([{ name: "JUNIO", nights: 31, sold: [1, 1, 1] }]);
    expect(dataset.months[5].days).toBe(30);
    expect(dataset.months[5].inputs.sold).toHaveLength(30);
    expect(dataset.months[5].nights).toBe(31);
    expect(dataset.warnings.join(" ")).toMatch(/JUNIO.*31.*30/i);
  });

  it("does not warn when the declared nights are fewer than the month's days", () => {
    // Enero declaring 25 nights is legitimate: the hotel need not sell every night.
    const { dataset } = parse([{ name: "ENERO", nights: 25, sold: [1, 1, 1] }]);
    expect(dataset.warnings).toEqual([]);
  });

  it("drops day columns beyond the month's real length and warns if they held data", () => {
    // February blocks in the real file carry headers up to day 30.
    const dayHeaders = Array.from({ length: 30 }, (_, i) => i + 1);
    const sold = new Array(30).fill(0);
    sold[29] = 7;
    const { dataset } = parse([{ name: "FEBRERO", dayHeaders, sold }]);
    expect(dataset.months[1].inputs.sold).toHaveLength(28);
    expect(dataset.warnings.join(" ")).toMatch(/FEBRERO.*descart/i);
  });

  it("stays silent when the surplus day columns are empty", () => {
    const dayHeaders = Array.from({ length: 30 }, (_, i) => i + 1);
    const { dataset } = parse([{ name: "FEBRERO", nights: 28, dayHeaders, sold: [1, 2, 3] }]);
    expect(dataset.months[1].inputs.sold).toHaveLength(28);
    expect(dataset.warnings).toEqual([]);
  });
});

describe("parseOccupancyWorkbook · hotel y centro de costo", () => {
  it("reads the hotel from the first name line and the cost center from the second", () => {
    const { dataset } = parse([ENERO]);
    expect(dataset.hotelName).toBe("HOTEL A");
    expect(dataset.centerName).toBe("CULTURA MANOR");
    expect(dataset.centerId).toBe("cultura-manor");
  });

  it("falls into `principal` when the file declares no cost center", () => {
    const { dataset } = parse([ENERO], "OCUPACION_2026.xlsx", { hotel: "HOTEL A" });
    expect(dataset.hotelName).toBe("HOTEL A");
    expect(dataset.centerId).toBe(DEFAULT_CENTER_ID);
    // Rotulada with the hotel's own name: there is no sucursal to name it after.
    expect(dataset.centerName).toBe("HOTEL A");
  });

  it("takes the hotel from the file name when the sheet declares none, and warns", () => {
    const { dataset } = parse([ENERO], "OCUPACION_CULTURA_MANOR_2026.xlsx", {});
    expect(dataset.hotelName).toBe("CULTURA MANOR");
    expect(dataset.centerId).toBe(DEFAULT_CENTER_ID);
    expect(dataset.warnings.join(" ")).toMatch(/hotel.*nombre del archivo/i);
  });

  it("gives the same id to the same sucursal written differently", () => {
    const a = parse([ENERO], "a.xlsx", { hotel: "HOTEL A", center: "Cultura Mánor" });
    const b = parse([ENERO], "b.xlsx", { hotel: "HOTEL A", center: "  CULTURA  MANOR " });
    expect(a.dataset.centerId).toBe(b.dataset.centerId);
    // The display name is kept as written; only the identity is normalised.
    expect(a.dataset.centerName).toBe("Cultura Mánor");
  });

  it("never lets a file claim the reserved consolidated id", () => {
    const { dataset } = parse([ENERO], "c.xlsx", { hotel: "HOTEL A", center: "Consolidado" });
    expect(dataset.centerId).not.toBe(CONSOLIDATED_CENTER_ID);
    expect(dataset.warnings.join(" ")).toMatch(/consolidado/i);
  });
});
