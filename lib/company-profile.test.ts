import { describe, expect, it } from "vitest";
import {
  MAX_COMPANY_FIELD_LENGTH,
  checkCompanyProfile,
  companyDraftFrom,
  emptyCompanyDraft,
  firstMissingCompanyField,
  letterheadLines,
  type CompanyProfile,
} from "./company-profile";

const DELICMAR: CompanyProfile = {
  legalName: "DELICMAR S.A.S.",
  taxId: "1891234567001",
  province: "TUNGURAHUA",
  canton: "AMBATO",
  parish: "AMBATO",
  address: "LUIS ANIBAL GRANJA Y CALLE LIBARDO PARRA",
  phones: "0991045439 - 0958780660",
  email: "nomina@delicmar.com",
};

/** The profile above without the two optional fields: the minimum the dialog allows saving. */
const REQUIRED_ONLY: CompanyProfile = {
  legalName: DELICMAR.legalName,
  province: DELICMAR.province,
  canton: DELICMAR.canton,
  parish: DELICMAR.parish,
  address: DELICMAR.address,
  phones: DELICMAR.phones,
};

function draft(overrides: Partial<Record<string, string>> = {}) {
  return { ...companyDraftFrom(DELICMAR), ...overrides };
}

describe("letterheadLines", () => {
  it("compone las cuatro líneas de un perfil completo", () => {
    expect(letterheadLines(DELICMAR)).toEqual([
      "DELICMAR S.A.S. · RUC 1891234567001",
      "TUNGURAHUA / AMBATO / AMBATO / LUIS ANIBAL GRANJA Y CALLE LIBARDO PARRA",
      "0991045439 - 0958780660",
      "nomina@delicmar.com",
    ]);
  });

  it("sin RUC ni correo deja tres líneas y la razón social sola", () => {
    expect(letterheadLines(REQUIRED_ONLY)).toEqual([
      "DELICMAR S.A.S.",
      "TUNGURAHUA / AMBATO / AMBATO / LUIS ANIBAL GRANJA Y CALLE LIBARDO PARRA",
      "0991045439 - 0958780660",
    ]);
  });

  // An absent optional field cannot leave a trace: a dangling separator or a blank line reads as a
  // missing datum, when what is happening is that the datum does not exist.
  it("no deja separador colgando cuando solo falta el RUC", () => {
    expect(letterheadLines({ ...REQUIRED_ONLY, email: "nomina@delicmar.com" })[0]).toBe(
      "DELICMAR S.A.S.",
    );
  });

  it("sin perfil no sale ninguna línea", () => {
    expect(letterheadLines(undefined)).toEqual([]);
    expect(letterheadLines(null)).toEqual([]);
  });

  // The client's name is what the user chose to call it and travels separately to the three
  // surfaces: were it to come in here, each one would have to know the first line is painted
  // differently.
  it("no incluye el nombre del cliente", () => {
    expect(letterheadLines(DELICMAR).join("\n")).not.toContain("DELICMAR S.A.S\n");
  });
});

describe("checkCompanyProfile", () => {
  it("acepta un perfil completo y devuelve los campos recortados", () => {
    const result = checkCompanyProfile(draft({ legalName: "  DELICMAR   S.A.S.  " }));
    expect(result).toEqual({ ok: true, profile: { ...DELICMAR, legalName: "DELICMAR S.A.S." } });
  });

  it("acepta los seis obligatorios sin RUC ni correo, y no guarda cadenas vacías", () => {
    const result = checkCompanyProfile(draft({ taxId: "  ", email: "" }));
    expect(result).toEqual({ ok: true, profile: REQUIRED_ONLY });
    if (result.ok) {
      expect(result.profile).not.toHaveProperty("taxId");
      expect(result.profile).not.toHaveProperty("email");
    }
  });

  it("nombra el campo obligatorio que falta", () => {
    const result = checkCompanyProfile(draft({ parish: "" }));
    expect(result).toEqual({
      ok: false,
      field: "parish",
      message: expect.stringContaining("parroquia"),
    });
  });

  // A field of only spaces looks full and is not: without this, «Crear cliente» would light up over a
  // blank parroquia and the letterhead would come out with a gap between two slashes.
  it("un campo de solo espacios cuenta como vacío", () => {
    expect(checkCompanyProfile(draft({ canton: "   " }))).toMatchObject({
      ok: false,
      field: "canton",
    });
  });

  it("rechaza un campo que pasa del tope", () => {
    const result = checkCompanyProfile(
      draft({ address: "A".repeat(MAX_COMPANY_FIELD_LENGTH + 1) }),
    );
    expect(result).toMatchObject({ ok: false, field: "address" });
  });

  it("rechaza un RUC que no tiene trece dígitos, nombrando la regla", () => {
    expect(checkCompanyProfile(draft({ taxId: "1891234567" }))).toEqual({
      ok: false,
      field: "taxId",
      message: expect.stringContaining("trece"),
    });
  });

  it("no valida el RUC cuando no viene", () => {
    expect(checkCompanyProfile(draft({ taxId: "" })).ok).toBe(true);
  });

  it("un borrador vacío falla por el primer obligatorio, no por el último", () => {
    expect(checkCompanyProfile(emptyCompanyDraft())).toMatchObject({
      ok: false,
      field: "legalName",
    });
  });
});

describe("companyDraftFrom", () => {
  it("precarga los ocho campos, con los opcionales en blanco cuando no hay", () => {
    expect(companyDraftFrom(REQUIRED_ONLY)).toEqual({
      ...companyDraftFrom(DELICMAR),
      taxId: "",
      email: "",
    });
  });

  // The dialog opens showing what is stored; if an absent profile gave anything other than the empty
  // draft, renaming an old client would look like it was erasing data it never had.
  it("sin perfil da el borrador vacío", () => {
    expect(companyDraftFrom(undefined)).toEqual(emptyCompanyDraft());
  });
});

describe("firstMissingCompanyField", () => {
  it("nombra el primer obligatorio vacío, de arriba abajo", () => {
    expect(firstMissingCompanyField(emptyCompanyDraft())).toContain("razón social");
    expect(firstMissingCompanyField(draft({ parish: "  " }))).toContain("parroquia");
  });

  it("con los seis llenos no falta nada, aunque el RUC esté a medio teclear", () => {
    expect(firstMissingCompanyField(draft({ taxId: "189" }))).toBeNull();
  });
});
