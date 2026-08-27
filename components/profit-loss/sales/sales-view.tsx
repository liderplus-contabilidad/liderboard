"use client";

import {
  Building2,
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Info,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChartCard } from "@/components/ui/chart-card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/ui/stat-tile";
import { useCollapsedCards } from "@/components/ui/use-collapsed-cards";
import { cn } from "@/lib/cn";
import { formatCurrency, formatNumber } from "@/lib/format";
import { PygEmptyState } from "../pyg-empty-state";
import { SalesDataProvider, useSalesData } from "./sales-data-provider";
import { SalesExcelActions } from "./sales-excel-actions";
import { SalesReportButton } from "./report/sales-report-button";
import { SalesToolbar } from "./sales-toolbar";

/**
 * «Ventas por servicio»: qué facturó la clínica, repartido por servicio, por pagador y por mes.
 *
 * Todo lo que enseña es DERIVADO y nada se guarda: lo único persistido son las líneas de factura
 * que trajo cada Excel, y las tres lecturas se recalculan en cada render — la misma regla por la
 * que Rol de Pagos no persiste ni un total.
 */
export function SalesView() {
  return (
    <SalesDataProvider>
      <SalesContent />
    </SalesDataProvider>
  );
}

function SalesContent() {
  const {
    clientId,
    isConsolidated,
    ready,
    months,
    reading,
    cards,
    periodName,
    universe,
    hideEmptyMonths,
    toggleEmptyMonths,
  } = useSalesData();
  const [uploadOpen, setUploadOpen] = useState(false);

  const cardIds = useMemo(
    () => [cards.services.id, cards.payers.id, cards.evolution.id],
    [cards.services.id, cards.payers.id, cards.evolution.id],
  );
  const { isCollapsed, toggle, allCollapsed, toggleAll } = useCollapsedCards(cardIds);

  // Antes de la primera lectura de Dexie no se sabe si hay meses: esperar evita el parpadeo del
  // vacío sobre un cliente que en realidad ya tiene su año cargado.
  if (!ready) {
    return null;
  }

  // El consolidado NO es un cliente sino la suma de todos, y lo que suma son estados de
  // resultados. Su hueco no se llena con un archivo —cargar aquí escribiría en una partición que
  // no es de nadie—, así que dice qué elegir en vez de ofrecer «Cargar Excel».
  if (isConsolidated) {
    return (
      <div className="px-7 py-20">
        <EmptyState icon={<Building2 size={22} />} className="py-0">
          El consolidado entre clientes suma estados de resultados, no facturación. Elige un cliente
          en el selector de la cabecera para ver sus ventas por servicio.
        </EmptyState>
      </div>
    );
  }

  // Sin cliente el vacío nombra el paso que falta, que es de PyG y no de esta pantalla.
  if (clientId === null) {
    return <PygEmptyState />;
  }

  const empty = months.length === 0;

  return (
    <div className="px-7 py-5">
      <div className="mb-4 flex items-start justify-between gap-4 rounded-[13px] border border-border bg-surface px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold tracking-[-0.2px] text-ink">Ventas por servicio</h2>
          <p className="mt-0.5 text-[12.5px] text-faint">
            Lo que el sistema contable facturó, repartido por servicio y por quién lo paga.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <SalesExcelActions open={uploadOpen} onOpenChange={setUploadOpen} />
          <SalesReportButton />
        </div>
      </div>

      {empty ? (
        <div className="rounded-[13px] border border-border bg-surface">
          <EmptyState icon={<FileSpreadsheet size={22} />} className="py-16">
            Este cliente no tiene ningún mes de ventas cargado. Sube el Excel «Venta de Servicios
            por FACTURA» del mes con «Cargar Excel».
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <SalesToolbar />
          </div>

          <div className="mb-4 grid grid-cols-4 gap-4">
            <StatTile
              label="Venta total"
              value={formatCurrency(reading.totals.amount, { cents: true })}
              hint={periodName}
              mono
            />
            <StatTile
              label="Líneas facturadas"
              value={formatNumber(reading.totals.lineCount)}
              hint={periodName}
              mono
            />
            <StatTile
              label="Ticket promedio"
              value={
                reading.totals.averageTicket === null
                  ? null
                  : formatCurrency(reading.totals.averageTicket, { cents: true })
              }
              hint="Por línea de factura"
              mono
            />
            <StatTile
              label="Pagadores"
              value={formatNumber(reading.totals.payerCount)}
              hint="Aseguradoras y particulares"
              mono
            />
          </div>

          <div className="mb-4 flex items-center">
            <Button
              size="sm"
              variant="secondary"
              onClick={toggleAll}
              icon={allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
              className="font-medium"
            >
              {allCollapsed ? "Desplegar todos" : "Cerrar todos"}
            </Button>
          </div>

          <div className="flex flex-col gap-4">
            <ChartCard
              {...cards.services}
              collapsed={isCollapsed(cards.services.id)}
              onToggleCollapsed={() => toggle(cards.services.id)}
            />
            <ChartCard
              {...cards.payers}
              collapsed={isCollapsed(cards.payers.id)}
              onToggleCollapsed={() => toggle(cards.payers.id)}
            />
            <ChartCard
              {...cards.evolution}
              collapsed={isCollapsed(cards.evolution.id)}
              onToggleCollapsed={() => toggle(cards.evolution.id)}
              {...(cards.emptyMonths > 0
                ? {
                    headerSlot: (
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-pressed={hideEmptyMonths}
                        onClick={toggleEmptyMonths}
                        icon={hideEmptyMonths ? <Eye size={14} /> : <EyeOff size={14} />}
                        className={cn(
                          "font-medium",
                          hideEmptyMonths &&
                            "border-brand/40 bg-brand-soft text-brand hover:bg-brand-soft",
                        )}
                      >
                        {hideEmptyMonths
                          ? `Mostrar ${cards.emptyMonths} ${cards.emptyMonths === 1 ? "mes" : "meses"} en 0`
                          : "Ocultar meses en 0"}
                      </Button>
                    ),
                  }
                : {})}
            />
          </div>

          <BillingDisclaimer />

          {universe.months.length === 0 && (
            <p className="mt-3 text-[12px] text-faint">
              Los años marcados no tienen ningún mes cargado. Marca otro en «Año», o sube su Excel.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * **Lo facturado NO es lo contabilizado**, y la pantalla lo dice.
 *
 * Los $229.616 de un abril facturado no son los ingresos contables de abril: hay tiempos de
 * reconocimiento, notas de crédito e IVA de por medio. Dos cifras de ingreso que no cuadran en la
 * misma app no se leen como dos fuentes, se leen como un error — así que estas ventas no entran en
 * ninguna lectura de PyG, y ese silencio hay que declararlo donde se produce. Conciliar las dos es
 * una lectura legítima, y va aparte.
 */
function BillingDisclaimer() {
  return (
    <p className="mt-4 flex items-start gap-2 rounded-[10px] border border-border-soft bg-surface-sunken px-3.5 py-2.5 text-[11.5px] leading-snug text-muted">
      <Info size={14} className="mt-px shrink-0 text-faint" aria-hidden />
      <span>
        Lo facturado no es lo contabilizado. Estas cifras salen del reporte de facturación y{" "}
        <strong className="font-semibold text-ink-soft">
          no entran en el estado de resultados
        </strong>
        : el ingreso contable del mes difiere por tiempos de reconocimiento, notas de crédito e IVA.
        Pérdidas y Ganancias dibuja exactamente lo mismo con ventas cargadas y sin ellas.
      </span>
    </p>
  );
}
