"use client";

import { CalendarX } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * What `/payroll/[periodId]` renders when the id does not exist or does not belong to the open client
 * — never a crash and never a blank screen. It covers both causes with the same message: to the
 * reader, «it is not there» and «it is not yours» are the same situation, and telling them apart
 * would not change the exit.
 */
export function PeriodNotFound() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center gap-4 px-7 py-16">
      <EmptyState icon={<CalendarX size={22} />} className="py-0">
        <span className="flex flex-col items-center gap-1.5 text-center">
          <span className="text-[15px] font-bold tracking-[-0.2px] text-ink">
            Este período no existe
          </span>
          <span className="max-w-[420px]">
            No lo encontramos en el cliente abierto — puede que ya se haya eliminado, o que
            pertenezca a otro cliente.
          </span>
        </span>
      </EmptyState>
      <Button onClick={() => router.push("/payroll")}>Volver a Rol de Pagos</Button>
    </div>
  );
}
