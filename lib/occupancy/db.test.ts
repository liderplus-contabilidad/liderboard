import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import {
  addChannel,
  addYear,
  centersOf,
  createHotel,
  db,
  deleteCenter,
  deleteHotel,
  deleteYear,
  describeHotelContents,
  getActiveHotelId,
  getHotel,
  listDatasets,
  listHotels,
  listHotelSummaries,
  mergeParsedDataset,
  removeChannel,
  renameChannel,
  updateHotel,
  replaceHotel,
  saveActiveView,
  saveCell,
  saveNights,
  setActiveHotel,
} from "./db";
import { emptyDataset, emptyMonth } from "./derive";
import { DEFAULT_CENTER_ID, type OccupancyDataset, type OccupancyParseResult } from "./types";

/** The hotel every scoped case runs inside; a second one appears only where isolation is the point. */
let hotelId = "";

/** Most cases only care about one sucursal; `principal` is the one a file without it lands in. */
const key = (year: number, centerId: string = DEFAULT_CENTER_ID, hotel = hotelId) => ({
  hotelId: hotel,
  centerId,
  year,
});
const record = (year = 2026, centerId: string = DEFAULT_CENTER_ID, hotel = hotelId) =>
  db.centerYears.get([hotel, centerId, year]);
const activeView = async (hotel = hotelId) => {
  const stored = await getHotel(hotel);
  return stored?.activeCenterId !== undefined && stored.activeYear !== undefined
    ? { hotelId: hotel, centerId: stored.activeCenterId, year: stored.activeYear }
    : undefined;
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
  await db.centerYears.clear();
  await db.hotels.clear();
  await db.active.clear();
  hotelId = (await createHotel("Manor Galápagos")).id;
});

describe("hoteles", () => {
  it("creates an EMPTY hotel and opens it", async () => {
    expect(await listDatasets(hotelId)).toEqual([]);
    expect(await getActiveHotelId()).toBe(hotelId);
  });

  it("un hotel vacío no tiene identidad: adopta en su primera carga", async () => {
    expect((await listHotelSummaries())[0].identity).toBeNull();
    await mergeParsedDataset(hotelId, parsed(2026, [0], 1));
    expect((await listHotelSummaries())[0].identity).toEqual({ hotelName: "CULTURA MANOR" });
  });

  it("lists hotels by name, and renaming reorders", async () => {
    await createHotel("Ambato Centro");
    expect((await listHotels()).map((h) => h.name)).toEqual(["Ambato Centro", "Manor Galápagos"]);

    await updateHotel(hotelId, "Alfa", null, undefined);
    expect((await listHotels()).map((h) => h.name)).toEqual(["Alfa", "Ambato Centro"]);
  });

  it("renaming touches the label and nothing else", async () => {
    await mergeParsedDataset(hotelId, parsed(2026, [0], 7));
    await updateHotel(hotelId, "Otro nombre", null, undefined);
    const summaries = await listHotelSummaries();
    expect(summaries[0].name).toBe("Otro nombre");
    // The identity is derived from the data, so the label cannot move it.
    expect(summaries[0].identity).toEqual({ hotelName: "CULTURA MANOR" });
  });

  it("summarizes what each hotel holds, for the selector's subline", async () => {
    await mergeParsedDataset(hotelId, parsed(2025, [0], 1, { id: "norte", name: "Norte" }));
    await mergeParsedDataset(hotelId, parsed(2026, [0], 1, { id: "norte", name: "Norte" }));
    await mergeParsedDataset(hotelId, parsed(2026, [0], 1, { id: "sur", name: "Sur" }));

    const summary = (await listHotelSummaries()).find((h) => h.id === hotelId);
    expect(summary?.years).toEqual([2025, 2026]);
    // Counted across years: the same sucursal in 2025 and 2026 is one sucursal.
    expect(summary?.centers).toBe(2);
  });

  it("counts what deleting a hotel discards", async () => {
    await mergeParsedDataset(hotelId, parsed(2026, [0, 1], 7, { id: "norte", name: "Norte" }));
    await mergeParsedDataset(hotelId, parsed(2026, [0], 7, { id: "sur", name: "Sur" }));

    expect(await describeHotelContents(hotelId)).toEqual({
      centers: 2,
      years: [2026],
      // Two months of Norte with sales plus one of Sur.
      monthsWithData: 3,
    });
  });
});

describe("aislamiento entre hoteles", () => {
  let other = "";

  beforeEach(async () => {
    other = (await createHotel("Ambato Centro")).id;
    await setActiveHotel(hotelId);
  });

  it("keeps the same sucursal-year of two hotels apart", async () => {
    await mergeParsedDataset(hotelId, parsed(2026, [0], 7));
    await mergeParsedDataset(other, parsed(2026, [0], 9, undefined, "HOTEL AMBATO"));

    expect((await record(2026, DEFAULT_CENTER_ID, hotelId))?.months[0].inputs.sold[0]).toBe(7);
    expect((await record(2026, DEFAULT_CENTER_ID, other))?.months[0].inputs.sold[0]).toBe(9);
  });

  it("edits one hotel without touching the other", async () => {
    await mergeParsedDataset(hotelId, parsed(2026, [0], 7));
    await mergeParsedDataset(other, parsed(2026, [0], 7, undefined, "HOTEL AMBATO"));

    await saveCell(key(2026), 0, "sold", 0, 42);

    expect((await record(2026, DEFAULT_CENTER_ID, hotelId))?.months[0].inputs.sold[0]).toBe(42);
    expect((await record(2026, DEFAULT_CENTER_ID, other))?.months[0].inputs.sold[0]).toBe(7);
  });

  it("lists only the open hotel's records, so no read can mix two companies", async () => {
    await mergeParsedDataset(hotelId, parsed(2026, [0], 1, { id: "norte", name: "Norte" }));
    await mergeParsedDataset(other, parsed(2026, [0], 1, { id: "sur", name: "Sur" }, "HOTEL B"));

    expect(centersOf(await listDatasets(hotelId))).toEqual([{ id: "norte", name: "Norte" }]);
    expect(centersOf(await listDatasets(other))).toEqual([{ id: "sur", name: "Sur" }]);
  });

  it("each hotel remembers its own open sucursal-año", async () => {
    await mergeParsedDataset(hotelId, parsed(2025, [0], 1));
    await mergeParsedDataset(other, parsed(2026, [0], 1, undefined, "HOTEL B"));

    expect(await activeView(hotelId)).toEqual(key(2025, DEFAULT_CENTER_ID, hotelId));
    expect(await activeView(other)).toEqual(key(2026, DEFAULT_CENTER_ID, other));
  });

  it("deleting a hotel takes its records and leaves the others intact", async () => {
    await mergeParsedDataset(hotelId, parsed(2025, [0], 1));
    await mergeParsedDataset(hotelId, parsed(2026, [0], 1, { id: "norte", name: "Norte" }));
    await mergeParsedDataset(other, parsed(2026, [0], 5, undefined, "HOTEL B"));

    await deleteHotel(hotelId);

    expect(await db.centerYears.where("hotelId").equals(hotelId).count()).toBe(0);
    expect((await listDatasets(other)).map((d) => d.year)).toEqual([2026]);
    // The open hotel was deleted, so the module falls back to the first remaining one BY NAME.
    expect(await getActiveHotelId()).toBe(other);
  });

  it("leaves no active hotel once the last one is deleted", async () => {
    await deleteHotel(other);
    await deleteHotel(hotelId);
    expect(await getActiveHotelId()).toBeNull();
    expect(await listHotels()).toEqual([]);
  });

  it("replaceHotel replaces ONE hotel and no other", async () => {
    await mergeParsedDataset(hotelId, parsed(2026, [0], 1, { id: "vieja", name: "Vieja" }));
    await mergeParsedDataset(other, parsed(2026, [0], 5, undefined, "HOTEL B"));

    await replaceHotel(hotelId, [
      parsed(2026, [0], 9, { id: "nueva", name: "Nueva" }, "CULTURA MANOR SA"),
    ]);

    const replaced = await listDatasets(hotelId);
    expect(replaced.map((d) => d.centerId)).toEqual(["nueva"]);
    expect(replaced[0].hotelName).toBe("CULTURA MANOR SA");
    expect((await listDatasets(other)).map((d) => d.centerId)).toEqual([DEFAULT_CENTER_ID]);
  });
});

describe("addYear / deleteYear", () => {
  it("creates a blank year and makes it active", async () => {
    await addYear(key(2026));
    const years = await listDatasets(hotelId);
    expect(years.map((y) => y.year)).toEqual([2026]);
    expect(years[0].months).toHaveLength(12);
    expect(await activeView()).toEqual(key(2026));
  });

  it("un año escrito a mano no le inventa identidad al hotel", async () => {
    await addYear(key(2026));
    // The label is not the identity: adopting it here would make the next upload clash with a name
    // the user made up.
    expect((await record(2026))?.hotelName).toBe("");
    expect((await listHotelSummaries())[0].identity).toBeNull();
    // Display still needs a name for `principal`, and the label is the only one there is.
    expect((await record(2026))?.centerName).toBe("Manor Galápagos");
  });

  it("un año nuevo hereda el nombre declarado por sus hermanos", async () => {
    await mergeParsedDataset(hotelId, parsed(2026, [0], 1));
    await addYear(key(2027));
    expect((await record(2027))?.hotelName).toBe("CULTURA MANOR");
  });

  it("seeds a first blank year with the default channels in every month", async () => {
    await addYear(key(2026));
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
    await mergeParsedDataset(hotelId, parsed(2026, [0], 1));
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

  it("does not inherit a channel catalogue across hotels", async () => {
    const other = (await createHotel("Ambato Centro")).id;
    await mergeParsedDataset(hotelId, parsed(2026, [0], 1));
    await addChannel(key(2026), 0, "Mostrador");

    await addYear(key(2026, DEFAULT_CENTER_ID, other));

    expect(
      (await record(2026, DEFAULT_CENTER_ID, other))?.channels.map((c) => c.name),
    ).not.toContain("Mostrador");
  });

  it("keeps years sorted ascending regardless of insertion order", async () => {
    await addYear(key(2027));
    await addYear(key(2025));
    expect((await listDatasets(hotelId)).map((y) => y.year)).toEqual([2025, 2027]);
  });

  it("moves the active year to a surviving one when the active year is deleted", async () => {
    await addYear(key(2025));
    await addYear(key(2026));
    await saveActiveView(key(2026));

    await deleteYear(key(2026));
    expect((await listDatasets(hotelId)).map((y) => y.year)).toEqual([2025]);
    expect(await activeView()).toEqual(key(2025));
  });

  it("leaves no active year once the last one is deleted, and the hotel stays", async () => {
    await addYear(key(2026));
    await deleteYear(key(2026));
    expect(await activeView()).toBeUndefined();
    // The hotel is the user's label, not a byproduct of its data: it survives with no identity.
    expect((await listHotels()).map((h) => h.id)).toEqual([hotelId]);
    expect((await listHotelSummaries())[0].identity).toBeNull();
  });
});

describe("mergeParsedDataset", () => {
  it("inserts a year that does not exist yet", async () => {
    await mergeParsedDataset(hotelId, parsed(2026, [0, 1], 7));
    const stored = await record(2026);
    expect(stored?.months[0].inputs.sold[0]).toBe(7);
    expect(stored?.months[1].fromFile).toBe(true);
  });

  it("stamps the open hotel on what the pure layer produced", async () => {
    await mergeParsedDataset(hotelId, parsed(2026, [0], 7));
    expect((await record(2026))?.hotelId).toBe(hotelId);
  });

  it("replaces only the months the file provides", async () => {
    await mergeParsedDataset(hotelId, parsed(2026, [0, 1], 7));
    await saveCell(key(2026), 7, "sold", 0, 42); // Agosto, typed by hand

    await mergeParsedDataset(hotelId, parsed(2026, [0], 9));

    const stored = await record(2026);
    expect(stored?.months[0].inputs.sold[0]).toBe(9); // replaced
    expect(stored?.months[1].inputs.sold[0]).toBe(7); // untouched by the second file
    expect(stored?.months[7].inputs.sold[0]).toBe(42); // hand-entered month survives
  });

  it("appends the file's new channels without dropping the user's own", async () => {
    await mergeParsedDataset(hotelId, parsed(2026, [0], 1));
    await addChannel(key(2026), 0, "Mostrador");

    const incoming = parsed(2026, [1], 2);
    incoming.dataset.channels = [
      { id: "booking", name: "Booking" },
      { id: "airbnb", name: "AirBnB" },
    ];
    incoming.dataset.months[1].inputs.channels.airbnb = new Array(28).fill(0);
    await mergeParsedDataset(hotelId, incoming);

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
    await mergeParsedDataset(hotelId, parsed(2026, [0], 1));
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
    await mergeParsedDataset(hotelId, parsed(2026, [0], 1)); // seeds Aug–Dec
    await removeChannel(key(2026), 7, "booking");
    await removeChannel(key(2026), 7, "pagina-web");
    await removeChannel(key(2026), 7, "agencias-de-viajes");
    await removeChannel(key(2026), 7, "walk-in");
    await removeChannel(key(2026), 7, "complementarias"); // August now deliberately empty
    await mergeParsedDataset(hotelId, parsed(2026, [2], 3)); // re-import, does not touch August

    const stored = await record(2026);
    expect(Object.keys(stored?.months[7].inputs.channels ?? {})).toEqual([]);
  });

  it("keeps the user's channel name when the file spells it differently", async () => {
    await mergeParsedDataset(hotelId, parsed(2026, [0], 1));
    await renameChannel(key(2026), "booking", "Booking.com");
    await mergeParsedDataset(hotelId, parsed(2026, [1], 2));

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
  await addYear(key(year, centerId));
  const blank = await record(year, centerId);
  if (blank) {
    blank.channels = [];
    blank.months = blank.months.map((m) => ({
      ...m,
      inputs: { ...m.inputs, channels: {} },
    }));
    await db.centerYears.put(blank);
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

  it("ignores a hotel that does not hold that record", async () => {
    const other = (await createHotel("Ambato Centro")).id;
    await saveCell(key(2026, DEFAULT_CENTER_ID, other), 0, "sold", 0, 99);
    expect((await record(2026))?.months[0].inputs.sold[0]).toBe(0);
    expect(await record(2026, DEFAULT_CENTER_ID, other)).toBeUndefined();
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
    await mergeParsedDataset(hotelId, parsed(2026, [0], 7, MANOR));
    await mergeParsedDataset(hotelId, parsed(2026, [0], 9, NORTE));

    expect((await record(2026, MANOR.id))?.months[0].inputs.sold[0]).toBe(7);
    expect((await record(2026, NORTE.id))?.months[0].inputs.sold[0]).toBe(9);
  });

  it("edits one sucursal without touching the other", async () => {
    await mergeParsedDataset(hotelId, parsed(2026, [0], 7, MANOR));
    await mergeParsedDataset(hotelId, parsed(2026, [0], 7, NORTE));

    await saveCell(key(2026, MANOR.id), 0, "sold", 0, 42);

    expect((await record(2026, MANOR.id))?.months[0].inputs.sold[0]).toBe(42);
    expect((await record(2026, NORTE.id))?.months[0].inputs.sold[0]).toBe(7);
  });

  it("merges a second file of the same sucursal-year month by month", async () => {
    await mergeParsedDataset(hotelId, parsed(2026, [0, 1], 7, MANOR));
    await mergeParsedDataset(hotelId, parsed(2026, [0], 9, MANOR));

    const stored = await record(2026, MANOR.id);
    expect(stored?.months[0].inputs.sold[0]).toBe(9);
    expect(stored?.months[1].inputs.sold[0]).toBe(7);
  });

  it("lists the sucursales present, alphabetically", async () => {
    await mergeParsedDataset(hotelId, parsed(2026, [0], 1, NORTE));
    await mergeParsedDataset(hotelId, parsed(2025, [0], 1, MANOR));
    await mergeParsedDataset(hotelId, parsed(2026, [0], 1, MANOR));

    expect(centersOf(await listDatasets(hotelId))).toEqual([MANOR, NORTE]);
  });

  it("deletes a sucursal with every year it held", async () => {
    await mergeParsedDataset(hotelId, parsed(2025, [0], 1, MANOR));
    await mergeParsedDataset(hotelId, parsed(2026, [0], 1, MANOR));
    await mergeParsedDataset(hotelId, parsed(2026, [0], 1, NORTE));

    await deleteCenter(hotelId, MANOR.id);

    expect((await listDatasets(hotelId)).map((d) => [d.centerId, d.year])).toEqual([
      [NORTE.id, 2026],
    ]);
    expect(await activeView()).toEqual(key(2026, NORTE.id));
  });

  it("deleting a sucursal does not touch the same sucursal of another hotel", async () => {
    const other = (await createHotel("Ambato Centro")).id;
    await mergeParsedDataset(hotelId, parsed(2026, [0], 1, MANOR));
    await mergeParsedDataset(other, parsed(2026, [0], 5, MANOR, "HOTEL B"));

    await deleteCenter(hotelId, MANOR.id);

    expect(await listDatasets(hotelId)).toEqual([]);
    expect((await record(2026, MANOR.id, other))?.months[0].inputs.sold[0]).toBe(5);
  });

  it("stays in the same sucursal when the deleted year has a sibling", async () => {
    await mergeParsedDataset(hotelId, parsed(2025, [0], 1, MANOR));
    await mergeParsedDataset(hotelId, parsed(2026, [0], 1, MANOR));
    await mergeParsedDataset(hotelId, parsed(2026, [0], 1, NORTE));
    await saveActiveView(key(2026, MANOR.id));

    await deleteYear(key(2026, MANOR.id));

    // 2025 of the same sucursal, not another sucursal's 2026.
    expect(await activeView()).toEqual(key(2025, MANOR.id));
  });
});

describe("migración v1 → v5", () => {
  it("moves the year-keyed records into `principal` and into the first hotel", async () => {
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

    const [hotel] = await listHotels();
    // The declared hotel name is the only name the module ever knew for this data.
    expect(hotel.name).toBe("HOTEL A");
    expect(await getActiveHotelId()).toBe(hotel.id);

    const migrated = await record(2025, DEFAULT_CENTER_ID, hotel.id);
    expect(migrated?.hotelId).toBe(hotel.id);
    expect(migrated?.centerId).toBe(DEFAULT_CENTER_ID);
    expect(migrated?.centerName).toBe("HOTEL A");
    expect(migrated?.months[0].inputs.sold[0]).toBe(5);
    expect(migrated?.months[0].fromFile).toBe(true);
    expect(migrated?.channels).toEqual([{ id: "booking", name: "Booking" }]);
    expect(migrated?.warnings).toEqual(["un aviso de lectura"]);
    // The open view moves onto the hotel, where it belongs.
    expect(hotel.activeCenterId).toBe(DEFAULT_CENTER_ID);
    expect(hotel.activeYear).toBe(2025);
    // The old tables are gone once nothing reads from them.
    expect(db.tables.map((t) => t.name)).not.toContain("years");
    expect(db.tables.map((t) => t.name)).not.toContain("datasets");
    expect(db.tables.map((t) => t.name)).not.toContain("meta");
  });
});

describe("migración v3 → v5", () => {
  /** Opens a v3-shaped database, seeds it, and hands control back to the real `db`. */
  async function seedV3(seed: (legacy: Dexie) => Promise<void>): Promise<void> {
    db.close();
    await Dexie.delete("liderboard-occupancy");
    const legacy = new Dexie("liderboard-occupancy");
    legacy.version(1).stores({ years: "year", meta: "key" });
    legacy.version(2).stores({ datasets: "[centerId+year]" });
    legacy.version(3).stores({ years: null });
    await legacy.open();
    await seed(legacy);
    legacy.close();
    await db.open();
  }

  it("turns the workspace into the first hotel, keeping every sucursal and what was typed", async () => {
    await seedV3(async (legacy) => {
      const norte = emptyDataset(2025, "CULTURA MANOR", { id: "norte", name: "Norte" });
      norte.months[0].inputs.sold[0] = 3;
      norte.months[0].edited = true;
      const sur = emptyDataset(2026, "CULTURA MANOR", { id: "sur", name: "Sur" });
      await legacy.table("datasets").bulkPut([norte, sur]);
      await legacy.table("meta").put({
        key: "workspace",
        hotelName: "CULTURA MANOR",
        activeCenterId: "sur",
        activeYear: 2026,
      });
    });

    const hotels = await listHotels();
    expect(hotels).toHaveLength(1);
    expect(hotels[0].name).toBe("CULTURA MANOR");

    const migrated = await listDatasets(hotels[0].id);
    expect(migrated.map((d) => [d.centerId, d.year])).toEqual([
      ["norte", 2025],
      ["sur", 2026],
    ]);
    // Nothing is discarded — this workspace is the user's only copy of what they typed by hand.
    expect(migrated[0].months[0].inputs.sold[0]).toBe(3);
    expect(migrated[0].months[0].edited).toBe(true);
    expect(hotels[0].activeCenterId).toBe("sur");
    expect(hotels[0].activeYear).toBe(2026);
  });

  it("names the hotel «Hotel 1» when the workspace never recorded one", async () => {
    await seedV3(async (legacy) => {
      const dataset = emptyDataset(2025, "");
      await legacy.table("datasets").put(dataset);
    });
    expect((await listHotels()).map((h) => h.name)).toEqual(["Hotel 1"]);
  });

  it("una base que nunca cargó nada no recibe ningún hotel", async () => {
    await seedV3(async () => {});
    expect(await listHotels()).toEqual([]);
    expect(await getActiveHotelId()).toBeNull();
  });
});
