"use client";

import { useMemo, type ReactNode } from "react";
import { SidePanel } from "@/components/ui/side-panel";
import { periodNoun, buildAccountDetail } from "@/lib/profit-loss/charts/account-detail";
import {
  expenseRootsOf,
  presetQuery,
  REVENUE_ROOT,
  sumOver,
} from "@/lib/profit-loss/charts/presets";
import { barOption, seriesTable } from "@/lib/profit-loss/charts/option";
import { codeColorResolver } from "@/lib/profit-loss/charts/selection";
import { formatCurrency, formatPercent } from "@/lib/format";
import { ChartCard } from "@/components/ui/chart-card";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { usePygAnalytics } from "./pyg-analytics-provider";
import { usePygData } from "./pyg-data-provider";

/** What a metric that does not apply looks like. Never `0`, never an empty cell. */
const DASH = "—";

/** Below two periods there is no shape to draw — the metrics already say everything. */
const MIN_CHART_PERIODS = 2;

/**
 * The ficha of one account: how it behaved across every period the file actually covers.
 *
 * It asks the SAME engine the Gráficos tab asks — one query for one account — instead of
 * re-reading the table's grid. That is what makes "2 de 7" mean "two of the seven months the
 * business reported" and what hands over the rolled-up parent that the weight metric divides
 * by. Every rule behind the numbers lives in `buildAccountDetail`; this file only formats them.
 */
export function AccountDetailPanel({ code, onClose }: { code: string; onClose: () => void }) {
  const { dataset } = usePygData();
  const { sources, context, runQuery } = usePygAnalytics();

  const bundle = useMemo(
    () =>
      runQuery({
        codes: [code],
        centerIds: [context.activeCenterId],
        years: [context.year],
        frequency: context.frequency,
        limit: 1,
      }),
    [runQuery, code, context.activeCenterId, context.year, context.frequency],
  );

  const source = sources.find((candidate) => candidate.centerId === context.activeCenterId);

  // Los dos totales del estado sobre el MISMO tramo que la serie de arriba, para el peso de la
  // cuenta sobre el gasto y sobre el ingreso. Van en su propia consulta porque son raíces y no la
  // cuenta abierta, y por el mismo camino que todo lo demás — el rollup del motor y nunca la suma
  // de lo que haya en pantalla, que es la regla que ya sigue el peso sobre el padre.
  const totals = useMemo(() => {
    if (!source) {
      return undefined;
    }
    const roots = expenseRootsOf(source);
    const bundle = runQuery(presetQuery([REVENUE_ROOT, ...roots], context));
    const parts = roots.map((root) => sumOver(bundle, root));
    return {
      revenue: sumOver(bundle, REVENUE_ROOT),
      // Un estado segmentado tiene DOS raíces de gasto; sin cobertura en ninguna sigue siendo
      // `null`, que es distinto de un gasto de cero.
      expenses: parts.every((value) => value === null)
        ? null
        : parts.reduce((sum: number, value) => sum + (value ?? 0), 0),
    };
  }, [runQuery, source, context]);

  const series = bundle.series[0];
  const detail =
    series && source
      ? buildAccountDetail({ series, source, frequency: context.frequency, totals })
      : null;

  // One account is one entity, so it takes the first palette slot through the same resolver
  // every other card uses — the ficha never names a color of its own.
  const colorOf = useMemo(() => codeColorResolver([code]), [code]);
  const chart = useMemo(() => {
    if (!series || bundle.periods.length < MIN_CHART_PERIODS) {
      return null;
    }
    // No direct labels: twelve monthly figures overlap into noise. The value reads on hover.
    const chartContext = { colorOf, periods: bundle.periods, labels: false };
    return {
      option: barOption([series], chartContext),
      table: seriesTable([series], chartContext),
    };
  }, [series, bundle.periods, colorOf]);

  const one = periodNoun(context.frequency, { singular: true });
  const many = periodNoun(context.frequency);

  return (
    <SidePanel
      label={detail ? `Ficha de ${detail.name}` : "Ficha de cuenta"}
      eyebrow={
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[11px] font-semibold text-brand">{code}</span>
          {detail?.path.map((name, index) => (
            <span key={index} className="flex items-center gap-2 text-faintest">
              <span aria-hidden>•</span>
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-muted">
                {name}
              </span>
            </span>
          ))}
        </div>
      }
      title={detail?.name ?? code}
      onClose={onClose}
    >
      {bundle.warnings.length > 0 && (
        <NoticeBanner
          className="mb-4"
          details={bundle.warnings.length > 1 ? bundle.warnings : undefined}
        >
          {bundle.warnings.length === 1
            ? bundle.warnings[0]
            : "La cuenta no se pudo leer completa."}
        </NoticeBanner>
      )}

      {detail && (
        <>
          <dl className="mb-5">
            <Metric label="Total del año">{formatCurrency(detail.total, { cents: true })}</Metric>

            <Metric label={`${many} con movimiento`}>
              {detail.activePeriods} de {detail.coveredPeriods}
            </Metric>

            <Metric label={`Promedio de ${many.toLowerCase()} activos`}>
              {detail.averageActive === null
                ? DASH
                : formatCurrency(detail.averageActive, { cents: true })}
            </Metric>

            <Metric label={`${one} más alto`}>
              {detail.best === null ? (
                DASH
              ) : (
                <>
                  {detail.best.label}
                  <span className="text-faintest"> · </span>
                  {formatCurrency(detail.best.value, { cents: true })}
                </>
              )}
            </Metric>

            {detail.shareOfContainer !== null && (
              <Metric label={`% de ${detail.containerLabel}`}>
                {formatPercent(detail.shareOfContainer)}
              </Metric>
            )}

            {/* Los dos pesos sobre el ESTADO, no sobre el padre. Van después del peso en el padre
                porque se leen en ese orden —dentro de su rama, luego dentro del negocio— y solo
                aparecen cuando su denominador da base: un `–` aquí no distinguiría «no pesa» de
                «no hay contra qué medirlo». */}
            {detail.shareOfExpenses !== null && (
              <Metric label="% del total de costos y gastos">
                {formatPercent(detail.shareOfExpenses)}
              </Metric>
            )}

            {detail.shareOfRevenue !== null && (
              <Metric label="% del total de ingresos">
                {formatPercent(detail.shareOfRevenue)}
              </Metric>
            )}

            <Metric label="Nivel en el plan">
              {detail.level}
              <span className="text-faintest"> · </span>
              <span className="text-muted">{detail.imputable ? "imputable" : "agrupadora"}</span>
            </Metric>
          </dl>

          {chart ? (
            <ChartCard
              title={`Movimiento por ${one.toLowerCase()}`}
              subtitle={dataset?.periodLabel}
              option={chart.option}
              table={chart.table}
              height={190}
              tableToggle={false}
            />
          ) : (
            <p className="text-[11.5px] leading-snug text-faint">
              La vista anual tiene un solo periodo: no hay evolución que dibujar.
            </p>
          )}
        </>
      )}
    </SidePanel>
  );
}

/** One label/value line. `<dl>` because that is exactly what these pairs are. */
function Metric({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border-faint py-2.5">
      <dt className="min-w-0 text-[12.5px] leading-snug text-muted">{label}</dt>
      <dd className="shrink-0 font-mono text-[13px] tabular-nums text-ink">{children}</dd>
    </div>
  );
}
