import { pluralize } from "@/lib/format";
import type { SalariesReportHeader as SalariesReportHeaderSpec } from "@/lib/payroll/salaries/report";

/**
 * La cabecera del informe: un bloque, no una portada propia. El informe de Sueldos tiene el
 * consolidado más un puñado de áreas — una portada aparte, como la de PyG, dejaría dos tercios de
 * hoja en blanco antes del primer dato.
 *
 * Escribe lo que en pantalla dice la barra de filtros, que en papel ya no está: el rango que
 * cubre el informe (Año y Mes, honrados) y cuántas áreas trae, para que un informe acotado no se
 * confunda con uno completo.
 */
export function SalariesReportHeader({ header }: { header: SalariesReportHeaderSpec }) {
  return (
    <header className="print-section flex flex-col gap-5 border-b border-border pb-6">
      <div className="flex items-start gap-5">
        {header.logo && (
          // oxlint-disable-next-line next/no-img-element
          <img
            src={header.logo.dataUrl}
            alt=""
            width={header.logo.width}
            height={header.logo.height}
            className="mt-1 max-h-[56px] w-auto max-w-[160px] shrink-0 object-contain"
          />
        )}
        <div className="min-w-0">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.5px] text-faint">
            Sueldos por Áreas · Informe
          </p>
          <h1 className="mt-2 text-[24px] font-semibold leading-tight text-ink">
            {header.clientName}
          </h1>
        </div>
      </div>

      <dl className="flex flex-wrap gap-x-8 gap-y-2 text-[12.5px]">
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
