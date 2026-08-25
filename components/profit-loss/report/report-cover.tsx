import { Info } from "lucide-react";
import { ReportBand } from "@/components/ui/report-layer";
import type { ReportCover as ReportCoverSpec, ReportField } from "@/lib/profit-loss/report/types";

/**
 * The report's opening page. It mounts what `describePygReport` already wrote — every line here
 * is a string the pure layer produced, so what the cover SAYS is testable and only how it looks
 * lives in this file.
 */
export function ReportCover({ cover }: { cover: ReportCoverSpec }) {
  return (
    <section className="print-section flex flex-col gap-7">
      {/* El membrete, con el logo a la izquierda y el título centrado — el mismo reparto que
          encabeza los Excel de este cliente, para que el papel y el archivo se reconozcan. Sin
          logo del centro: la portada cubre TODOS los centros del informe, no uno. */}
      <ReportBand
        {...(cover.logo ? { leftLogo: cover.logo } : {})}
        logoHeight={64}
        className="border-b border-border pb-5 text-center"
      >
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.5px] text-faint">
          Estado de Resultados · Informe
        </p>
        <h1 className="mt-2 text-[28px] font-semibold leading-tight text-ink">
          {cover.clientName}
        </h1>
        <p className="mt-1.5 text-[13px] text-muted">
          {cover.companyName} · {cover.systemLabel} · {cover.modeLabel}
        </p>
      </ReportBand>

      {/* Apilados y no en dos columnas: en A4 vertical, una frase como «Ninguna marcada — el
          árbol completo» a media página se parte en tres líneas y deja de leerse como frase. */}
      <div className="flex flex-col gap-7">
        <FieldBlock title="Qué está mirando" fields={cover.scope} />
        <FieldBlock title="Filtros aplicados" fields={cover.filters} />
      </div>

      <footer className="flex flex-col gap-2.5 border-t border-border pt-5">
        <p className="flex items-center gap-2 text-[12px] text-muted">
          <Info size={14} className="shrink-0 text-faint" />
          {cover.coverageNote}
        </p>
        <p className="text-[11.5px] text-faint">Generado el {cover.generatedAt}</p>
      </footer>
    </section>
  );
}

function FieldBlock({ title, fields }: { title: string; fields: ReportField[] }) {
  return (
    <div className="print-keep">
      <h2 className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.5px] text-faint">
        {title}
      </h2>
      <dl className="flex flex-col gap-2.5">
        {fields.map((field) => (
          <div key={field.label} className="flex gap-4">
            <dt className="w-[104px] shrink-0 text-[12.5px] text-muted">{field.label}</dt>
            <dd className="flex-1 text-[12.5px] font-medium text-ink">{field.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
