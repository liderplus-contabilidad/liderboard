"use client";

import { Download, Plus, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Demo, DocSection } from "./section";

type PeriodMode = "all" | "month" | "range";

const PERIOD_OPTIONS = [
  { value: "all" as const, label: "Todo el año" },
  { value: "month" as const, label: "Mes" },
  { value: "range" as const, label: "Rango" },
];

const LEVEL_OPTIONS = [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }));

export function ButtonsSection() {
  const [mode, setMode] = useState<PeriodMode>("all");
  const [level, setLevel] = useState("3");

  return (
    <DocSection
      id="buttons"
      title="Botones y toggles"
      description="Botón en sus cuatro variantes y tres tamaños, control segmentado (barra y pastillas de nivel) y badges."
    >
      <Demo label="Variantes">
        <Button variant="primary" icon={<Download size={15} />}>
          Exportar
        </Button>
        <Button variant="secondary" icon={<UserPlus size={14} />}>
          Empleado
        </Button>
        <Button variant="ghost">Cancelar</Button>
        <Button variant="danger" icon={<Trash2 size={13} />}>
          Eliminar área
        </Button>
        <Button variant="primary" disabled>
          Deshabilitado
        </Button>
      </Demo>

      <Demo label="Tamaños e íconos">
        <Button size="md" icon={<Plus size={15} />}>
          Grande
        </Button>
        {/* 34px: la escala de los controles que viven en una barra (filtros, acciones de tab). */}
        <Button size="toolbar" icon={<Plus size={14} />}>
          Barra
        </Button>
        <Button size="sm" icon={<Plus size={13} />}>
          Pequeño
        </Button>
        <Button
          size="md"
          variant="secondary"
          iconOnly
          icon={<Trash2 size={15} />}
          aria-label="Eliminar"
        />
        <Button
          size="sm"
          variant="secondary"
          iconOnly
          icon={<Plus size={14} />}
          aria-label="Agregar"
        />
      </Demo>

      <Demo label="Control segmentado — barra">
        <SegmentedControl
          ariaLabel="Modo de periodo"
          options={PERIOD_OPTIONS}
          value={mode}
          onChange={setMode}
        />
        <span className="text-[13px] text-muted">
          Seleccionado: <span className="font-semibold text-ink">{mode}</span>
        </span>
      </Demo>

      <Demo label="Control segmentado — pastillas de nivel">
        <SegmentedControl
          ariaLabel="Nivel contable"
          variant="pills"
          options={LEVEL_OPTIONS}
          value={level}
          onChange={setLevel}
        />
        <span className="text-[13px] text-muted">
          Nivel <span className="font-semibold text-ink">{level}</span>
        </span>
      </Demo>

      <Demo label="Badges">
        <Badge variant="mono">Datos de ejemplo</Badge>
        <Badge variant="soft">Activo</Badge>
        <Badge variant="outline">Próximamente</Badge>
      </Demo>
    </DocSection>
  );
}
