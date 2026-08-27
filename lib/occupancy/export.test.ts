import { describe, expect, it } from "vitest";
import { toOccupancyGrid } from "./derive";
import { buildOccupancyWorkbook, occupancyExportFilename } from "./export";
import { parseOccupancyWorkbook } from "./parse";
import { aoaToXlsxBuffer, monthBlock, occupancySheet, type SheetSpec } from "./parse.fixtures";
import { DEFAULT_CENTER_ID, type OccupancyDataset } from "./types";

/** Parse a synthetic file, edit it into the computed state, and hand back the stored year. */
function importedYear(
  sheet: SheetSpec = { hotel: "HOTEL X", center: "Cultura Manor" },
): OccupancyDataset {
  const aoa = occupancySheet(
    [
      monthBlock({
        name: "ENERO",
        nights: 25,
        available: [22, 22, 20],
        revenue: [900, 400, 0],
        sold: [9, 5, 0],
        complimentary: [1, 1, 0],
        channels: [
          ["Booking", [7, 5, 0]],
          ["Página web", [3, 1, 0]],
        ],
        rooms: { simples: [4, 2, 0], dobles: [4, 4, 0], triples: [2, 0, 0] },
        pax: [19, 16, 0], // day 1 differs from 4+8+6=18 → an override
      }),
      monthBlock({ name: "FEBRERO", sold: [1, 2, 3] }),
    ],
    sheet,
  );
  return parseOccupancyWorkbook(aoaToXlsxBuffer(aoa), "OCUPACION_HOTEL_X_2026.xlsx").dataset;
}

async function parseYear(wb: import("exceljs").Workbook): Promise<OccupancyDataset> {
  const buffer = await wb.xlsx.writeBuffer();
  return parseOccupancyWorkbook(buffer as ArrayBuffer, "OCUPACION_HOTEL_X_2026.xlsx").dataset;
}

describe("buildOccupancyWorkbook · round-trip", () => {
  it("re-parses to the same raw inputs it was built from", async () => {
    const original = importedYear();
    const wb = buildOccupancyWorkbook(original);
    const reparsed = await parseYear(wb);

    for (const index of [0, 1]) {
      const a = original.months[index].inputs;
      const b = reparsed.months[index].inputs;
      expect(b.available).toEqual(a.available);
      expect(b.revenue).toEqual(a.revenue);
      expect(b.sold).toEqual(a.sold);
      expect(b.complimentary).toEqual(a.complimentary);
      expect(b.rooms).toEqual(a.rooms);
    }
  });

  it("preserves the channels of each month, and only those", async () => {
    const reparsed = await parseYear(buildOccupancyWorkbook(importedYear()));
    expect(Object.keys(reparsed.months[0].inputs.channels).sort()).toEqual([
      "booking",
      "pagina-web",
    ]);
    // February listed no channels in the fixture, so it round-trips with none.
    expect(Object.keys(reparsed.months[1].inputs.channels)).toEqual([]);
  });

  it("round-trips a hand-entered PAX override", async () => {
    const reparsed = await parseYear(buildOccupancyWorkbook(importedYear()));
    expect(reparsed.months[0].inputs.pax[0]).toBe(19);
    // Day 2's 16 also differs from its rooms, so it survives too.
    expect(reparsed.months[0].inputs.pax[1]).toBe(16);
  });

  it("carries the year and the declared nights", async () => {
    const reparsed = await parseYear(buildOccupancyWorkbook(importedYear()));
    expect(reparsed.year).toBe(2026);
    expect(reparsed.months[0].nights).toBe(25);
  });

  it("re-shows the file's indicators verbatim, matching what the source displayed", async () => {
    const original = importedYear();
    const before = toOccupancyGrid(original, 0);
    const reparsed = await parseYear(buildOccupancyWorkbook(original));
    const after = toOccupancyGrid(reparsed, 0);
    const agg = (g: typeof before, id: string) => g.rows.find((r) => r.id === id)?.agg;
    expect(agg(after, "adr")).toBeCloseTo(agg(before, "adr") as number, 6);
    expect(agg(after, "occupancy")).toBeCloseTo(agg(before, "occupancy") as number, 6);
  });
});

describe("buildOccupancyWorkbook · cabecera", () => {
  it("re-imports into the same hotel and sucursal", async () => {
    const original = importedYear();
    const reparsed = await parseYear(buildOccupancyWorkbook(original));
    expect(reparsed.hotelName).toBe("HOTEL X");
    expect(reparsed.centerName).toBe("Cultura Manor");
    expect(reparsed.centerId).toBe(original.centerId);
    // Nothing to warn about: the file states both names itself.
    expect(reparsed.warnings).toEqual([]);
  });

  it("omits the cost-center line for the `principal` sucursal", async () => {
    const original = importedYear({ hotel: "HOTEL X" });
    expect(original.centerId).toBe(DEFAULT_CENTER_ID);

    const reparsed = await parseYear(buildOccupancyWorkbook(original));
    expect(reparsed.centerId).toBe(DEFAULT_CENTER_ID);
    expect(reparsed.hotelName).toBe("HOTEL X");
  });
});

describe("occupancyExportFilename", () => {
  it("names the file so it re-imports into the same year", () => {
    const year = importedYear({ hotel: "HOTEL X" });
    expect(occupancyExportFilename(year)).toBe("OCUPACION_HOTEL_X_2026.xlsx");
  });

  it("names the sucursal when there is one", () => {
    expect(occupancyExportFilename(importedYear())).toBe(
      "OCUPACION_HOTEL_X_Cultura_Manor_2026.xlsx",
    );
  });

  it("falls back when the hotel name is missing", () => {
    const year = { ...importedYear({}), hotelName: "—" };
    expect(occupancyExportFilename(year)).toBe("OCUPACION_2026.xlsx");
  });
});

describe("buildOccupancyWorkbook · membrete del hotel", () => {
  const LOGO = {
    dataUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    mime: "image/png" as const,
    width: 640,
    height: 160,
  };

  /**
   * The risk here is greater than in PyG: this parser reads the hotel and the sucursal BY POSITION.
   * What saves it is that `readNames` picks up only the NON-EMPTY lines, so the letterhead's blank
   * rows do not shift the index. This writes it down as a guarantee instead of an assumption.
   */
  it("el membrete no mueve el hotel ni la sucursal que el archivo declara", async () => {
    const original = importedYear();
    const sinLogo = await parseYear(buildOccupancyWorkbook(original));
    const conLogo = await parseYear(buildOccupancyWorkbook(original, LOGO));

    expect(conLogo.hotelName).toBe(sinLogo.hotelName);
    expect(conLogo.centerId).toBe(sinLogo.centerId);
    expect(conLogo.centerName).toBe(sinLogo.centerName);
    expect(conLogo.year).toBe(sinLogo.year);
    expect(conLogo.months).toEqual(sinLogo.months);
  });

  it("sin logo no embebe ninguna imagen", () => {
    expect(buildOccupancyWorkbook(importedYear()).model.media ?? []).toHaveLength(0);
  });
});

describe("buildOccupancyWorkbook · el logo de la sucursal", () => {
  const HOTEL_LOGO = {
    dataUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    mime: "image/png" as const,
    width: 640,
    height: 160,
  };
  // Another data URL, so deduplication by URL does not fuse them into a single image.
  const CENTER_LOGO = {
    dataUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    mime: "image/png" as const,
    width: 200,
    height: 200,
  };

  function anchors(wb: ReturnType<typeof buildOccupancyWorkbook>) {
    // `getImages()` is the public reading of where each image of the sheet ended up anchored.
    return wb.worksheets[0].getImages();
  }

  it("embebe los DOS logos: el del hotel y el de la sucursal", () => {
    const wb = buildOccupancyWorkbook(importedYear(), HOTEL_LOGO, CENTER_LOGO);
    expect(wb.model.media ?? []).toHaveLength(2);
    expect(anchors(wb)).toHaveLength(2);
  });

  it("el del hotel pegado al borde izquierdo y el de la sucursal a su derecha", () => {
    const [hotel, center] = anchors(
      buildOccupancyWorkbook(importedYear(), HOTEL_LOGO, CENTER_LOGO),
    );
    expect(hotel.range.tl.nativeCol).toBe(0);
    expect(center.range.tl.col).toBeGreaterThan(hotel.range.tl.col);
  });

  it("una sucursal sin logo deja el membrete exactamente como estaba", () => {
    const wb = buildOccupancyWorkbook(importedYear(), HOTEL_LOGO);
    expect(anchors(wb)).toHaveLength(1);
    expect(anchors(wb)[0].range.tl.nativeCol).toBe(0);
  });

  // A hotel with no logo but with one on the sucursal cannot lose the second one: the gap is opened
  // by whoever has something to put in it, not by the main one.
  it("el logo de la sucursal se dibuja aunque el hotel no tenga ninguno", () => {
    expect(anchors(buildOccupancyWorkbook(importedYear(), undefined, CENTER_LOGO))).toHaveLength(1);
  });

  it("el membrete de dos logos tampoco mueve lo que el archivo declara", async () => {
    const original = importedYear();
    const sinLogo = await parseYear(buildOccupancyWorkbook(original));
    const conLogos = await parseYear(buildOccupancyWorkbook(original, HOTEL_LOGO, CENTER_LOGO));

    expect(conLogos.hotelName).toBe(sinLogo.hotelName);
    expect(conLogos.centerId).toBe(sinLogo.centerId);
    expect(conLogos.months).toEqual(sinLogo.months);
  });
});
