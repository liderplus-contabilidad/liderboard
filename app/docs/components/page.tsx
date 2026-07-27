import type { Metadata } from "next";
import { ButtonsSection } from "./_sections/buttons";
import { DataGridSection } from "./_sections/data-grid";
import { DropdownsSection } from "./_sections/dropdowns";
import { ExcelActionsSection } from "./_sections/excel-actions";
import { InputsSection } from "./_sections/inputs";

export const metadata: Metadata = {
  title: "Componentes · LiderPlus",
  description: "Galería de primitivos de la tabla de datos de LiderPlus.",
};

const NAV = [
  { id: "buttons", label: "Botones y toggles" },
  { id: "inputs", label: "Selects y búsqueda" },
  { id: "dropdowns", label: "Desplegables y chips" },
  { id: "excel-actions", label: "Acciones de Excel" },
  { id: "data-grid", label: "Grilla y celdas" },
];

export default function ComponentsDocsPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[1180px] gap-10 px-8 py-10">
      <aside className="hidden w-[196px] shrink-0 lg:block">
        <div className="sticky top-10">
          <div className="mb-1 text-base font-bold tracking-tight text-brand">LiderPlus</div>
          <div className="mb-5 text-[11px] font-medium text-faint">Primitivos de UI</div>
          <nav className="flex flex-col gap-0.5">
            {NAV.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface hover:text-brand"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="mb-10 border-b border-border pb-6">
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Componentes de tabla de datos
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Primitivos reutilizables (celda, grilla, botones, selects, desplegables, búsqueda,
            chips) para las tablas de PyG, Sueldos por Áreas, Ocupaciones y Ventas. Todos los
            ejemplos son interactivos y usan los tokens de diseño de la aplicación.
          </p>
        </header>

        <div className="space-y-16 pb-24">
          <ButtonsSection />
          <InputsSection />
          <DropdownsSection />
          <ExcelActionsSection />
          <DataGridSection />
        </div>
      </main>
    </div>
  );
}
