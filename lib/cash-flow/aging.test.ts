import { describe, expect, it } from "vitest";
import { agingLabel, agingOf, bucketOf } from "./aging";

const AS_OF = "2026-09-15";

describe("agingOf", () => {
  it("puts the due day and the future on the «por vencer» side", () => {
    expect(agingOf("2026-09-15", AS_OF)).toEqual({ side: "due", bucket: 30, days: 0 });
    expect(agingOf("2026-10-08", AS_OF)).toEqual({ side: "due", bucket: 30, days: -23 });
  });

  it("puts yesterday on the «vencida» side", () => {
    expect(agingOf("2026-09-08", AS_OF)).toEqual({ side: "overdue", bucket: 30, days: 7 });
  });

  it("steps the buckets at 30, 60, 90 and 120 days", () => {
    expect(bucketOf(30)).toBe(30);
    expect(bucketOf(31)).toBe(60);
    expect(bucketOf(60)).toBe(60);
    expect(bucketOf(61)).toBe(90);
    expect(bucketOf(120)).toBe(120);
    expect(bucketOf(121)).toBe("120+");
  });

  it("uses the same steps on both sides", () => {
    expect(agingOf("2026-05-18", AS_OF).bucket).toBe(120);
    expect(agingOf("2026-05-17", AS_OF).bucket).toBe("120+");
    expect(agingOf("2027-01-15", AS_OF)).toEqual({ side: "due", bucket: "120+", days: -122 });
  });

  it("treats no due date as por vencer, first bucket", () => {
    expect(agingOf(null, AS_OF)).toEqual({ side: "due", bucket: 30, days: 0 });
  });
});

describe("agingLabel", () => {
  it("names the side and the span", () => {
    expect(agingLabel({ side: "due", bucket: 30 })).toBe("Por vencer 30 días");
    expect(agingLabel({ side: "overdue", bucket: "120+" })).toBe("Vencida por >120 días");
  });
});
