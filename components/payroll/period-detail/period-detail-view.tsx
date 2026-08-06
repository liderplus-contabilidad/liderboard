"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { BookText, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { TabBar, type TabBarItem } from "@/components/ui/tab-bar";
import { listEmployees } from "@/lib/payroll/db";
import { buildJournalEntry } from "@/lib/payroll/journal";
import { JOURNAL_MOCK_AMOUNTS } from "@/lib/payroll/journal-mock";
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

type DetailTab = "empleados" | "asiento";

/** La MISMA barra de pestañas que Datos · Gráficos · Análisis de los otros módulos (`TabBar`), no
 *  un `SegmentedControl`: en esta app ese control significa elegir cómo se ve UNA tarjeta (el «Ver
 *  por» de Ocupaciones, el «Base» de Análisis), y esto cambia de vista. */
const TABS: TabBarItem<DetailTab>[] = [
  { id: "empleados", label: "Empleados", icon: Users },
  { id: "asiento", label: "Asiento contable", icon: BookText },
];

const TAB_ID_PREFIX = "payroll-period";

/**
 * La pantalla de un período: `/payroll/[periodId]`. Todo lo que lee viene o del `PayrollDataProvider`
 * (períodos del cliente abierto, para el navegador ‹ › y el borrado) o de una lectura propia de su
 * nómina — `listEmployees(periodId)` no toma `clientId` porque `periodId` ya es único por sí solo,
 * pero la pantalla nunca la RINDE hasta confirmar que ese período está en la lista del cliente
 * activo, así que ningún dato de otro cliente llega a pintarse.
 *
 * Con datos o sin ellos rinde igual: la carga del Excel llena las `figures` de cada línea, y sin
 * ellas la pantalla lee su ausencia como «no hay» y no como cero (KPIs en raya, celdas en guion).
 */
export function PeriodDetailView({ periodId }: { periodId: string }) {
  const router = useRouter();
  const { activeClientId, periods, ready, deletePeriod } = usePayrollData();
  const lines = useLiveQuery(() => listEmployees(periodId), [periodId]) ?? EMPTY_LINES;

  const [tab, setTab] = useState<DetailTab>("empleados");
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  const period = periods.find((candidate) => candidate.id === periodId) ?? null;
  const prev = period ? adjacentPeriod(periods, period.id, "prev") : null;
  const next = period ? adjacentPeriod(periods, period.id, "next") : null;

  const financials = useMemo(() => computePeriodFinancials(lines), [lines]);
  const reconciliation = useMemo(() => computeReconciliationCounts(lines), [lines]);
  const visibleLines = useMemo(
    () => lines.filter((line) => matchesEmployeeSearch(line, search)),
    [lines, search],
  );
  // La costura con las cifras reales: cuando el asiento se alimente del período abierto, el
  // único cambio es el argumento de `buildJournalEntry` — ni la tarjeta ni la fila se enteran.
  // OJO al hacer esa costura: si el argumento pasa a derivarse de `lines`, este array de
  // dependencias tiene que dejar de estar vacío, o el asiento queda congelado en el primer
  // render. `.oxlintrc.json` solo pone en error `correctness`, así que `react-hooks/exhaustive-
  // deps` no está para atraparlo.
  const journalEntry = useMemo(() => buildJournalEntry(JOURNAL_MOCK_AMOUNTS), []);

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

  // Antes de la primera lectura de Dexie no se sabe si el período existe: esperar evita el
  // parpadeo del vacío «no existe» sobre un período que en realidad sí está.
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
            <PayrollExcelActions period={period} periods={periods} employeeCount={lines.length} />
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
              lines={lines}
              visibleLines={visibleLines}
              search={search}
              onSearchChange={setSearch}
            />
          </>
        ) : (
          <JournalEntryCard
            entry={journalEntry}
            year={period.year}
            monthIndex={period.monthIndex}
            sample
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
