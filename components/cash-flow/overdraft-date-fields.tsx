"use client";

import { DateField } from "@/components/ui/date-field";
import { FormField } from "@/components/ui/form-field";
import type * as cashDb from "@/lib/cash-flow/db";

export function OverdraftDateFields({
  startsOn,
  endsOn,
  error,
  onChange,
}: {
  startsOn: string | null;
  endsOn: string | null;
  error?: string;
  onChange: (patch: Pick<cashDb.BankAccountInput, "overdraftStartsOn" | "overdraftEndsOn">) => void;
}) {
  return (
    <>
      <FormField label="Inicio del sobregiro" hint="Opcional">
        <DateField
          value={startsOn}
          nullable
          ariaLabel="Inicio del sobregiro"
          onChange={(value) => onChange({ overdraftStartsOn: value })}
        />
      </FormField>
      <FormField label="Fin del sobregiro" hint="Opcional · aviso de vencimiento" error={error}>
        <DateField
          value={endsOn}
          nullable
          ariaLabel="Fin del sobregiro"
          onChange={(value) => onChange({ overdraftEndsOn: value })}
        />
      </FormField>
    </>
  );
}
