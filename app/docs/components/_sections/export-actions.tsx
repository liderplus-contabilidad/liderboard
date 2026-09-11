"use client";

import { FilePlus2, FileSpreadsheet, FileText } from "lucide-react";
import { ExportActions, type ExportOption } from "@/components/ui/export-actions";
import { Demo, DocSection } from "./section";

/** The gallery's exports produce nothing: they only take time, so the progress can be seen. */
const pretendToWork = () => new Promise<void>((resolve) => setTimeout(resolve, 900));

const EXCEL_AND_PDF: ExportOption[] = [
  {
    id: "data",
    title: "Excel con tus datos",
    description: "El estado con los valores y comentarios actuales",
    icon: FileSpreadsheet,
    iconClassName: "text-brand",
    run: pretendToWork,
  },
  {
    id: "template",
    title: "Plantilla vacía",
    description: "Tus cuentas con los montos en blanco, para llenar y recargar",
    icon: FilePlus2,
    iconClassName: "text-muted",
    run: pretendToWork,
  },
  {
    id: "pdf",
    title: "Informe PDF",
    description: "Abre la vista previa; aquí no genera nada ni espera",
    icon: FileText,
    // A `void` run: the menu closes at once and no spinner is painted.
    run: () => {},
  },
];

const ONE_OPTION: ExportOption[] = [
  {
    id: "data",
    title: "Excel con tus datos",
    description: "Lo que tengas abierto, con lo que hayas editado",
    run: pretendToWork,
  },
];

const UNAVAILABLE: ExportOption[] = [
  {
    id: "data",
    title: "Excel con tus datos",
    description: "Lo que tengas abierto, con lo que hayas editado",
    disabled: true,
    disabledReason: "Esta vista es un cálculo de la app; descarga el Excel de una sucursal.",
    run: pretendToWork,
  },
];

const FAILING: ExportOption[] = [
  {
    id: "data",
    title: "Excel con tus datos",
    description: "Esta falla a propósito",
    run: () => Promise.reject(new Error("demo")),
  },
];

export function ExportActionsSection() {
  return (
    <DocSection
      id="export-actions"
      title="Exportar"
      description="El bloque de cargar/exportar de TODOS los módulos. Un módulo aporta solo su dominio —qué abre «Cargar», qué ofrece «Exportar» y qué dice el ⓘ—. Es siempre un menú, con una opción o con cinco; una opción que devuelve una promesa GENERA un archivo (progreso y error viven en el primitivo) y una que no devuelve nada ABRE una capa, como el informe PDF."
    >
      <Demo label="Excel y PDF en el mismo menú">
        <ExportActions
          upload={{ onClick: () => {} }}
          exports={EXCEL_AND_PDF}
          info={{
            title: "Archivos aceptados",
            children: <>Lo que el módulo quiera explicar sobre los archivos que lee.</>,
          }}
        />
      </Demo>

      <Demo label="Una sola opción → sigue siendo un menú, sin ⓘ">
        <ExportActions upload={{ onClick: () => {} }} exports={ONE_OPTION} />
      </Demo>

      <Demo label="Opción no disponible — la razón se lee al apuntar">
        <ExportActions upload={{ onClick: () => {} }} exports={UNAVAILABLE} />
      </Demo>

      <Demo label="Cuando la generación falla">
        <ExportActions upload={{ label: "Cargar Excel", onClick: () => {} }} exports={FAILING} />
      </Demo>
    </DocSection>
  );
}
