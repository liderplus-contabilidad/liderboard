import { ReportBand } from "@/components/ui/report-layer";
import { pluralize } from "@/lib/format";
import type { SalariesReportHeader as SalariesReportHeaderSpec } from "@/lib/payroll/salaries/report";

/**
 * The report's header: a block, not a cover page of its own. The Sueldos report has the consolidado
 * plus a handful of areas — a separate cover, like PyG's, would leave two thirds of a page blank
 * before the first datum.
 *
 * It writes what the filter bar says on screen, which is no longer there on paper: the range the
 * report covers (Año and Mes, honoured) and how many areas it carries, so a narrowed report is not
 * mistaken for a complete one.
 */
export function SalariesReportHeader({ header }: { header: SalariesReportHeaderSpec }) {
  return (
    <header className="print-section flex flex-col gap-5 border-b border-border pb-6">
      {/* The client's logo on the left, the title centred and the cost center's on the right: the
          same layout that heads the payslip in PDF, the período's Excel and PyG's report. */}
      <ReportBand
        {...(header.logo ? { leftLogo: header.logo } : {})}
        {...(header.rightLogo ? { rightLogo: header.rightLogo } : {})}
        logoHeight={56}
        className="text-center"
      >
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.5px] text-faint">
          Sueldos por Áreas · Informe
        </p>
        <h1 className="mt-2 text-[24px] font-semibold leading-tight text-ink">
          {header.clientName}
        </h1>
      </ReportBand>

      <dl className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-[12.5px]">
        <Field label="Periodo" value={header.rangeLabel} />
        <Field label="Áreas" value={pluralize(header.areaCount, "área")} />
        <Field label="Generado el" value={header.generatedAt} />
      </dl>
    </header>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
