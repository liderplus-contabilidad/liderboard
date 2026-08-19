"use client";

import { FileText } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { SalariesFilters } from "@/lib/payroll/salaries/filters";
import type { SalariesSource } from "@/lib/payroll/salaries/grid";
import type { EntityLogo } from "@/lib/workspaces";

const SalariesReportPreview = dynamic(
  () => import("./salaries-report-preview").then((mod) => mod.SalariesReportPreview),
  { ssr: false },
);

/**
 * «Informe PDF» de Sueldos por Áreas, en la cabecera de la pantalla — no en la barra de filtros,
 * que es la única superficie de SELECCIÓN de este módulo, y pedir un informe no selecciona nada.
 *
 * Carga la vista previa en dinámico: el informe monta un gráfico por sección y no puede pesar en
 * la carga de una pantalla que la mayoría de las veces solo se mira.
 */
export function SalariesReportButton({
  clientName,
  logo,
  rightLogo,
  source,
  filters,
  hasPayroll,
}: {
  clientName: string;
  logo?: EntityLogo;
  rightLogo?: EntityLogo;
  source: SalariesSource;
  filters: SalariesFilters;
  hasPayroll: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="toolbar"
        variant="secondary"
        icon={<FileText size={14} />}
        disabled={!hasPayroll}
        title={hasPayroll ? undefined : "Registra empleados en al menos un período."}
        onClick={() => setOpen(true)}
      >
        Informe PDF
      </Button>

      {open && (
        <SalariesReportPreview
          clientName={clientName}
          {...(logo ? { logo } : {})}
          {...(rightLogo ? { rightLogo } : {})}
          source={source}
          filters={filters}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
