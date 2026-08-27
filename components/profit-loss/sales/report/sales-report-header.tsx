import { ReportBand } from "@/components/ui/report-layer";
import type { SalesReportHeader as SalesReportHeaderSpec } from "@/lib/sales/report";

/**
 * The report's header: a block, not a cover page of its own. Three sections do not justify leaving
 * two thirds of a page blank before the first datum, which PyG's report does earn with its tables per
 * center and per year.
 *
 * It writes what the filter bar says on screen, which is no longer there on paper: the period it
 * covers, whose billing it is and when it was generated.
 */
export function SalesReportHeader({ header }: { header: SalesReportHeaderSpec }) {
  return (
    <header className="print-section flex flex-col gap-5 border-b border-border pb-6">
      {/* The client's logo on the left, the title centred and the center's logo on the right: the
          same layout that heads the payslip in PDF, the Excel files and the other two reports, so a
          logo at the left edge means the same thing in all of them. */}
      <ReportBand
        {...(header.logo ? { leftLogo: header.logo } : {})}
        {...(header.rightLogo ? { rightLogo: header.rightLogo } : {})}
        logoHeight={56}
        className="text-center"
      >
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.5px] text-faint">
          Ventas por servicio · Informe
        </p>
        <h1 className="mt-2 text-[24px] font-semibold leading-tight text-ink">
          {header.clientName}
        </h1>
      </ReportBand>

      <dl className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-[12.5px]">
        <Field label="Periodo" value={header.periodLabel} />
        {header.companyName && <Field label="Empresa" value={header.companyName} />}
        <Field label="Generado el" value={header.generatedAt} />
      </dl>

      {/* The same declaration as the screen, and here it weighs more: a PDF travels without the app
          beside it, so whoever receives it has nowhere to find out this is not the estado de
          resultados. */}
      <p className="text-center text-[11px] leading-snug text-faint">
        Cifras de facturación. Lo facturado no es lo contabilizado: no coinciden con el estado de
        resultados del mismo periodo por tiempos de reconocimiento, notas de crédito e IVA.
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
