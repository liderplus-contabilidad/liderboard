import { describe, expect, it } from "vitest";
import { mergeCut, type IncomingPayable } from "./cut";
import type { Payable } from "./types";

function stored(over: Partial<Payable>): Payable {
  return {
    id: "c1::contifico::kitlasz::fac::20",
    clientId: "c1",
    source: "contifico",
    supplier: "KITLASZ",
    supplierTaxId: null,
    docType: "FAC",
    docNumber: "20",
    description: "",
    issuedOn: "2026-05-05",
    dueOn: "2026-05-05",
    amount: 9200,
    withholdings: 0,
    payments: 8300,
    balance: 900,
    centerName: "CULTURA MANOR",
    priority: null,
    cash: false,
    payOn: null,
    payFromAccountId: null,
    observation: "",
    approved: null,
    finalReview: false,
    notified: false,
    status: "open",
    settledOn: null,
    cutDate: "2026-09-01",
    ...over,
  };
}

function incoming(over: Partial<IncomingPayable>): IncomingPayable {
  return {
    id: "c1::contifico::kitlasz::fac::20",
    supplier: "KITLASZ",
    supplierTaxId: null,
    docType: "FAC",
    docNumber: "20",
    description: "",
    issuedOn: "2026-05-05",
    dueOn: "2026-05-05",
    amount: 9200,
    withholdings: 0,
    payments: 8800,
    balance: 400,
    centerName: "CULTURA MANOR",
    ...over,
  };
}

describe("mergeCut", () => {
  it("keeps the marks and the four working columns, takes the file's figures", () => {
    const old = stored({
      observation: "esperar nota de crédito",
      approved: 100,
      finalReview: true,
      priority: "urgent",
      payOn: "2026-09-20",
      payFromAccountId: "acc",
    });
    const [row] = mergeCut([old], [incoming({})], "c1", "contifico", "2026-09-15");
    expect(row.observation).toBe("esperar nota de crédito");
    expect(row.approved).toBe(100);
    expect(row.finalReview).toBe(true);
    expect(row.priority).toBe("urgent");
    expect(row.payOn).toBe("2026-09-20");
    expect(row.payFromAccountId).toBe("acc");
    expect(row.payments).toBe(8800);
    expect(row.balance).toBe(400);
    expect(row.cutDate).toBe("2026-09-15");
    expect(row.status).toBe("open");
  });

  it("writes a new document blank", () => {
    const [row] = mergeCut([], [incoming({ id: "new" })], "c1", "contifico", "2026-09-15");
    expect(row).toMatchObject({
      id: "new",
      clientId: "c1",
      source: "contifico",
      priority: null,
      cash: false,
      observation: "",
      approved: null,
      status: "open",
      cutDate: "2026-09-15",
    });
  });

  it("settles what the file no longer brings, of the same source only", () => {
    const gone = stored({ id: "gone" });
    const dingoo = stored({ id: "d", source: "dingoo" });
    const manual = stored({ id: "m", source: "manual" });
    const settledBefore = stored({ id: "s", status: "settled", settledOn: "2026-08-01" });
    const writes = mergeCut(
      [gone, dingoo, manual, settledBefore],
      [incoming({ id: "kept" })],
      "c1",
      "contifico",
      "2026-09-15",
    );
    expect(writes.map((w) => w.id)).toEqual(["kept", "gone"]);
    expect(writes[1]).toMatchObject({ status: "settled", settledOn: "2026-09-15" });
  });

  it("reopens nothing: a settled document that comes back is written open again", () => {
    const settled = stored({ status: "settled", settledOn: "2026-08-01", observation: "x" });
    const [row] = mergeCut([settled], [incoming({})], "c1", "contifico", "2026-09-15");
    expect(row.status).toBe("open");
    expect(row.settledOn).toBeNull();
    expect(row.observation).toBe("x");
  });
});
