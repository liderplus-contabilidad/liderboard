"use client";

import Link from "next/link";
import { LineChart } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * The gap this screen can have that no file of its own fills: **the client's PyG is empty**.
 *
 * Here there is nothing to upload — the revenue is the raíz 4 of the estado de resultados, and it is
 * PyG that loads it. So the empty state names the missing step, says which module it belongs to and
 * leads there, instead of offering an upload that would write nothing. It is the same rule by which
 * «Ventas por servicio» sends the reader to PyG when there is no client: no screen is left silent,
 * even when the step it is waiting for is another module's.
 */
export function RevenueEmptyState() {
  return (
    <div className="rounded-[13px] border border-border bg-surface">
      <EmptyState icon={<LineChart size={22} />} className="py-16">
        <span className="flex flex-col items-center gap-3 text-center">
          <span className="max-w-[460px]">
            Este cliente no tiene ningún estado de resultados cargado. La reportería de ingresos lee
            la raíz 4 del PyG: sube ahí el primer mes y esta pantalla se llena sola.
          </span>
          <Link
            href="/profit-loss"
            className="inline-flex h-[34px] items-center gap-2 rounded-[9px] bg-brand px-[13px] text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            <LineChart size={14} />
            Ir a Pérdidas y Ganancias
          </Link>
        </span>
      </EmptyState>
    </div>
  );
}
