"use client";

import { CalendarX } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Lo que rinde `/payroll/[periodId]` cuando el id no existe o no pertenece al cliente abierto —
 * nunca un crash ni una pantalla en blanco. Cubre las dos causas con el mismo mensaje: para quien
 * lee, «no está» y «no es tuyo» son la misma situación, y distinguirlas no cambiaría la salida.
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
