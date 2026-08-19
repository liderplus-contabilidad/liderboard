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

/** El perfil de arriba sin los dos campos opcionales: lo mínimo que el diálogo deja guardar. */
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

  // Un campo opcional ausente no puede dejar rastro: un separador colgando o una línea en blanco
  // se leen como un dato que falta, cuando lo que pasa es que ese dato no existe.
  it("no deja separador colgando cuando solo falta el RUC", () => {
    expect(letterheadLines({ ...REQUIRED_ONLY, email: "nomina@delicmar.com" })[0]).toBe(
      "DELICMAR S.A.S.",
    );
  });

  it("sin perfil no sale ninguna línea", () => {
    expect(letterheadLines(undefined)).toEqual([]);
    expect(letterheadLines(null)).toEqual([]);
  });

  // El nombre del cliente es lo que el usuario eligió llamarle y viaja aparte a las tres
  // superficies: si entrara aquí, cada una tendría que saber que la primera línea se pinta distinto.
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

  // Un campo de solo espacios se ve lleno y no lo está: sin esto, «Crear cliente» se encendería
  // sobre una parroquia en blanco y el membrete saldría con un hueco entre dos barras.
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

  // El diálogo abre mostrando lo guardado; si un perfil ausente diera otra cosa que el borrador
  // vacío, renombrar un cliente antiguo parecería estar borrándole datos que nunca tuvo.
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
