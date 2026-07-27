import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import {
  addChannel,
  addYear,
  centersOf,
  db,
  deleteCenter,
  deleteYear,
  getMeta,
  listDatasets,
  mergeParsedDataset,
  removeChannel,
  renameChannel,
  replaceAll,
  saveActiveView,
  saveCell,
  saveNights,
} from "./db";
import { emptyDataset, emptyMonth } from "./derive";
import { DEFAULT_CENTER_ID, type OccupancyDataset, type OccupancyParseResult } from "./types";

/** Most cases only care about one sucursal; `principal` is the one a file without it lands in. */
const key = (year: number, centerId: string = DEFAULT_CENTER_ID) => ({ centerId, year });
const record = (year = 2026, centerId: string = DEFAULT_CENTER_ID) =>
  db.datasets.get([centerId, year]);
const activeView = async () => {
  const meta = await getMeta();
  return meta && { centerId: meta.activeCenterId, year: meta.activeYear };
};

/** A parse result for `year` carrying only the given months, each with sold[0] = marker. */
function parsed(
  year: number,
  months: number[],
  marker: number,
  center?: { id: string; name: string },
  hotelName = "CULTURA MANOR",
): OccupancyParseResult {
  const built: OccupancyDataset = emptyDataset(year, hotelName, center);
  built.channels = [{ id: "booking", name: "Booking" }];
  for (const index of months) {
    const month = emptyMonth(index, built.months[index].days, built.channels);
    month.fromFile = true;
    month.inputs.sold[0] = marker;
    month.inputs.channels.booking[0] = marker;
    built.months[index] = month;
  }
  return { dataset: built, parsedMonths: months };
}

beforeEach(async () => {
  await db.datasets.clear();
  await db.meta.clear();
});

describe("addYear / deleteYear", () => {
  it("creates a blank year and makes it active", async () => {
    await addYear(key(2026), "CULTURA MANOR");
    const years = await listDatasets();
    expect(years.map((y) => y.year)).toEqual([2026]);
    expect(years[0].months).toHaveLength(12);
    expect(await activeView()).toEqual(key(2026));
  });

  it("seeds a first blank year with the default channels in every month", async () => {
    await addYear(key(2026), "CULTURA MANOR");
    const created = await record(2026);
    expect(created?.channels.map((c) => c.name)).toEqual([
      "Booking",
      "Página web",
      "Agencias de viajes",
      "Walk in",
      "Complementarias",
    ]);
    // Present in every month, sized to that month's days, so there is somewhere to type.
    expect(created?.months.every((m) => Object.keys(m.inputs.channels).length === 5)).toBe(true);
    expect(created?.months[1].inputs.channels.booking).toHaveLength(28);
  });

  it("inherits the channel catalogue of the most recent year", async () => {
    await mergeParsedDataset(parsed(2026, [0], 1));
    await addChannel(key(2026), 0, "Walk in");
    await addYear(key(2027));

    const created = await record(2027);
    // 2026's whole catalogue — the file's, the seeded defaults and the user's — carries into 2027.
    expect(created?.channels.map((c) => c.name)).toEqual(
      expect.arrayContaining(["Booking", "Walk in"]),
    );
    // And the inherited channels are addressable in every month.
    expect(created?.months[5].inputs.channels).toHaveProperty("walk-in");
  });

  it("keeps years sorted ascending regardless of insertion order", async () => {
    await addYear(key(2027));
    await addYear(key(2025));
    expect((await listDatasets()).map((y) => y.year)).toEqual([2025, 2027]);
  });

  it("moves the active year to a surviving one when the active year is deleted", async () => {
    await addYear(key(2025));
    await addYear(key(2026));
    await saveActiveView(key(2026));

    await deleteYear(key(2026));
    expect((await listDatasets()).map((y) => y.year)).toEqual([2025]);
    expect(await activeView()).toEqual(key(2025));
  });

  it("leaves no active year once the last one is deleted", async () => {
    await addYear(key(2026));
    await deleteYear(key(2026));
    expect(await activeView()).toBeUndefined();
  });
});

describe("mergeParsedDataset", () => {
  it("inserts a year that does not exist yet", async () => {
    await mergeParsedDataset(parsed(2026, [0, 1], 7));
    const stored = await record(2026);
    expect(stored?.months[0].inputs.sold[0]).toBe(7);
    expect(stored?.months[1].fromFile).toBe(true);
  });

  it("replaces only the months the file provides", async () => {
    await mergeParsedDataset(parsed(2026, [0, 1], 7));
    await saveCell(key(2026), 7, "sold", 0, 42); // Agosto, typed by hand

    await mergeParsedDataset(parsed(2026, [0], 9));

    const stored = await record(2026);
    expect(stored?.months[0].inputs.sold[0]).toBe(9); // replaced
    expect(stored?.months[1].inputs.sold[0]).toBe(7); // untouched by the second file
    expect(stored?.months[7].inputs.sold[0]).toBe(42); // hand-entered month survives
  });

  it("appends the file's new channels without dropping the user's own", async () => {
    await mergeParsedDataset(parsed(2026, [0], 1));
    await addChannel(key(2026), 0, "Mostrador");

    const incoming = parsed(2026, [1], 2);
    incoming.dataset.channels = [
      { id: "booking", name: "Booking" },
      { id: "airbnb", name: "AirBnB" },
    ];
    incoming.dataset.months[1].inputs.channels.airbnb = new Array(28).fill(0);
    await mergeParsedDataset(incoming);

    const stored = await record(2026);
    // The user's channels and the file's survive, alongside the seeded defaults.
    expect(stored?.channels.map((c) => c.name)).toEqual(
      expect.arrayContaining(["Booking", "Mostrador", "AirBnB"]),
    );
    // Membership stays per month: February gets the file's channels, January keeps its own.
    expect(Object.keys(stored?.months[1].inputs.channels ?? {}).sort()).toEqual([
      "airbnb",
      "booking",
    ]);
    expect(Object.keys(stored?.months[0].inputs.channels ?? {}).sort()).toEqual([
      "booking",
      "mostrador",
    ]);
  });

  it("seeds the default channels into the months a workbook left empty", async () => {
    // The file brings January; August–December arrive with no channel rows at all.
    await mergeParsedDataset(parsed(2026, [0], 1));
    const stored = await record(2026);

    // January keeps exactly what the file had — no defaults forced onto it.
    expect(Object.keys(stored?.months[0].inputs.channels ?? {})).toEqual(["booking"]);
    // An empty month is filled so the table is not blank.
    expect(Object.keys(stored?.months[7].inputs.channels ?? {}).sort()).toEqual([
      "agencias-de-viajes",
      "booking",
      "complementarias",
      "pagina-web",
      "walk-in",
    ]);
    // The seeded names are addressable in the catalogue, so the grid can show them.
    expect(stored?.channels.map((c) => c.name)).toEqual(
      expect.arrayContaining(["Página web", "Walk in"]),
    );
  });

  it("does not re-seed a month the user emptied on purpose", async () => {
    await mergeParsedDataset(parsed(2026, [0], 1)); // seeds Aug–Dec
    await removeChannel(key(2026), 7, "booking");
    await removeChannel(key(2026), 7, "pagina-web");
    await removeChannel(key(2026), 7, "agencias-de-viajes");
    await removeChannel(key(2026), 7, "walk-in");
    await removeChannel(key(2026), 7, "complementarias"); // August now deliberately empty
    await mergeParsedDataset(parsed(2026, [2], 3)); // re-import, does not touch August

    const stored = await record(2026);
    expect(Object.keys(stored?.months[7].inputs.channels ?? {})).toEqual([]);
  });

  it("keeps the user's channel name when the file spells it differently", async () => {
    await mergeParsedDataset(parsed(2026, [0], 1));
    await renameChannel(key(2026), "booking", "Booking.com");
    await mergeParsedDataset(parsed(2026, [1], 2));

    const stored = await record(2026);
    // The rename survives the re-import; the default-seeded channels sit alongside it.
    expect(stored?.channels).toEqual(
      expect.arrayContaining([{ id: "booking", name: "Booking.com" }]),
    );
    expect(stored?.channels.find((c) => c.id === "booking")?.name).toBe("Booking.com");
  });
});

/** A year with the default channels stripped, so channel cases start from a clean slate. */
async function blankYear(year: number, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  await addYear(key(year, centerId), "CULTURA MANOR");
  const blank = await record(year, centerId);
  if (blank) {
    blank.channels = [];
    blank.months = blank.months.map((m) => ({
      ...m,
      inputs: { ...m.inputs, channels: {} },
    }));
    await db.datasets.put(blank);
  }
}

describe("saveCell / saveNights", () => {
  beforeEach(async () => {
    await blankYear(2026);
  });

  it("writes a metric cell", async () => {
    await saveCell(key(2026), 0, "sold", 3, 12);
    expect((await record(2026))?.months[0].inputs.sold[3]).toBe(12);
  });

  it("writes a room-type cell", async () => {
    await saveCell(key(2026), 0, "dobles", 1, 4);
    expect((await record(2026))?.months[0].inputs.rooms.dobles[1]).toBe(4);
  });

  it("writes a channel cell through its prefixed row id", async () => {
    await addChannel(key(2026), 0, "Booking");
    await saveCell(key(2026), 0, "channel:booking", 2, 5);
    expect((await record(2026))?.months[0].inputs.channels.booking[2]).toBe(5);
  });

  it("stores a PAX value that the room types cannot produce", async () => {
    await saveCell(key(2026), 0, "dobles", 0, 4); // 4 doubles = 8 guests
    await saveCell(key(2026), 0, "pax", 0, 9); // an extra bed
    expect((await record(2026))?.months[0].inputs.pax[0]).toBe(9);
  });

  it("clears the PAX override when the typed value matches the room types again", async () => {
    await saveCell(key(2026), 0, "dobles", 0, 4);
    await saveCell(key(2026), 0, "pax", 0, 9);
    await saveCell(key(2026), 0, "pax", 0, 8);
    // null, not 8: the row goes back to tracking the room types instead of freezing.
    expect((await record(2026))?.months[0].inputs.pax[0]).toBeNull();
  });

  it("ignores a derived row id instead of inventing a place to store it", async () => {
    await saveCell(key(2026), 0, "adr", 0, 999);
    const stored = await record(2026);
    expect(stored?.months[0].inputs).not.toHaveProperty("adr");
    expect(stored?.months[0].inputs.sold[0]).toBe(0);
  });

  it("ignores a day index outside the month", async () => {
    await saveCell(key(2026), 1, "sold", 28, 5); // February 2026 has 28 days (0–27)
    expect((await record(2026))?.months[1].inputs.sold).toHaveLength(28);
  });

  it("marks the month as edited on the first cell write", async () => {
    expect((await record(2026))?.months[0].edited).toBe(false);
    await saveCell(key(2026), 0, "sold", 0, 3);
    const stored = await record(2026);
    expect(stored?.months[0].edited).toBe(true);
    // Only that month: the rest keep showing their file verbatim.
    expect(stored?.months[1].edited).toBe(false);
  });

  it("marks the month as edited when a channel row is added or removed", async () => {
    await addChannel(key(2026), 3, "Booking");
    expect((await record(2026))?.months[3].edited).toBe(true);
  });

  it("does not count the declared nights as an edit", async () => {
    // It is a note about the month, not an input any figure is computed from.
    await saveNights(key(2026), 0, 25);
    expect((await record(2026))?.months[0].edited).toBe(false);
  });

  it("stores the declared nights", async () => {
    await saveNights(key(2026), 0, 25);
    expect((await record(2026))?.months[0].nights).toBe(25);
  });
});

describe("catálogo de canales", () => {
  beforeEach(async () => {
    await blankYear(2026);
  });

  it("adds a channel to the given month only, sized to that month's days", async () => {
    await addChannel(key(2026), 1, "Página web");
    const stored = await record(2026);
    expect(stored?.channels).toEqual([{ id: "pagina-web", name: "Página web" }]);
    expect(stored?.months[1].inputs.channels["pagina-web"]).toHaveLength(28);
    expect(stored?.months[0].inputs.channels).not.toHaveProperty("pagina-web");
  });

  it("does not duplicate a channel whose name already exists in that month", async () => {
    await addChannel(key(2026), 0, "Booking");
    await addChannel(key(2026), 0, "  booking ");
    const stored = await record(2026);
    expect(stored?.channels).toHaveLength(1);
    expect(Object.keys(stored?.months[0].inputs.channels ?? {})).toEqual(["booking"]);
  });

  it("reuses the catalogue entry when the same channel is added to another month", async () => {
    await addChannel(key(2026), 0, "Booking");
    await addChannel(key(2026), 5, "Booking");
    const stored = await record(2026);
    expect(stored?.channels).toHaveLength(1);
    expect(stored?.months[5].inputs.channels).toHaveProperty("booking");
  });

  it("renames a channel without touching its id or its data", async () => {
    await addChannel(key(2026), 0, "Booking");
    await saveCell(key(2026), 0, "channel:booking", 0, 8);
    await renameChannel(key(2026), "booking", "Booking.com");

    const stored = await record(2026);
    expect(stored?.channels).toEqual([{ id: "booking", name: "Booking.com" }]);
    expect(stored?.months[0].inputs.channels.booking[0]).toBe(8);
  });

  it("removes a channel from one month and leaves the other months alone", async () => {
    await addChannel(key(2026), 0, "Booking");
    await addChannel(key(2026), 1, "Booking");
    await saveCell(key(2026), 1, "channel:booking", 0, 8);

    await removeChannel(key(2026), 0, "booking");

    const stored = await record(2026);
    expect(stored?.months[0].inputs.channels).not.toHaveProperty("booking");
    expect(stored?.months[1].inputs.channels.booking[0]).toBe(8);
    // Still used by February, so it stays in the catalogue.
    expect(stored?.channels).toEqual([{ id: "booking", name: "Booking" }]);
  });

  it("drops the channel from the catalogue once no month uses it", async () => {
    await addChannel(key(2026), 0, "Booking");
    await removeChannel(key(2026), 0, "booking");
    expect((await record(2026))?.channels).toEqual([]);
  });
});

describe("sucursales", () => {
  const NORTE = { id: "norte", name: "Sucursal Norte" };
  const MANOR = { id: "cultura-manor", name: "Cultura Manor" };

  it("keeps two sucursales of the same year apart", async () => {
    await mergeParsedDataset(parsed(2026, [0], 7, MANOR));
    await mergeParsedDataset(parsed(2026, [0], 9, NORTE));

    expect((await record(2026, MANOR.id))?.months[0].inputs.sold[0]).toBe(7);
    expect((await record(2026, NORTE.id))?.months[0].inputs.sold[0]).toBe(9);
  });

  it("edits one sucursal without touching the other", async () => {
    await mergeParsedDataset(parsed(2026, [0], 7, MANOR));
    await mergeParsedDataset(parsed(2026, [0], 7, NORTE));

    await saveCell(key(2026, MANOR.id), 0, "sold", 0, 42);

    expect((await record(2026, MANOR.id))?.months[0].inputs.sold[0]).toBe(42);
    expect((await record(2026, NORTE.id))?.months[0].inputs.sold[0]).toBe(7);
  });

  it("merges a second file of the same sucursal-year month by month", async () => {
    await mergeParsedDataset(parsed(2026, [0, 1], 7, MANOR));
    await mergeParsedDataset(parsed(2026, [0], 9, MANOR));

    const stored = await record(2026, MANOR.id);
    expect(stored?.months[0].inputs.sold[0]).toBe(9);
    expect(stored?.months[1].inputs.sold[0]).toBe(7);
  });

  it("lists the sucursales present, alphabetically", async () => {
    await mergeParsedDataset(parsed(2026, [0], 1, NORTE));
    await mergeParsedDataset(parsed(2025, [0], 1, MANOR));
    await mergeParsedDataset(parsed(2026, [0], 1, MANOR));

    expect(centersOf(await listDatasets())).toEqual([MANOR, NORTE]);
  });

  it("deletes a sucursal with every year it held", async () => {
    await mergeParsedDataset(parsed(2025, [0], 1, MANOR));
    await mergeParsedDataset(parsed(2026, [0], 1, MANOR));
    await mergeParsedDataset(parsed(2026, [0], 1, NORTE));

    await deleteCenter(MANOR.id);

    expect((await listDatasets()).map((d) => [d.centerId, d.year])).toEqual([[NORTE.id, 2026]]);
    expect(await activeView()).toEqual(key(2026, NORTE.id));
  });

  it("stays in the same sucursal when the deleted year has a sibling", async () => {
    await mergeParsedDataset(parsed(2025, [0], 1, MANOR));
    await mergeParsedDataset(parsed(2026, [0], 1, MANOR));
    await mergeParsedDataset(parsed(2026, [0], 1, NORTE));
    await saveActiveView(key(2026, MANOR.id));

    await deleteYear(key(2026, MANOR.id));

    // 2025 of the same sucursal, not another sucursal's 2026.
    expect(await activeView()).toEqual(key(2025, MANOR.id));
  });
});

describe("replaceAll", () => {
  it("clears the previous hotel before writing the new one", async () => {
    await mergeParsedDataset(parsed(2026, [0], 1, { id: "vieja", name: "Vieja" }));

    await replaceAll([parsed(2026, [0], 5, { id: "nueva", name: "Nueva" }, "HOTEL B")], "HOTEL B");

    const datasets = await listDatasets();
    expect(datasets.map((d) => d.centerId)).toEqual(["nueva"]);
    expect(datasets[0].hotelName).toBe("HOTEL B");
    expect((await getMeta())?.hotelName).toBe("HOTEL B");
  });

  it("stamps the given hotel on every file it writes", async () => {
    await replaceAll(
      [
        parsed(2026, [0], 1, { id: "a", name: "A" }, "HOTEL B"),
        parsed(2026, [0], 1, { id: "b", name: "B" }, "HOTEL B"),
      ],
      "HOTEL B",
    );
    expect((await listDatasets()).map((d) => d.hotelName)).toEqual(["HOTEL B", "HOTEL B"]);
  });
});

describe("migración v1 → v2", () => {
  it("moves the year-keyed records into `principal` without losing anything", async () => {
    db.close();
    await Dexie.delete("liderboard-occupancy");

    const legacy = new Dexie("liderboard-occupancy");
    legacy.version(1).stores({ years: "year", meta: "key" });
    await legacy.open();
    const before = emptyDataset(2025, "HOTEL A");
    before.channels = [{ id: "booking", name: "Booking" }];
    before.warnings = ["un aviso de lectura"];
    before.months[0].inputs.sold[0] = 5;
    before.months[0].fromFile = true;
    // A true v1 record: the sucursal fields did not exist yet.
    const { centerId: _id, centerName: _name, ...v1 } = before;
    await legacy.table("years").put(v1);
    await legacy.table("meta").put({ key: "workspace", activeYear: 2025 });
    legacy.close();

    await db.open();

    const migrated = await record(2025);
    expect(migrated?.centerId).toBe(DEFAULT_CENTER_ID);
    expect(migrated?.centerName).toBe("HOTEL A");
    expect(migrated?.months[0].inputs.sold[0]).toBe(5);
    expect(migrated?.months[0].fromFile).toBe(true);
    expect(migrated?.channels).toEqual([{ id: "booking", name: "Booking" }]);
    expect(migrated?.warnings).toEqual(["un aviso de lectura"]);
    expect(await getMeta()).toMatchObject({
      hotelName: "HOTEL A",
      activeCenterId: DEFAULT_CENTER_ID,
      activeYear: 2025,
    });
    // The old table is gone once nothing reads from it.
    expect(db.tables.map((t) => t.name)).not.toContain("years");
  });
});
