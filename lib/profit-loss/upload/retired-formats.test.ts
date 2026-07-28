import { describe, expect, it } from "vitest";
import { PygParseError } from "../errors";
import { aoaToXlsxBuffer, CONSOLIDATED_AOA, SUCURSAL_AOA } from "../parse.fixtures";
import { resolveUpload } from "./registry";

/** BREAKING per the change's proposal: both retired formats are rejected under the new model. */
describe("resolveUpload — formatos retirados", () => {
  it("no longer accepts the old annual-by-cost-centers consolidated file as-is", () => {
    // Its GRID is identical to the new monthly-by-centers shape (same source system, same
    // layout) — decision 4's whole point is that the shape alone can't tell annual from
    // monthly. Under the new system it is rejected for what it actually fails on: a filename
    // that doesn't declare a month, which is a MORE useful error than a generic "unrecognized",
    // and is exactly what an old (non-"PyG-YYYY-MM") filename produces.
    try {
      resolveUpload("consolidado-2026.xlsx", aoaToXlsxBuffer(CONSOLIDATED_AOA));
      throw new Error("expected resolveUpload to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PygParseError);
      expect((error as PygParseError).code).toBe("invalid-filename");
    }
  });

  it("no longer matches a single-sucursal monthly statement", () => {
    try {
      resolveUpload("PyG-2026-01-norte.xlsx", aoaToXlsxBuffer(SUCURSAL_AOA));
      throw new Error("expected resolveUpload to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PygParseError);
      expect((error as PygParseError).code).toBe("unrecognized-format");
    }
  });
});
