import { describe, expect, it } from "vitest";
import { parsePastedGrid } from "./paste";

describe("parsePastedGrid", () => {
  it("reads a single copied column as one cell per row", () => {
    expect(parsePastedGrid("98400\n102900\n97100")).toEqual([[98400], [102900], [97100]]);
  });

  it("reads a block of several columns, splitting on tabs", () => {
    expect(parsePastedGrid("98400\t17200\n102900\t19050")).toEqual([
      [98400, 17200],
      [102900, 19050],
    ]);
  });

  it("accepts the shapes Excel puts on the clipboard for this locale", () => {
    expect(parsePastedGrid("$1,234.56\n1,234.56\n-$980\n0")).toEqual([
      [1234.56],
      [1234.56],
      [-980],
      [0],
    ]);
  });

  it("reads every newline convention", () => {
    expect(parsePastedGrid("1\r\n2\r3")).toEqual([[1], [2], [3]]);
  });

  it("distinguishes an EMPTY cell from an unreadable one", () => {
    // `null` clears the target; `undefined` leaves it exactly as it was.
    expect(parsePastedGrid("100\n\nno es un monto\n200")).toEqual([
      [100],
      [null],
      [undefined],
      [200],
    ]);
  });

  it("drops a leading header row, so the figures do not land a month late", () => {
    expect(parsePastedGrid("Ventas\n98400\n102900")).toEqual([[98400], [102900]]);
  });

  it("drops a header row across several columns", () => {
    expect(parsePastedGrid("Ventas\tCobros TC\n98400\t17200")).toEqual([[98400, 17200]]);
  });

  it("keeps a header-looking row that is not the first", () => {
    // Further down it is a gap in the data, not a title: `undefined` leaves that month untouched.
    expect(parsePastedGrid("100\nTotal\n300")).toEqual([[100], [undefined], [300]]);
  });

  it("does not drop the first row when part of it parses", () => {
    // A real first month beside an empty column is not a header.
    expect(parsePastedGrid("98400\t\n102900\t17200")).toEqual([
      [98400, null],
      [102900, 17200],
    ]);
  });

  it("drops the trailing blank row a copied range ends with", () => {
    expect(parsePastedGrid("98400\n102900\n")).toEqual([[98400], [102900]]);
  });

  it("keeps a blank row in the MIDDLE, where it means «este mes va vacío»", () => {
    expect(parsePastedGrid("100\n\n300\n")).toEqual([[100], [null], [300]]);
  });

  it("never drops a trailing row that failed to parse, so the mistake stays visible", () => {
    expect(parsePastedGrid("100\n200\nTOTAL")).toEqual([[100], [200], [undefined]]);
  });

  it("reads an empty clipboard as nothing to write", () => {
    expect(parsePastedGrid("")).toEqual([]);
  });
});
