"use client";

import Link from "next/link";
import { Building2, Layers, LineChart } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { systemLabel } from "@/lib/profit-loss/upload/systems";

/**
 * The three ways this screen can be empty — and they are three different gaps, only one of which a
 * file fills.
 *
 * What none of them does is take the item out of the sidebar. An entry that appears and disappears
 * depending on which client is open cannot be discovered, which is the rule `lib/modules.ts` already
 * writes down for «Ventas por servicio» and «Reportería de ingresos». So the registry is static and it
 * is the PAGE that says which step is missing.
 */

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[13px] border border-border bg-surface">
      <EmptyState icon={<Layers size={22} />} className="py-16">
        {children}
      </EmptyState>
    </div>
  );
}

/**
 * The workspace came from another accounting system. It is NOT a matter of missing data: the
 * twenty-one rows are specific codes of the MicroPlus default plan, and in another plan those codes
 * are not the same accounts under a different name — they are other accounts. A screen drawn here
 * would not be empty, which would be honest; it would be wrong.
 */
export function PersonnelCostForeignSystem({ systemId }: { systemId: string | null }) {
  return (
    <Frame>
      <span className="flex flex-col items-center gap-3 text-center">
        <span className="text-[15px] font-bold tracking-[-0.2px] text-ink">
          Este análisis lee el plan de cuentas de MicroPlus
        </span>
        <span className="max-w-[480px]">
          Las veintiún filas del comparativo son cuentas de ese plan —
          <span className="font-mono text-[11.5px]">5.2.02</span>,{" "}
          <span className="font-mono text-[11.5px]">5.2.04.01.01</span>,{" "}
          <span className="font-mono text-[11.5px]">5.3.03.01.01</span>—.
          {systemId
            ? ` El cliente abierto viene de ${systemLabel(systemId)}, donde esas cuentas no existen.`
            : " El cliente abierto no declara con qué sistema se cargó."}
        </span>
        <span className="text-[12px] text-faintest">
          Cambia de cliente en el selector de la cabecera.
        </span>
      </span>
    </Frame>
  );
}

/**
 * The cross-client consolidado. It is not a client but the SUM of all of them, and this análisis rests
 * on a figure written client by client — capturing there would create a partition that belongs to
 * nobody, that no screen lists and that no deletion reaches.
 */
export function PersonnelCostConsolidated() {
  return (
    <div className="rounded-[13px] border border-border bg-surface">
      <EmptyState icon={<Building2 size={22} />} className="py-16">
        <span className="flex flex-col items-center gap-3 text-center">
          <span className="text-[15px] font-bold tracking-[-0.2px] text-ink">
            El consolidado no tiene nómina de familia
          </span>
          <span className="max-w-[480px]">
            Suma el estado de resultados de todos los clientes, y este análisis descansa sobre una
            cifra que se escribe cliente por cliente. Abre uno en el selector de la cabecera.
          </span>
        </span>
      </EmptyState>
    </div>
  );
}

/**
 * A MicroPlus client with nothing loaded. Here there is nothing to upload FROM this screen: the
 * comparativo reads accounts of the PyG and the ventas of its raíz 4, so the empty state names the
 * missing step, says which module it belongs to and leads there — «Ventas por servicio»' same rule.
 */
export function PersonnelCostNoData() {
  return (
    <div className="rounded-[13px] border border-border bg-surface">
      <EmptyState icon={<LineChart size={22} />} className="py-16">
        <span className="flex flex-col items-center gap-3 text-center">
          <span className="max-w-[460px]">
            Este cliente no tiene ningún estado de resultados cargado. El comparativo lee cuentas
            del PyG y las ventas de su raíz 4: sube ahí el primer mes y esta pantalla se llena sola.
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
