"use client";

import { useEffect, useId, useState } from "react";
import {
  COMPANY_TAX_LABELS,
  COMPANY_TAX_REGIMES,
  companyTaxProfile,
  companyTaxSourceNote,
} from "@/lib/operations/company-tax";
import { patchCompanyTax } from "@/lib/operations/db";
import type { Company, CompanyTaxValues } from "@/lib/operations/types";
import { InlineField } from "./inline-field";
import { useOperations } from "./operations-provider";
import { SELECT_CLASS } from "./table-chrome";

const FLAGS = [
  "isCompany",
  "keepsAccounting",
  "withholdingAgent",
  "zeroDeclaration",
  "zeroFourteenthDeclaration",
  "dualActivity",
] as const;
export function CompanyTaxFields({ company }: { company: Company }) {
  const ops = useOperations();
  const [draft, setDraft] = useState<Partial<CompanyTaxValues>>({});
  const values = { ...companyTaxProfile(company), ...draft };
  const [busy, setBusy] = useState(false);
  const id = useId();
  useEffect(() => {
    const saved = companyTaxProfile(company);
    setDraft((current) => {
      const remaining = Object.fromEntries(
        Object.entries(current).filter(
          ([property, value]) => saved[property as keyof CompanyTaxValues] !== value,
        ),
      );
      return Object.keys(remaining).length === Object.keys(current).length ? current : remaining;
    });
  }, [company]);
  const save = async (patch: Partial<CompanyTaxValues>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setBusy(true);
    try {
      await ops.save(() => patchCompanyTax(company.id, patch));
    } finally {
      setBusy(false);
    }
  };
  if (company.detailsPending) return null;
  return (
    <>
      <label className="block text-[13px] font-medium text-ink-soft">
        Régimen SRI
        <select
          aria-label="Régimen SRI"
          className={`${SELECT_CLASS} mt-2 w-full`}
          value={values.regime}
          disabled={busy}
          onChange={(event) =>
            void save({ regime: event.target.value as CompanyTaxValues["regime"] }).catch(() => {})
          }
        >
          <option value="">Sin especificar</option>
          {values.regime === "multiple" && (
            <option value="multiple" disabled>
              Varias marcas en el Excel
            </option>
          )}
          {COMPANY_TAX_REGIMES.map((regime) => (
            <option key={regime.value} value={regime.value}>
              {regime.label}
            </option>
          ))}
        </select>
        {companyTaxSourceNote(company, "regime") && (
          <span className="mt-1 block text-[12px] font-normal text-muted">
            Excel: {companyTaxSourceNote(company, "regime")}
          </span>
        )}
      </label>
      <label htmlFor={`${id}-income`} className="block text-[13px] font-medium text-ink-soft">
        Periodicidad ING
        <InlineField
          id={`${id}-income`}
          appearance="field"
          className="mt-2 font-normal"
          label="Periodicidad ING"
          value={values.incomePeriodicity}
          onCommit={(incomePeriodicity) => save({ incomePeriodicity })}
        />
      </label>
      <div className="col-span-2 grid grid-cols-2 gap-x-7 gap-y-3">
        {FLAGS.map((flag) => (
          <label
            key={flag}
            className="flex min-h-[38px] cursor-pointer items-start gap-3 rounded-[9px] border border-border px-3 py-2.5 text-[13px] text-ink-soft hover:border-brand/40 focus-within:ring-2 focus-within:ring-brand-soft"
          >
            <input
              type="checkbox"
              aria-label={COMPANY_TAX_LABELS[flag]}
              checked={values[flag]}
              disabled={busy}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand disabled:cursor-wait"
              onChange={(event) => void save({ [flag]: event.target.checked }).catch(() => {})}
            />
            <span>
              {COMPANY_TAX_LABELS[flag]}
              {companyTaxSourceNote(company, flag) && (
                <span className="mt-1 block text-[12px] text-muted">
                  Excel: {companyTaxSourceNote(company, flag)}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </>
  );
}
