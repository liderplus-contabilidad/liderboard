import { describe, expect, it } from "vitest";
import { dueDatePatch } from "./model";

describe("choosing a task due date", () => {
  it("sets the reference period to the chosen date's month in the same patch", () => {
    expect(dueDatePatch("2026-10-03")).toEqual({ dueOn: "2026-10-03", period: "2026-10" });
    expect(dueDatePatch("2027-01-01")).toEqual({ dueOn: "2027-01-01", period: "2027-01" });
  });
  it("clears the due date without erasing the existing reference period", () => {
    expect(dueDatePatch(null)).toEqual({ dueOn: null });
  });
  it("rejects invalid civil dates", () => {
    expect(() => dueDatePatch("2026-02-30")).toThrow();
    expect(() => dueDatePatch("text")).toThrow();
  });
});
