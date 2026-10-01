import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  addCompany,
  changeCompanyFields,
  createSpace,
  importKeys,
  operationsDb,
  patchCompanyField,
  patchCompanyTax,
  readCompanies,
  readPublic,
  migrateCompanyDetails,
} from "./db";
import { newCompany } from "./model";
import { companyFieldSections } from "./company-fields";
import { seal } from "@/lib/credentials/vault";

afterEach(async () => {
  await operationsDb.delete();
});

it("recovers encrypted legacy company details once without losing values, edits or field types", async () => {
  const key = await createSpace("test12");
  const company = newCompany("Anterior");
  const details = {
    fields: [],
    fieldEdits: { "manual:1": "Corregido" },
    fieldTabs: ["Legal"],
    customFields: [
      {
        key: "manual:1",
        label: "Estado",
        category: "Legal",
        original: "Pendiente",
        address: "",
        column: "",
        row: 0,
      },
    ],
    fieldTypes: { "manual:1": { kind: "select", options: ["Pendiente", "Corregido"] } },
    taxEdits: { regime: "general", isCompany: true },
  };
  const { fields: _fields, fieldEdits: _edits, ...publicFields } = company;
  await operationsDb.companies.put({
    ...publicFields,
    detail: await seal(key, `company:${company.id}`, details),
  });
  expect((await readPublic()).companies[0].detailsPending).toBe(true);
  await migrateCompanyDetails(key);
  const recovered = (await readPublic()).companies[0];
  expect(recovered).toMatchObject({ ...details, detailsPending: false });
  expect((await operationsDb.companies.get(company.id))?.detail).toBeUndefined();
  await patchCompanyField(company.id, "manual:1", "Sin contraseña");
  expect((await readPublic()).companies[0].fieldEdits["manual:1"]).toBe("Sin contraseña");
  await migrateCompanyDetails(key);
  expect((await readPublic()).companies[0].fieldEdits["manual:1"]).toBe("Sin contraseña");
});
beforeEach(async () => {
  await operationsDb.open();
});

it("keeps manual fields and tabs editable without unlocking and preserves them on reload", async () => {
  const key = await createSpace("test12");
  const id = await addCompany();
  await changeCompanyFields(id, { type: "add-tab", label: "Documentación" }, key);
  await changeCompanyFields(
    id,
    {
      type: "add-field",
      category: "Documentación",
      label: "Contacto privado",
      value: "PRIVATE-VALUE",
    },
    key,
  );
  const before = (await readCompanies(key))[0];
  await patchCompanyField(id, before.customFields![0].key, "UPDATED-PRIVATE-VALUE", key);
  const locked = (await readPublic()).companies[0];
  expect(locked.customFields).toEqual(before.customFields);
  expect(locked.fieldTabs).toEqual(before.fieldTabs);
  expect(locked.fieldEdits[before.customFields![0].key]).toBe("UPDATED-PRIVATE-VALUE");
  await changeCompanyFields(id, { type: "add-tab", label: "Sin desbloquear" });
  const incoming = newCompany("Reimportada");
  incoming.id = id;
  await importKeys(
    {
      kind: "keys",
      companies: [incoming],
      accesses: [],
      obligations: [],
      source: { sheet: "CLAVES", cells: [] },
      warnings: [],
    },
    key,
  );
  const reloaded = (await readCompanies(key))[0];
  expect(reloaded.original.name).toBe("Reimportada");
  expect(reloaded.fieldEdits[before.customFields![0].key]).toBe("UPDATED-PRIVATE-VALUE");
  expect(companyFieldSections(reloaded)[0]).toMatchObject({
    label: "Documentación",
    fields: [{ label: "Contacto privado" }],
  });
});

it("does not lose simultaneous tab and field edits", async () => {
  const key = await createSpace("test12");
  const id = await addCompany();
  await Promise.all([
    changeCompanyFields(id, { type: "add-tab", label: "Legal" }, key),
    changeCompanyFields(
      id,
      { type: "add-field", category: "Administración", label: "Contacto", value: "Ana" },
      key,
    ),
  ]);
  expect(companyFieldSections((await readCompanies(key))[0]).map((s) => s.label)).toEqual([
    "Legal",
    "Administración",
  ]);
});

it("keeps tax edits and field types available without unlocking and preserves them on reimport", async () => {
  const key = await createSpace("test12");
  const id = await addCompany();
  await patchCompanyTax(id, { regime: "popular", isCompany: true, zeroDeclaration: false }, key);
  await changeCompanyFields(
    id,
    {
      type: "add-field",
      category: "Documentación",
      label: "Estado",
      value: "Pendiente",
      fieldType: { kind: "select", options: ["Pendiente", "Listo"] },
    },
    key,
  );
  const before = (await readCompanies(key))[0];
  const locked = (await readPublic()).companies[0];
  expect(locked.taxEdits).toEqual(before.taxEdits);
  expect(locked.fieldTypes).toEqual(before.fieldTypes);
  await patchCompanyTax(id, { zeroDeclaration: true });
  before.taxEdits!.zeroDeclaration = true;
  const incoming = newCompany("Reimportada");
  incoming.id = id;
  await importKeys(
    {
      kind: "keys",
      companies: [incoming],
      accesses: [],
      obligations: [],
      source: { sheet: "CLAVES", cells: [] },
      warnings: [],
    },
    key,
  );
  const restored = (await readCompanies(key))[0];
  expect(restored.taxEdits).toEqual(before.taxEdits);
  expect(restored.fieldTypes).toEqual(before.fieldTypes);
});
