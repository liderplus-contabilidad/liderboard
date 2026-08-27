"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { BookText, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { TabBar, type TabBarItem } from "@/components/ui/tab-bar";
import { listEmployees } from "@/lib/payroll/db";
import { computeLinePayroll } from "@/lib/payroll/employee-input";
import { DEFAULT_PAYROLL_PARAMETERS } from "@/lib/payroll/engine/parameters";
import { buildJournalEntry } from "@/lib/payroll/journal";
import { journalAmountsFor } from "@/lib/payroll/journal-amounts";
import { downloadPayslipZip } from "@/lib/payroll/payslip/download";
import { buildPeriodPayslips } from "@/lib/payroll/payslip/period";
import {
  computePeriodFinancials,
  computeReconciliationCounts,
  matchesEmployeeSearch,
} from "@/lib/payroll/period-detail";
import { adjacentPeriod } from "@/lib/payroll/periods";
import type { PayrollEmployeeLine } from "@/lib/payroll/types";
import { DeletePeriodDialog } from "../delete-period-dialog";
import { usePayrollData } from "../payroll-data-provider";
import { EmployeeTable } from "./employee-table";
import { JournalEntryCard } from "./journal-entry-card";
import { PayrollExcelActions } from "./payroll-excel-actions";
import { PeriodHeader } from "./period-header";
import { PeriodKpiCard } from "./period-kpi-card";
import { PeriodNotFound } from "./period-not-found";
import { PeriodParameters } from "./period-parameters";

const EMPTY_LINES: PayrollEmployeeLine[] = [];
/** Stable between renders: a fresh `[]` each time would invalidate the `useMemo`s that carry it in
 *  their dependencies, and with them the screen's whole rol. */

type DetailTab = "empleados" | "asiento";

/** The SAME tab bar as the other modules' Datos · Gráficos · Análisis (`TabBar`), not a
 *  `SegmentedControl`: in this app that control means choosing how ONE card is seen (Ocupaciones'
 *  «Ver por», Análisis' «Base»), and this changes view. */
const TABS: TabBarItem<DetailTab>[] = [
  { id: "empleados", label: "Empleados", icon: Users },
  { id: "asiento", label: "Asiento contable", icon: BookText },
];

const TAB_ID_PREFIX = "payroll-period";

/**
 * A período's screen: `/payroll/[periodId]`. Everything it reads comes either from the
 * `PayrollDataProvider` (the open client's períodos, for the ‹ › navigator and for deleting) or from
 * a read of its own nómina — `listEmployees(periodId)` takes no `clientId` because `periodId` is
 * already unique on its own, but the screen never RENDERS until it has confirmed that período is in
 * the active client's list, so no data of another client ever gets painted.
 *
 * Every figure comes from the ENGINE, computed just once here and handed out: the KPIs, the table and
 * the payslips read the same `rows`, so they cannot disagree. A nómina with no file loaded at all
 * renders just as complete — the record declares the salary and what is not captured is really worth
 * zero (see `toEngineInput`) —, and the only thing left empty with no data is the reconciliation,
 * which needs someone to declare what was PAID.
 */
export function PeriodDetailView({ periodId }: { periodId: string }) {
  const router = useRouter();
  const { activeClient, activeClientId, periods, ready, deletePeriod } = usePayrollData();
  const lines = useLiveQuery(() => listEmployees(periodId), [periodId]) ?? EMPTY_LINES;

  const [tab, setTab] = useState<DetailTab>("empleados");
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  const period = periods.find((candidate) => candidate.id === periodId) ?? null;
  const prev = period ? adjacentPeriod(periods, period.id, "prev") : null;
  const next = period ? adjacentPeriod(periods, period.id, "next") : null;

  // Each line's rol, computed ONCE for the whole screen. Everything below derives from here — KPIs,
  // table and payslips —, which is what guarantees the three of them say the same thing. The extra
  // concepts belong to the PERÍODO —a column of the rol, not a decision of each employee—, so they
  // travel apart from the record and reach the three readings below by the same path.
  const rows = useMemo(
    () =>
      lines.map((line) => ({
        line,
        computed: computeLinePayroll(line, DEFAULT_PAYROLL_PARAMETERS),
      })),
    [lines],
  );
  const computations = useMemo(() => rows.map((row) => row.computed), [rows]);
  const financials = useMemo(() => computePeriodFinancials(computations), [computations]);
  const reconciliation = useMemo(() => computeReconciliationCounts(computations), [computations]);
  const visibleRows = useMemo(
    () => rows.filter((row) => matchesEmployeeSearch(row.line, search)),
    [rows, search],
  );
  // The journal entry comes out of the período's nómina, summed by `journal-amounts.ts` through the
  // engine. `lines` in the dependencies is not ceremony: with the empty array the mock had, the entry
  // would be frozen on the first render and would not move on correcting an advance.
  // `.oxlintrc.json` only puts `correctness` in error, so `react-hooks/exhaustive-deps` is not there
  // to catch it.
  const journalEntry = useMemo(
    () => buildJournalEntry(journalAmountsFor(lines, DEFAULT_PAYROLL_PARAMETERS)),
    [lines],
  );

  /**
   * The payslips of the whole nómina, one per page and in the order the table reads.
   *
   * `buildPeriodPayslips` is the SAME builder the history row uses, which downloads this same .zip
   * without opening the período. Nothing is persisted — every figure comes out of the engine at this
   * instant.
   */
  const [downloading, setDownloading] = useState(false);
  const downloadPayslipsForPeriod = useCallback(async () => {
    if (!period || lines.length === 0) {
      return;
    }
    setDownloading(true);
    try {
      await downloadPayslipZip(
        buildPeriodPayslips({
          period,
          lines,
          parameters: DEFAULT_PAYROLL_PARAMETERS,
          clientName: activeClient?.name ?? "",
          ...(activeClient?.logo ? { clientLogo: activeClient.logo } : {}),
          ...(activeClient?.company ? { clientCompany: activeClient.company } : {}),
          ...(activeClient?.costCenter ? { clientCostCenter: activeClient.costCenter } : {}),
        }),
        period,
      );
    } finally {
      setDownloading(false);
    }
  }, [
    activeClient?.name,
    activeClient?.logo,
    activeClient?.company,
    activeClient?.costCenter,
    lines,
    period,
  ]);

  const confirmDelete = useCallback(async () => {
    if (!period) {
      return;
    }
    setBusy(true);
    try {
      await deletePeriod(period.id);
      router.push("/payroll");
    } finally {
      setBusy(false);
      setDeleting(false);
    }
  }, [period, deletePeriod, router]);

  // Before the first read from Dexie it is not known whether the período exists: waiting avoids the
  // «does not exist» empty state flickering over a período that is actually there.
  if (!ready) {
    return null;
  }

  if (activeClientId === null || !period) {
    return <PeriodNotFound />;
  }

  return (
    <div>
      <div className="px-7 pt-5">
        <PeriodHeader
          period={period}
          periods={periods}
          prev={prev}
          next={next}
          employeeCount={lines.length}
          financials={financials}
          onDelete={() => setDeleting(true)}
          onDownloadPayslips={() => void downloadPayslipsForPeriod()}
          downloading={downloading}
        />

        <PeriodKpiCard
          employeeCount={lines.length}
          reconciliation={reconciliation}
          financials={financials}
        />
      </div>

      <TabBar
        items={TABS}
        value={tab}
        onChange={setTab}
        ariaLabel="Vistas del período"
        idPrefix={TAB_ID_PREFIX}
        className="px-7 pt-[18px]"
        rightSlot={
          tab === "empleados" ? (
            <PayrollExcelActions
              period={period}
              periods={periods}
              lines={lines}
              clientName={activeClient?.name ?? ""}
              {...(activeClient?.logo ? { clientLogo: activeClient.logo } : {})}
              {...(activeClient?.company ? { clientCompany: activeClient.company } : {})}
              {...(activeClient?.costCenter ? { clientCostCenter: activeClient.costCenter } : {})}
            />
          ) : null
        }
      />

      <div
        id={`${TAB_ID_PREFIX}-panel`}
        role="tabpanel"
        aria-labelledby={`${TAB_ID_PREFIX}-tab-${tab}`}
        className="px-7 py-5"
      >
        {tab === "empleados" ? (
          <>
            <PeriodParameters />
            <EmployeeTable
              period={period}
              lines={lines}
              visibleRows={visibleRows}
              search={search}
              onSearchChange={setSearch}
            />
          </>
        ) : (
          <JournalEntryCard
            entry={journalEntry}
            year={period.year}
            monthIndex={period.monthIndex}
          />
        )}
      </div>

      {deleting && (
        <DeletePeriodDialog
          period={period}
          employeeCount={lines.length}
          busy={busy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(false)}
        />
      )}
    </div>
  );
}
