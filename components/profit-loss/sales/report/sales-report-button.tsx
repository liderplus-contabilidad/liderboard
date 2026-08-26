"use client";

import { FileText } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSalesData } from "../sales-data-provider";

const SalesReportPreview = dynamic(
  () => import("./sales-report-preview").then((mod) => mod.SalesReportPreview),
  { ssr: false },
);

/**
 * «Informe PDF» de Ventas por servicio, en la CABECERA de la vista — no en la barra, que es la
 * única superficie de SELECCIÓN, y pedir un informe no selecciona nada.
 *
 * Deshabilitado NOMBRANDO el paso que falta mientras el cliente no tenga ningún mes cargado: un
 * control apagado sin explicación obliga a apuntarlo para descubrir qué le falta.
 *
 * La vista previa se carga en dinámico: monta un gráfico por sección y no puede pesar en la carga
 * de una pantalla que la mayoría de las veces solo se mira.
 */
export function SalesReportButton() {
  const { months, clientId } = useSalesData();
  const [open, setOpen] = useState(false);
  const ready = clientId !== null && months.length > 0;

  return (
    <>
      <Button
        size="toolbar"
        variant="secondary"
        icon={<FileText size={14} />}
        disabled={!ready}
        title={ready ? undefined : "Carga el Excel de ventas de al menos un mes."}
        onClick={() => setOpen(true)}
      >
        Informe PDF
      </Button>

      {open && <SalesReportPreview onClose={() => setOpen(false)} />}
    </>
  );
}
