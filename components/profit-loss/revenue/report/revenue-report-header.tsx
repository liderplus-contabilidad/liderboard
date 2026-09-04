import { ReportBand } from "@/components/ui/report-layer";
import type { RevenueReportHeader as RevenueReportHeaderSpec } from "@/lib/revenue/report";

/**
 * The report's header: a block, not a cover page of its own. It writes what the filter bar says on
 * screen, which is no longer there on paper — whose revenue this is, which period it covers and when
 * it was generated.
 */
export function RevenueReportHeader({ header }: { header: RevenueReportHeaderSpec }) {
  return (
    <header className="print-section flex flex-col gap-5 border-b border-border pb-6">
      {/* The client's logo on the left, the title centred and the center's on the right: the same
          layout that heads the payslips, the Excel files and the other reports. */}
      <ReportBand
        {...(header.logo ? { leftLogo: header.logo } : {})}
        {...(header.rightLogo ? { rightLogo: header.rightLogo } : {})}
        logoHeight={56}
        className="text-center"
      >
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.5px] text-faint">
          Reportería de ingresos · Informe
        </p>
        <h1 className="mt-2 text-[24px] font-semibold leading-tight text-ink">
          {header.clientName}
        </h1>
      </ReportBand>

      <dl className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-[12.5px]">
        <Field label="Periodo" value={header.periodLabel} />
        <Field label="Generado el" value={header.generatedAt} />
      </dl>

      {/* Said on paper because a PDF travels without the app beside it: whoever receives it has
          nowhere else to find out which span each percentage was measured over, and that is the whole
          difference between this and the workbook it replaces. */}
      <p className="text-center text-[11px] leading-snug text-faint">
        El ingreso sale del estado de resultados. Los promedios dividen entre los meses cargados, y
        cada crecimiento y cada porcentaje se mide solo sobre los meses en que existen sus dos
        términos — la nota de cada lectura dice cuáles son.
      </p>
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
