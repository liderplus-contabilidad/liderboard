import "fake-indexeddb/auto";
import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addAccount,
  addManualPayable,
  applyCut,
  createClient,
  db,
  listAccounts,
  listPayables,
  replaceCartera,
  updatePayables,
} from "../db";
import { parseContifico } from "../upload/contifico";
import { CONTIFICO_GRID } from "../upload/fixtures";
import { readCartera } from "../upload/registry";
import { buildCarteraWorkbook, CARTERA_COLUMNS } from "./cartera-workbook";

/** The cartera with ids taken out and the account named, in a stable order. */
async function shape(clientId: string) {
  const accounts = await listAccounts(clientId);
  const ref = (id: string | null) => {
    const account = accounts.find((candidate) => candidate.id === id);
    return account ? `${account.bank}|${account.number}` : null;
  };
  return (await listPayables(clientId))
    .map(({ id: _id, clientId: _c, ...row }) => ({
      ...row,
      payFromAccountId: ref(row.payFromAccountId),
    }))
    .sort((a, b) => `${a.supplier}${a.docNumber}`.localeCompare(`${b.supplier}${b.docNumber}`));
}

let clientId = "";
let accountId = "";

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  clientId = (await createClient("Nomik")).id;
  accountId = (
    await addAccount(clientId, {
      bank: "PRODUBANCO",
      number: "80010385",
      overdraft: 5000,
      centerId: null,
    })
  ).id;
  await applyCut(clientId, parseContifico(CONTIFICO_GRID), "2026-09-15");
  const docs = await listPayables(clientId);
  await updatePayables([docs[0].id], {
    priority: "urgent",
    approved: 189,
    payOn: "2026-09-18",
    payFromAccountId: accountId,
    observation: "esperar nota de crédito",
    finalReview: true,
  });
  await updatePayables([docs[1].id], { priority: "pending", notified: true });
  const manual = await addManualPayable(clientId, {
    supplier: "Arriendo mes de marzo FC 00017 Laszlo",
    kind: "arriendo",
    amount: 2000,
    dueOn: "2026-08-31",
    centerName: null,
    description: "Laszlo",
  });
  await updatePayables([manual.id], { priority: "pending", payOn: "2026-08-31" });
  // A settled one travels too: the sheet is the cartera AS IT IS, archive included.
  const cut = parseContifico(CONTIFICO_GRID);
  cut.payables = cut.payables.slice(1);
  await applyCut(clientId, cut, "2026-09-22");
});

describe("cartera para recargar · ida y vuelta", () => {
  it("comes back through «Cargar cartera» exactly as it left, marks and archive included", async () => {
    const before = await shape(clientId);
    expect(before.some((row) => row.status === "settled")).toBe(true);
    expect(before.some((row) => row.source === "manual")).toBe(true);

    const accounts = await listAccounts(clientId);
    const buffer = await buildCarteraWorkbook(
      await listPayables(clientId),
      accounts,
      "Nomik",
    ).xlsx.writeBuffer();
    const arrayBuffer = buffer instanceof ArrayBuffer ? buffer : new Uint8Array(buffer).buffer;

    const read = readCartera(arrayBuffer as ArrayBuffer);
    expect(read.ok && read.kind).toBe("liderplus");
    if (!read.ok || read.kind !== "liderplus") {
      return;
    }
    expect(read.rows).toHaveLength(before.length);

    // Restored on a second empresa with the same account: the shape is the same.
    const other = (await createClient("Otra máquina")).id;
    await addAccount(other, {
      bank: "PRODUBANCO",
      number: "80010385",
      overdraft: 5000,
      centerId: null,
    });
    expect(await replaceCartera(other, read.rows)).toBe(before.length);
    expect(await shape(other)).toEqual(before);

    // And reloaded over itself it replaces without duplicating.
    expect(await replaceCartera(clientId, read.rows)).toBe(before.length);
    expect(await shape(clientId)).toEqual(before);
  });

  it("is a sheet headed by the contract's columns, with a mark line above", () => {
    const wb = buildCarteraWorkbook([], [], "Nomik");
    const ws = wb.getWorksheet("CARTERA")!;
    expect(ws.getRow(2).getCell(1).value).toBe("LIDERPLUS · CARTERA POR PAGAR");
    expect((ws.getRow(4).values as unknown[]).slice(1)).toEqual([...CARTERA_COLUMNS]);
  });

  it("is told apart from a Contífico export dropped in the same door", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(CONTIFICO_GRID), "Cartera");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const read = readCartera(out);
    expect(read.ok && read.kind).toBe("system");
  });
});
