import { describe, expect, it } from "vitest";
import { taskStatus, validPeriod } from "./model";
import { dateFromCell } from "./import-date";

describe("editable schedule semantics", () => {
  it("derives status from completion and the due date", () => {
    expect(taskStatus({ dueOn: "2026-08-18", done: false }, "2026-08-19")).toBe("late");
    expect(taskStatus({ dueOn: "2026-08-18", done: true }, "2026-08-19")).toBe("done");
    expect(taskStatus({ dueOn: null, done: false }, "2026-08-19")).toBe("pending");
  });
  it("reads calendar dates without accepting rollover or ambiguous months", () => {
    expect(dateFromCell("18/08/2026")).toBe("2026-08-18");
    expect(dateFromCell("2026-08-18")).toBe("2026-08-18");
    expect(dateFromCell("31/02/2026")).toBeNull();
    expect(dateFromCell("texto")).toBeNull();
    expect(validPeriod("2026-08")).toBe(true);
    expect(validPeriod("2026-13")).toBe(false);
  });
});
