import { describe, expect, it } from "vitest";
import {
  DINGOO_SYSTEM,
  MICROPLUS_SYSTEM,
  MONTHLY_CENTERS_SYSTEM,
  MONTHLY_SINGLE_SYSTEM,
} from "@/lib/profit-loss/upload/systems";
import { canCaptureExternal } from "./availability";

describe("canCaptureExternal", () => {
  it("MicroPlus sí", () => {
    expect(canCaptureExternal({ sourceSystemId: MICROPLUS_SYSTEM, isConsolidated: false })).toBe(
      true,
    );
  });

  it("Dingoo no", () => {
    expect(canCaptureExternal({ sourceSystemId: DINGOO_SYSTEM, isConsolidated: false })).toBe(
      false,
    );
  });

  it("ningún otro sistema", () => {
    expect(
      canCaptureExternal({ sourceSystemId: MONTHLY_SINGLE_SYSTEM, isConsolidated: false }),
    ).toBe(false);
    expect(
      canCaptureExternal({ sourceSystemId: MONTHLY_CENTERS_SYSTEM, isConsolidated: false }),
    ).toBe(false);
  });

  it("el consolidado no, aunque el sistema sea MicroPlus", () => {
    // Escribir ahí crearía una partición que no es de nadie: la misma defensa que `assertRealClient`.
    expect(canCaptureExternal({ sourceSystemId: MICROPLUS_SYSTEM, isConsolidated: true })).toBe(
      false,
    );
  });

  it("un workspace sin sistema declarado no", () => {
    expect(canCaptureExternal({ sourceSystemId: null, isConsolidated: false })).toBe(false);
  });
});
