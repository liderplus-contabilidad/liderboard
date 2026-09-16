import { describe, expect, it } from "vitest";
import type { CashFlowCenter } from "../types";
import { detectCenters } from "./center-labels";

const CENTERS: CashFlowCenter[] = [{ id: "ha", clientId: "c", name: "HA" }];

describe("detectCenters", () => {
  it("lists every label the file brings, merged by spelling, and says which are already centers", () => {
    const detected = detectCenters(
      [
        { centerName: "HA" },
        { centerName: "hc" },
        { centerName: "HC" },
        { centerName: "HC " },
        { centerName: null },
        { centerName: "" },
        { centerName: "CULTURA MANOR,CULTURA MANOR,CULTURA MANOR" },
        { centerName: "HC, ha" },
      ],
      CENTERS,
    );
    expect(detected).toEqual([
      { name: "HC", count: 4, known: false },
      { name: "HA", count: 2, known: true },
      { name: "CULTURA MANOR", count: 1, known: false },
    ]);
  });

  it("lists nothing for a cartera without a center column", () => {
    expect(detectCenters([{ centerName: null }], CENTERS)).toEqual([]);
  });
});
