import { ReportBand } from "@/components/ui/report-layer";
import type { SalesReportHeader as SalesReportHeaderSpec } from "@/lib/sales/report";

/**
 * La cabecera del informe: un bloque, no una portada propia. Tres secciones no justifican dejar
 * dos tercios de hoja en blanco antes del primer dato, que es lo que sí se gana el informe de PyG
 * con sus tablas por centro y por año.
 *
 * Escribe lo que en pantalla dice la barra de filtros, que en papel ya no está: el periodo que
 * cubre, de qué empresa es la facturación y cuándo se generó.
 */
export function SalesReportHeader({ header }: { header: SalesReportHeaderSpec }) {
  return (
    <header className="print-section flex flex-col gap-5 border-b border-border pb-6">
      {/* Logo del cliente a la izquierda, título centrado y logo del centro a la derecha: el mismo
          reparto con el que se encabezan el comprobante en PDF, los Excel y los otros dos
          informes, para que un logo en el borde izquierdo signifique lo mismo en todos. */}
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

      {/* La misma declaración que la pantalla, y aquí pesa más: un PDF viaja sin la app al lado,
          así que quien lo reciba no tiene dónde descubrir que esto no es el estado de resultados. */}
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
