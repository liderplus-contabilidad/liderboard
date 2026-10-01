import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseKeysWorkbook } from "./import";
import { mergeImported, working, companyIdFor, sanitizeCompanyId } from "./model";
import type { Access } from "./types";

function fixture(offset = 0) {
  const grid = [
    ...Array.from({ length: offset }, () => ["Encabezado"]),
    ["CLAVES", null, null, "DECLARACION MENSUAL", "SUPER DE COMPAÑIAS", null, null, null, null],
    ["EMPRESAS", "RUC", "GRUPO", "104 IVA", "USUARIO", "CONTRASEÑA", "USUARIO", "CONTRASEÑA", null],
    [
      "Empresa A",
      992833319001,
      "Grupo A",
      "OK",
      "rep",
      "secret-a",
      "contador",
      "secret-b",
      "dato sin encabezado",
    ],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(grid);
  sheet["!merges"] = [
    { s: { r: offset, c: 0 }, e: { r: offset, c: 2 } },
    { s: { r: offset, c: 4 }, e: { r: offset, c: 8 } },
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "CLAVES");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Ignorar"]]), "Segunda");
  return XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("first-sheet keys import", () => {
  it("prunes a selected company that was deleted", () => {
    expect(sanitizeCompanyId("removed", [{ id: "remaining" }])).toBe("");
    expect(sanitizeCompanyId("remaining", [{ id: "remaining" }])).toBe("remaining");
  });
  it("locates shifted headers and preserves numeric RUC leading zero", () => {
    const result = parseKeysWorkbook(fixture(3));
    expect(result.companies[0].original.ruc).toBe("0992833319001");
    expect(result.companies[0].original.name).toBe("Empresa A");
    expect(result.obligations[0].source.address).toBe("D6");
  });
  it("keeps repeated service accounts separate and their original passwords", () => {
    const result = parseKeysWorkbook(fixture());
    expect(result.accesses.map((a) => a.original.user)).toEqual(["rep", "contador"]);
    expect(result.accesses.map((a) => a.original.password)).toEqual(["secret-a", "secret-b"]);
    expect(new Set(result.accesses.map((a) => a.id)).size).toBe(2);
  });
  it("retains all nonempty cells including unlabelled data in the source snapshot", () => {
    const result = parseKeysWorkbook(fixture());
    expect(result.source.sheet).toBe("CLAVES");
    expect(result.source.cells.find((c) => c.address === "I3")?.original).toBe(
      "dato sin encabezado",
    );
    expect(result.source.cells.some((c) => c.original === "Ignorar")).toBe(false);
  });
  it("does not interpret OK as applicability or completion", () => {
    const obligation = parseKeysWorkbook(fixture()).obligations[0];
    expect(obligation.source.original).toBe("OK");
    expect(obligation.applies).toBeNull();
    expect(obligation.interpretation).toBe("unresolved");
  });
  it("reloads origins while preserving explicit manual field corrections", () => {
    const imported = parseKeysWorkbook(fixture()).accesses[0];
    const changed: Access = { ...imported, edits: { password: "new-password", notes: "" } };
    const reloaded = mergeImported(changed, {
      ...imported,
      original: { ...imported.original, password: "updated-file" },
    });
    expect(working(reloaded).password).toBe("new-password");
    expect(working(reloaded).notes).toBe("");
    expect(reloaded.original.password).toBe("updated-file");
  });
  it("keeps company identity stable independently of its edited label", () => {
    expect(companyIdFor("0992833319001", "A")).toBe(companyIdFor("0992833319001", "B"));
  });
  it("keeps an unnumbered legend encrypted in the source instead of importing it as a company", () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ["N.-", "EMPRESAS", "RUC", "GRUPO"],
        [1, "Empresa A", "0992833319001", "Grupo"],
        [2, "Empresa sin RUC", "", "Grupo"],
        ["", "not-a-company-secret", "", "CLAVE:"],
      ]),
      "CLAVES",
    );
    const result = parseKeysWorkbook(XLSX.write(book, { type: "array", bookType: "xlsx" }));
    expect(result.companies).toHaveLength(2);
    expect(JSON.stringify(result.companies)).not.toContain("not-a-company-secret");
    expect(result.source.cells.some((c) => c.original === "not-a-company-secret")).toBe(true);
    expect(result.warnings.some((w) => w.includes("fuera de la tabla"))).toBe(true);
  });
});
