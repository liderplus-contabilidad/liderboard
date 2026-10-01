import { working } from "./model";
import type { Company } from "./types";

/** Group bounds the company universe; stale marks resolve on read. */
export function companySelection(
  companies: readonly Company[],
  groupMark: string,
  companyMark: string,
) {
  const allCompanies = companies.map((company) => {
    const v = working(company);
    return {
      value: company.id,
      label: v.name || "Sin nombre",
      group: v.group.trim(),
      keywords: [v.ruc, v.group],
    };
  });
  const groups = [...new Set(allCompanies.map((c) => c.group).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es"))
    .map((group) => ({ value: group, label: group }));
  const groupId = groups.some((g) => g.value === groupMark) ? groupMark : "";
  const options = allCompanies.filter((c) => !groupId || c.group === groupId);
  return {
    groups,
    options,
    groupId,
    companyId: options.some((c) => c.value === companyMark) ? companyMark : "",
  };
}
