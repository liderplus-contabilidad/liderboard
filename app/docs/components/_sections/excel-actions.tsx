"use client";

import { FilePlus2, FileSpreadsheet } from "lucide-react";
import { ExcelActions, type ExcelDownloadOption } from "@/components/ui/excel-actions";
import { Demo, DocSection } from "./section";

/** The gallery's downloads produce nothing: they only take time, so the progress can be seen. */
const pretendToWork = () => new Promise<void>((resolve) => setTimeout(resolve, 900));

const TWO_OPTIONS: ExcelDownloadOption[] = [
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
];

const ONE_OPTION: ExcelDownloadOption[] = [
  {
    id: "data",
    title: "Excel con tus datos",
    description: "Lo que tengas abierto, con lo que hayas editado",
    run: pretendToWork,
  },
];

const UNAVAILABLE: ExcelDownloadOption[] = [
  {
    id: "data",
    title: "Excel con tus datos",
    description: "Lo que tengas abierto, con lo que hayas editado",
    disabled: true,
    disabledReason: "Esta vista es un cálculo de la app; descarga el Excel de una sucursal.",
    run: pretendToWork,
  },
];

const FAILING: ExcelDownloadOption[] = [
  {
    id: "data",
    title: "Excel con tus datos",
    description: "Esta falla a propósito",
    run: () => Promise.reject(new Error("demo")),
  },
];

export function ExcelActionsSection() {
  return (
    <DocSection
      id="excel-actions"
      title="Acciones de Excel"
      description="El bloque de cargar/descargar de TODOS los módulos. Un módulo aporta solo su dominio —qué abre «Cargar», qué genera cada descarga y qué dice el ⓘ—; la forma del control de descarga se deriva de cuántas opciones reciba, y el progreso y el error viven en el primitivo."
    >
      <Demo label="Dos o más descargas → menú">
        <ExcelActions
          upload={{ onClick: () => {} }}
          downloads={TWO_OPTIONS}
          info={{
            title: "Archivos aceptados",
            children: <>Lo que el módulo quiera explicar sobre los archivos que lee.</>,
          }}
        />
      </Demo>

      <Demo label="Una sola descarga → botón plano, sin ⓘ">
        <ExcelActions upload={{ onClick: () => {} }} downloads={ONE_OPTION} />
      </Demo>

      <Demo label="Descarga no disponible — la razón se lee al apuntar">
        <ExcelActions upload={{ onClick: () => {} }} downloads={UNAVAILABLE} />
      </Demo>

      <Demo label="Cuando la generación falla">
        <ExcelActions
          upload={{ label: "Cargar Excel", onClick: () => {} }}
          downloads={FAILING}
          downloadLabel="Descargar Excel"
        />
      </Demo>
    </DocSection>
  );
}
