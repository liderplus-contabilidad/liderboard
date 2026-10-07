"use client";

import { CreatableSelect } from "@/components/ui/creatable-select";

export function BeneficiaryPicker({
  value,
  names,
  onChange,
}: {
  value: string;
  names: readonly string[];
  onChange: (name: string) => void;
}) {
  return (
    <div className="col-span-2">
      <div className="mb-1.5 text-[11px] font-semibold text-faint">Beneficiario</div>
      <CreatableSelect
        value={value}
        options={names}
        onChange={onChange}
        ariaLabel="Seleccionar beneficiario"
        placeholder="Seleccionar beneficiario"
        searchLabel="Buscar o agregar beneficiario"
        searchPlaceholder="Buscar o escribir un beneficiario…"
        createLabel={(query) => `Agregar «${query}» como beneficiario`}
        popupWidth={540}
      />
    </div>
  );
}
