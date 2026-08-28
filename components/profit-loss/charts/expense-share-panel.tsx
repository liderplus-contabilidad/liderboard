"use client";

import { Fragment, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { ChartCard } from "@/components/ui/chart-card";
import { Modal } from "@/components/ui/modal";
import { CHART_SECTION } from "@/lib/charts/palette";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";
import {
  describeAccountBreakdown,
  type AccountBreakdown,
} from "@/lib/profit-loss/charts/account-breakdown";
import {
  breakdownTable,
  horizontalBarOption,
  shareOfTotalOption,
  shareOfTotalTable,
  type ShareOfTotalRow,
} from "@/lib/profit-loss/charts/option";

/**
 * The breakdown's label channel, wider than the ranking's 150 px because the window was made wide for
 * exactly this: a real account name («Honorarios Profesionales Laboratorio-Externos») does not fit in
 * 150 and comes out truncated, and then the rows can only be told apart by opening the table — which
 * is asking the reader for the work the chart exists to spare them.
 */
const BREAKDOWN_LABEL = 260;

/** One leg of the open path: what the window needs in order to talk about an account. */
export interface AccountStep {
  code: string;
  label: string;
  value: number;
}

/**
 * ONE ACCOUNT OF THE ANNEX, on clicking its bar: what it is measured against and what it is made of.
 *
 * It opens from the chart and not from a list because both questions are born looking at it: you see
 * the tallest bar and the next thing you want to know is how much of the whole expense that bar is and
 * what makes it up. It goes in a CENTRED window and not in the ficha's side drawer, and that is
 * decided by the shape of what it shows: the drawer exists to be read NEXT TO what opened it —the
 * ficha against its row of the table—, whereas this is read ALONE and closed straight away, so
 * interrupting and dimming the background is the right thing. Besides, the drawer would land right on
 * top of the annex's bars, which are wide, and would cover the one just clicked.
 *
 * It does NOT repeat the figures already in the chart behind: the bar that was clicked carries its
 * amount above it. What it adds are the two WHOLES that amount is measured against —what a bar inside
 * a breakdown cannot say on its own— and the next level of the chart of accounts.
 *
 * **You go DOWN here and not in the chart behind**, which is what keeps it being the annex: its
 * seventeen rows are the sheet the accountant checks against, and replacing them on clicking one would
 * cost the comparison that was being made. The path can have several legs —`5.5.01.02` hangs
 * twenty-seven sections and each one its accounts— and the breadcrumb at the top is the way back.
 */
export function ExpenseSharePanel({
  path,
  breakdown,
  totalExpenses,
  totalRevenue,
  periodName,
  onOpen,
  onBack,
  onClose,
}: {
  /** The open path, from the annex's line inwards. The last leg is what is shown. */
  path: readonly AccountStep[];
  /** The last leg's breakdown, or `null` while there is nothing to break down. */
  breakdown: AccountBreakdown | null;
  totalExpenses: number | null;
  totalRevenue: number | null;
  periodName: string;
  onOpen: (step: AccountStep) => void;
  onBack: (depth: number) => void;
  onClose: () => void;
}) {
  const current = path[path.length - 1];
  const chart = useMemo(() => {
    const rows: ShareOfTotalRow[] = [
      { id: "gastos", label: "Sobre los gastos", value: current.value, total: totalExpenses },
      { id: "ingresos", label: "Sobre los ingresos", value: current.value, total: totalRevenue },
    ];
    const drawable = rows.filter((row) => row.total !== null && row.total !== 0);
    if (drawable.length === 0) {
      return null;
    }
    // The colour is given by the BLOCK it is measured against and not by the line: it is what says at
    // a glance which of the two bars talks about expenses and which about revenue, the rule of
    // `CHART_SECTION`.
    const colorOf = (id: string) => (id === "ingresos" ? CHART_SECTION.income : CHART_SECTION.cost);
    return {
      option: shareOfTotalOption(drawable, { colorOf }),
      table: shareOfTotalTable(drawable, { colorOf }),
      rows: drawable.length,
    };
  }, [current.value, totalExpenses, totalRevenue]);

  const desglose = useMemo(() => {
    if (!breakdown || breakdown.rows.length === 0) {
      return null;
    }
    // ONE single colour, the annex's rule: each bar carries its label and its figure, so handing out
    // hues would spend the identity channel re-saying what the length already says.
    const colorOf = () => CHART_SECTION.cost;
    return {
      // The label channel wins over the bar's: here the rows are ACCOUNT NAMES («Honorarios
      // Profesionales Laboratorio-Externos»), not the two short, familiar labels of «Peso en el
      // estado», and truncated they force opening the table to know which is which.
      option: horizontalBarOption([...breakdown.rows], { colorOf, labelWidth: BREAKDOWN_LABEL }),
      table: breakdownTable(breakdown.all, current.label),
      note: describeAccountBreakdown(breakdown, {
        label: current.label,
        format: (value) => formatCurrency(value, { cents: true }),
      }),
      height: breakdown.rows.length * 34 + 40,
    };
  }, [breakdown, current.label]);

  return (
    <Modal
      open
      title={current.label}
      eyebrow={
        <span className="font-mono text-[11px] font-semibold text-brand">{current.code}</span>
      }
      onClose={onClose}
      width={780}
    >
      {/* The breadcrumb only appears once you have gone down: with one leg it would be a label
          repeating the title. Each previous leg goes back to its level; the current one is text, not a
          button that leads nowhere. */}
      {path.length > 1 && (
        <nav className="mb-3 flex flex-wrap items-center gap-1 text-[11.5px] leading-snug">
          {path.map((step, index) => (
            <Fragment key={step.code}>
              {index > 0 && <ChevronRight className="size-3 shrink-0 text-faintest" />}
              {index === path.length - 1 ? (
                <span className="truncate font-semibold text-ink">{step.label}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onBack(index + 1)}
                  className="truncate rounded text-muted transition-colors hover:text-brand"
                >
                  {step.label}
                </button>
              )}
            </Fragment>
          ))}
        </nav>
      )}

      {/* The label does NOT compose the period's name: in annual `periodName` already IS «Total» —that
          is what the only column of that frequency is called— and the annex is always read annually,
          so «Total {periodName}» printed «Total Total» in the normal case, not in an edge one. The
          period is said ONCE, in the subtitle of the card below. */}
      <dl className="mb-5">
        <Metric label="Monto del periodo">{formatCurrency(current.value, { cents: true })}</Metric>
      </dl>

      <div className="flex flex-col gap-4">
        {chart ? (
          <ChartCard
            title="Peso en el estado"
            subtitle={periodName}
            option={chart.option}
            table={chart.table}
            height={chart.rows * 46 + 24}
            tableToggle={false}
          />
        ) : (
          <p className="text-[11.5px] leading-snug text-faint">
            El tramo no trae totales contra los que medir esta cuenta.
          </p>
        )}

        {desglose ? (
          <ChartCard
            title="De qué se compone"
            subtitle={`${breakdown?.all.length} ${breakdown?.all.length === 1 ? "cuenta" : "cuentas"} · ${periodName}`}
            option={desglose.option}
            table={desglose.table}
            height={desglose.height}
            note={desglose.note}
            // Going down is clicking a bar, the SAME gesture that opened this window. A movement
            // account has nowhere to go into and does not react, which is what avoids promising a
            // level that does not exist.
            onSelect={(index) => {
              const row = breakdown?.rows[index];
              if (row?.hasChildren) {
                onOpen({ code: row.code, label: row.label, value: row.value });
              }
            }}
          />
        ) : (
          <p className={cn("text-[11.5px] leading-snug text-faint")}>
            {breakdown === null
              ? "Esta es una cuenta de movimiento: no tiene desglose."
              : "Sus cuentas no se movieron en el tramo."}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** The same label/value line as the account ficha; a `<dl>` because it is exactly that pair. */
function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border-faint py-2.5">
      <dt className="min-w-0 text-[12.5px] leading-snug text-muted">{label}</dt>
      <dd className="shrink-0 font-mono text-[13px] tabular-nums text-ink">{children}</dd>
    </div>
  );
}
