import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  operationsDb,
  createSpace,
  readAccesses,
  patchAccess,
  importKeys,
  patchTask,
  addTask,
  readPublic,
  importSchedule,
  patchCompanyField,
  readCompanies,
  deleteTask,
} from "./db";
import { newCompany, working } from "./model";
import type { Access, KeysImport, ScheduleImport } from "./types";
import { parseKeysWorkbook } from "./import";
import * as XLSX from "xlsx";
import Dexie from "dexie";

beforeEach(async () => {
  await operationsDb.delete();
  await operationsDb.open();
});

describe("operations persistence", () => {
  it("migrates the previous obligations list without duplicating already scheduled work", async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ["", "", "DECLARACION MENSUAL", "DECLARACION MENSUAL"],
        ["EMPRESAS", "RUC", "IVA", "ATS"],
        ["A", "0992833319001", "OK", "OK"],
      ]),
      "CLAVES",
    );
    const incoming = parseKeysWorkbook(XLSX.write(book, { type: "array", bookType: "xlsx" }));
    await operationsDb.delete();
    const previous = new Dexie("liderboard-operations");
    previous.version(1).stores({
      companies: "id",
      accesses: "id,companyId",
      obligations: "id,companyId",
      tasks: "id,companyId",
      sources: "id,loadedOn",
      meta: "id",
    });
    await previous.open();
    await previous.table("companies").bulkPut(incoming.companies);
    await previous.table("obligations").bulkPut(incoming.obligations);
    await previous.table("tasks").put({
      id: "scheduled-iva",
      companyId: incoming.companies[0].id,
      original: {
        title: "IVA",
        period: "2026-08",
        dueOn: "2026-09-18",
        person: "Pauli",
        done: false,
        notes: "",
      },
      edits: { done: true, notes: "Corregida" },
    });
    previous.close();
    await operationsDb.open();
    const data = await readPublic();
    expect(data.tasks).toHaveLength(2);
    expect(working(data.tasks.find((t) => t.id === "scheduled-iva")!)).toMatchObject({
      done: true,
      notes: "Corregida",
      period: "2026-08",
      dueOn: "2026-09-18",
    });
    expect(working(data.tasks.find((t) => t.original.title === "ATS")!)).toMatchObject({
      done: false,
      period: "",
      dueOn: null,
    });
    expect(data.obligations.map((o) => o.source.original)).toEqual(["OK", "OK"]);
  });
  it("brings Excel obligations directly into tasks without interpreting OK and retains corrections on reload", async () => {
    const key = await createSpace("a long test passphrase");
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["", "", "DECLARACION MENSUAL"],
      ["EMPRESAS", "RUC", "IVA"],
      ["A", "0992833319001", "OK"],
    ]);
    XLSX.utils.book_append_sheet(book, sheet, "CLAVES");
    const incoming = parseKeysWorkbook(XLSX.write(book, { type: "array", bookType: "xlsx" }));
    await importKeys(incoming, key);
    const data = await readPublic();
    expect(data.tasks).toHaveLength(1);
    const task = data.tasks[0];
    expect(working(task)).toMatchObject({ title: "IVA", dueOn: null, period: "", done: false });
    expect(data.obligations[0].source.original).toBe("OK");
    await patchTask(task.id, { done: true, notes: "Revisada", dueOn: "2026-09-20" });
    await importKeys(incoming, key);
    expect((await readPublic()).tasks).toHaveLength(1);
    expect(working((await readPublic()).tasks[0])).toMatchObject({
      done: true,
      notes: "Revisada",
      dueOn: "2026-09-20",
    });
    await deleteTask(task.id);
    await operationsDb.close();
    await operationsDb.open();
    expect((await readPublic()).tasks).toHaveLength(0);
    expect((await readPublic()).obligations[0].source.original).toBe("OK");
  });
  it("creates a calendar task atomically and preserves workflow/date corrections across reload", async () => {
    const company = newCompany("Empresa");
    await importSchedule({ kind: "schedule", companies: [company], tasks: [], warnings: [] });
    const id = await addTask(company.id, "2026-08", "IVA", { dueOn: "2026-09-18" });
    const imported = (await readPublic()).tasks[0];
    await patchTask(id, { started: true, done: false, dueOn: "2026-09-20" });
    await importSchedule({
      kind: "schedule",
      companies: [company],
      tasks: [imported],
      warnings: [],
    });
    const task = (await readPublic()).tasks[0];
    expect(working(task)).toMatchObject({
      started: true,
      done: false,
      period: "2026-08",
      dueOn: "2026-09-20",
    });
    expect(task.original.dueOn).toBe("2026-09-18");
    await expect(
      addTask(company.id, "2026-08", "Invalid", { dueOn: "2026-02-31" }),
    ).rejects.toThrow(/fecha/);
    expect((await readPublic()).tasks).toHaveLength(1);
  });
  it("keeps company fields public while recognized credentials stay encrypted", async () => {
    const key = await createSpace("a long test passphrase");
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ["EMPRESAS", "RUC", "USUARIO", "CLAVE:", "Dato sin clasificar"],
        ["A", "0992833319001", "user", "synthetic-secret", "another-secret"],
      ]),
      "CLAVES",
    );
    const incoming = parseKeysWorkbook(XLSX.write(book, { type: "array", bookType: "xlsx" }));
    await importKeys(incoming, key);
    const unknown = incoming.companies[0].fields.find((f) => f.label === "Dato sin clasificar")!;
    await patchCompanyField(incoming.companies[0].id, unknown.key, "corrected-secret", key);
    const raw = JSON.stringify(await operationsDb.companies.toArray());
    expect(raw).not.toContain("synthetic-secret");
    expect(raw).toContain("another-secret");
    expect(raw).toContain("corrected-secret");
    expect(JSON.stringify(await operationsDb.accesses.toArray())).not.toContain("synthetic-secret");
    await importKeys(incoming, key);
    const reopened = (await readCompanies(key))[0];
    expect(reopened.fieldEdits[unknown.key]).toBe("corrected-secret");
    expect((await readAccesses(key))[0].original.password).toBe("synthetic-secret");
  });
  it("rejects dangling obligation references before any write", async () => {
    const key = await createSpace("a long test passphrase");
    const company = newCompany("A");
    await expect(
      importKeys(
        {
          kind: "keys",
          companies: [company],
          accesses: [],
          obligations: [
            {
              id: "o",
              companyId: "absent",
              category: "SRI",
              label: "IVA",
              notes: "",
              applies: null,
              interpretation: "unresolved",
              source: {
                key: "x",
                address: "",
                row: 0,
                column: "",
                category: "SRI",
                label: "IVA",
                original: "OK",
              },
            },
          ],
          source: { sheet: "CLAVES", cells: [] },
          warnings: [],
        },
        key,
      ),
    ).rejects.toThrow(/empresa/i);
    expect((await readPublic()).companies).toHaveLength(0);
  });
  it("keeps corrected credentials encrypted through a workbook reload", async () => {
    const key = await createSpace("a long test passphrase");
    const company = newCompany("Empresa", "0992833319001");
    const access: Access = {
      id: "access-test",
      companyId: company.id,
      original: { service: "SRI", user: "user", password: "source-password", email: "", notes: "" },
      edits: {},
      fields: [],
      fieldEdits: {},
    };
    const incoming: KeysImport = {
      kind: "keys",
      companies: [company],
      accesses: [access],
      obligations: [],
      source: { sheet: "CLAVES", cells: [] },
      warnings: [],
    };
    await importKeys(incoming, key);
    await patchAccess(access.id, { password: "working-password" }, key);
    await importKeys(incoming, key);
    const stored = await readAccesses(key);
    expect(working(stored[0]).password).toBe("working-password");
    expect(stored[0].original.password).toBe("source-password");
    const raw = await operationsDb.table("accesses").toArray();
    expect(JSON.stringify(raw)).not.toContain("password");
  });
  it("preserves manual completion on reload and isolates another month", async () => {
    const company = newCompany("Empresa", "0992833319001");
    const task = (period: string) => ({
      id: `task:${period}`,
      companyId: company.id,
      original: { title: "IVA", period, dueOn: `${period}-18`, person: "", done: false, notes: "" },
      edits: {},
    });
    const incoming: ScheduleImport = {
      kind: "schedule",
      companies: [company],
      tasks: [task("2026-08"), task("2026-09")],
      warnings: [],
    };
    await importSchedule(incoming);
    await patchTask("task:2026-08", { done: true });
    await importSchedule(incoming);
    const data = await readPublic();
    expect(working(data.tasks.find((t) => t.id === "task:2026-08")!).done).toBe(true);
    expect(working(data.tasks.find((t) => t.id === "task:2026-09")!).done).toBe(false);
    expect(data.tasks).toHaveLength(2);
  });
  it("rejects invalid task periods and dates without replacing the last saved values", async () => {
    const company = newCompany("Empresa");
    await importSchedule({
      kind: "schedule",
      companies: [company],
      tasks: [
        {
          id: "task",
          companyId: company.id,
          original: {
            title: "IVA",
            period: "2026-08",
            dueOn: "2026-08-18",
            person: "",
            done: false,
            notes: "",
          },
          edits: {},
        },
      ],
      warnings: [],
    });
    await expect(patchTask("task", { period: "" })).rejects.toThrow("período");
    await expect(patchTask("task", { dueOn: "2026-02-31" })).rejects.toThrow("fecha");
    expect(working((await readPublic()).tasks[0]).dueOn).toBe("2026-08-18");
    await patchTask("task", { period: "2026-09", dueOn: null });
    expect(working((await readPublic()).tasks[0]).period).toBe("2026-09");
  });
});
