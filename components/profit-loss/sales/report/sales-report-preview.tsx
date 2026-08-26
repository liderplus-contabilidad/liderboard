"use client";

import { useMemo, useState } from "react";
import { ReportLayer, ReportSheet } from "@/components/ui/report-layer";
import { deriveSalesIdentity } from "@/lib/sales/identity";
import { buildSalesReport } from "@/lib/sales/report";
import { usePygData } from "../../pyg-data-provider";
import { useSalesData } from "../sales-data-provider";
import { SalesReportHeader } from "./sales-report-header";
import { SalesReportSection } from "./sales-report-section";

/** Más columnas que esto y la tabla se lleva su propia hoja apaisada. Es el mismo umbral con el
 *  que `statementFit` deja de encajar una tabla en el cuerpo vertical. */
const WIDE = 6;

/**
 * El informe de ventas, sobre el MISMO armazón que los otros dos (`ReportLayer`/`ReportSheet`).
 * No estrena nada: la capa `.report-layer` que `@media print` aísla va atada a la CLASE y no a un
 * id, y eso es exactamente lo que permite un tercer informe sin que uno imprima a los otros
 * detrás.
 *
 * Recibe del proveedor la MISMA entrada con la que se construyeron las tarjetas de la pantalla
 * (`cardsInput`) en vez de recomponerla: es lo que hace imposible que el papel diga una cifra que
 * la pantalla no diga.
 *
 * Dos hojas y no una: las dos primeras secciones son tablas de TRES columnas y caben de sobra en
 * vertical, mientras que la evolución son DOCE meses, que en vertical se aprietan hasta dejar de
 * leerse. La ancha se lleva **su propia hoja apaisada**, que es la figura que PyG ya usa y por el
 * mismo motivo: una hoja apaisada dentro del cuerpo vertical tendría que desbordarlo con un margen
 * negativo, y en pantalla eso se lee como una tabla escapándose del papel.
 */
export function SalesReportPreview({ onClose }: { onClose: () => void }) {
  const { activeClient } = usePygData();
  const { clientName, months, periodName, cardsInput } = useSalesData();
  // Sellada UNA vez, al abrir la vista previa, para que no avance mientras el lector la mira.
  const [generatedAt] = useState(() => new Date());

  // Solo el logo del CLIENTE, a la izquierda. El de la derecha es el del centro de costo, y aquí
  // no hay ninguno: las ventas no se reparten por centro —el reporte no lo declara—, así que la
  // banda queda con un solo logo en vez de inventar un segundo que no significaría nada.
  const logo = activeClient?.logo;
  const identity = useMemo(() => deriveSalesIdentity(months), [months]);

  const report = useMemo(
    () =>
      buildSalesReport({
        ...cardsInput,
        clientName: clientName ?? "Cliente",
        ...(identity ? { companyName: identity.companyName } : {}),
        ...(logo ? { logo } : {}),
        generatedAt,
      }),
    [cardsInput, clientName, identity, logo, generatedAt],
  );

  // Qué sección va a qué hoja lo decide el NÚMERO DE COLUMNAS de su propia tabla, no una lista
  // escrita a mano: la evolución crece a doce y las otras dos se quedan en tres, así que la regla
  // se sostiene sola si mañana una cambia de forma.
  const portrait = report.sections.filter((section) => section.card.table.columns.length <= WIDE);
  const landscape = report.sections.filter((section) => section.card.table.columns.length > WIDE);

  return (
    <ReportLayer fileName={`Ventas-${clientName ?? "cliente"}-${periodName}`} onClose={onClose}>
      <ReportSheet>
        <SalesReportHeader header={report.header} />
        {portrait.map((section, index) => (
          <SalesReportSection key={section.id} card={section.card} breakBefore={index > 0} />
        ))}
      </ReportSheet>
      {landscape.length > 0 && (
        <ReportSheet landscape>
          {landscape.map((section) => (
            <SalesReportSection key={section.id} card={section.card} />
          ))}
        </ReportSheet>
      )}
    </ReportLayer>
  );
}
