import { compactLabel } from "@/lib/text";
import type { Company, CompanyTaxRegime, CompanyTaxValues } from "./types";

export const COMPANY_TAX_REGIMES: { value: CompanyTaxRegime; label: string }[] = [
  { value: "general", label: "Régimen general" },
  { value: "entrepreneur", label: "RIMPE / Emprendedor" },
  { value: "popular", label: "RIMPE / Popular" },
];
export const COMPANY_TAX_LABELS: Record<keyof CompanyTaxValues, string> = {
  regime: "Régimen SRI",
  isCompany: "Es compañía",
  keepsAccounting: "Obligado a llevar contabilidad",
  withholdingAgent: "Agente de retención",
  zeroDeclaration: "Declaración en cero",
  zeroFourteenthDeclaration: "Declaración XIV en 0",
  dualActivity: "Doble actividad",
  incomePeriodicity: "Periodicidad ING",
};
type TaxFieldRole = CompanyTaxRegime | Exclude<keyof CompanyTaxValues, "regime">;

/** These are Excel labels and literal marks, not rules about a company's tax obligations. */
export function companyTaxFieldRole(label: string): TaxFieldRole | null {
  const name = compactLabel(label);
  if (/^regimen general$/.test(name)) return "general";
  if (/^rimpe\s*\/?\s*emprend/.test(name)) return "entrepreneur";
  if (/^rimpe\s*\/?\s*(?:negocio[s]?\s+)?popular/.test(name)) return "popular";
  if (/^(?:es |si es )?compania(?:s)?(?:$|\s|\/)/.test(name)) return "isCompany";
  if (/^obligad.*(?:llevar\s+)?contabilidad/.test(name)) return "keepsAccounting";
  if (/^agentes? de retencion$/.test(name)) return "withholdingAgent";
  if (/^declaracion en cero$/.test(name)) return "zeroDeclaration";
  if (/^declaracion xiv en 0$/.test(name)) return "zeroFourteenthDeclaration";
  if (/^doble actividad$/.test(name)) return "dualActivity";
  if (/^perio(?:dicidad|cidad)\s+(?:ing\.?|ingresos)$/.test(name)) return "incomePeriodicity";
  return null;
}

export function companyTaxProfile(
  company: Company,
): Omit<CompanyTaxValues, "regime"> & { regime: CompanyTaxRegime | "multiple" | "" } {
  const fields = [...company.fields, ...(company.customFields ?? [])];
  const value = (role: TaxFieldRole) =>
    fields
      .filter((f) => companyTaxFieldRole(f.label) === role)
      .map((f) => company.fieldEdits[f.key] ?? f.original);
  const marked = (role: TaxFieldRole) =>
    value(role).some((v) => {
      const mark = compactLabel(v);
      return (
        mark === "ok" ||
        ((role === "dualActivity" || role === "zeroFourteenthDeclaration") && mark === "si")
      );
    });
  const regimes = COMPANY_TAX_REGIMES.filter((r) => marked(r.value));
  return {
    regime: regimes.length > 1 ? "multiple" : (regimes[0]?.value ?? ""),
    isCompany: marked("isCompany"),
    keepsAccounting: marked("keepsAccounting"),
    withholdingAgent: marked("withholdingAgent"),
    zeroDeclaration: marked("zeroDeclaration"),
    zeroFourteenthDeclaration: marked("zeroFourteenthDeclaration"),
    dualActivity: marked("dualActivity"),
    incomePeriodicity: value("incomePeriodicity")[0] ?? "",
    ...company.taxEdits,
  };
}

export function companyTaxSourceNote(company: Company, property: keyof CompanyTaxValues): string {
  if (
    property === "dualActivity" ||
    property === "withholdingAgent" ||
    property === "zeroFourteenthDeclaration"
  )
    return "";
  if (company.taxEdits?.[property] !== undefined) return "";
  return [...company.fields, ...(company.customFields ?? [])]
    .filter((f) => {
      const role = companyTaxFieldRole(f.label);
      return property === "regime"
        ? COMPANY_TAX_REGIMES.some((r) => r.value === role)
        : role === property;
    })
    .map((f) => company.fieldEdits[f.key] ?? f.original)
    .filter((v) => v.trim() && compactLabel(v) !== "ok")
    .join(" · ");
}

export function patchCompanyTaxValues(company: Company, patch: Partial<CompanyTaxValues>): Company {
  if (
    patch.regime !== undefined &&
    patch.regime !== "" &&
    !COMPANY_TAX_REGIMES.some((r) => r.value === patch.regime)
  )
    throw new Error("Selecciona un régimen válido.");
  const fieldEdits = { ...company.fieldEdits };
  for (const field of [...company.fields, ...(company.customFields ?? [])]) {
    const role = companyTaxFieldRole(field.label);
    if (!role) continue;
    if (COMPANY_TAX_REGIMES.some((r) => r.value === role)) {
      if (patch.regime !== undefined) fieldEdits[field.key] = role === patch.regime ? "OK" : "";
    } else {
      const next = patch[role as Exclude<keyof CompanyTaxValues, "regime">];
      if (next !== undefined)
        fieldEdits[field.key] = typeof next === "boolean" ? (next ? "OK" : "") : next;
    }
  }
  return { ...company, taxEdits: { ...company.taxEdits, ...patch }, fieldEdits };
}
