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
import { downloadPayslips, payslipBatchFilename } from "@/lib/payroll/payslip/download";
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
/** Estable entre renders: un `[]` nuevo cada vez invalidaría los `useMemo` que lo llevan en las
 *  dependencias, y con ellos el rol entero de la pantalla. */

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
 * Todas las cifras salen del MOTOR, calculadas una sola vez aquí y repartidas: los KPIs, la tabla
 * y los comprobantes leen el mismo `rows`, así que no pueden discrepar. Una nómina sin ningún
 * archivo cargado rinde igual de completa — la ficha declara el sueldo y lo no capturado vale cero
 * de verdad (ver `toEngineInput`) —, y lo único que queda vacío sin datos es la conciliación, que
 * necesita que alguien declare lo PAGADO.
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

  // El rol de cada línea, calculado UNA vez para toda la pantalla. Todo lo de abajo se deriva de
  // aquí — KPIs, tabla y comprobantes —, que es lo que garantiza que las tres cosas digan lo mismo.
  // Los conceptos extra son del PERÍODO —una columna del rol, no una decisión de cada empleado—,
  // así que viajan aparte de la ficha y llegan a las tres lecturas de abajo por el mismo camino.
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
  // El asiento sale de la nómina del período, sumada por `journal-amounts.ts` a través del motor.
  // `lines` en las dependencias no es ceremonia: con el array vacío que tenía el mock, el asiento
  // quedaría congelado en el primer render y no se movería al corregir un anticipo.
  // `.oxlintrc.json` solo pone en error `correctness`, así que `react-hooks/exhaustive-deps` no
  // está para atraparlo.
  const journalEntry = useMemo(
    () => buildJournalEntry(journalAmountsFor(lines, DEFAULT_PAYROLL_PARAMETERS)),
    [lines],
  );

  /**
   * Los comprobantes de la nómina entera, uno por página y en el orden en que se lee la tabla.
   *
   * `buildPeriodPayslips` es el MISMO constructor que usa la fila del historial, que baja este PDF
   * sin abrir el período. Nada se persiste — cada cifra sale del motor en este instante.
   */
  const [downloading, setDownloading] = useState(false);
  const downloadPayslipsForPeriod = useCallback(async () => {
    if (!period || lines.length === 0) {
      return;
    }
    setDownloading(true);
    try {
      await downloadPayslips(
        buildPeriodPayslips({
          period,
          lines,
          parameters: DEFAULT_PAYROLL_PARAMETERS,
          clientName: activeClient?.name ?? "",
          ...(activeClient?.logo ? { clientLogo: activeClient.logo } : {}),
          ...(activeClient?.company ? { clientCompany: activeClient.company } : {}),
          ...(activeClient?.costCenter ? { clientCostCenter: activeClient.costCenter } : {}),
        }),
        payslipBatchFilename(period.year, period.monthIndex),
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
