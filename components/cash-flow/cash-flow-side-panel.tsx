"use client";

import { SidePanel, type SidePanelProps } from "@/components/ui/side-panel";

/** One width for every drawer in Cuentas por Pagar, including stacked configuration. */
export function CashFlowSidePanel(props: Omit<SidePanelProps, "width">) {
  return <SidePanel {...props} width={640} />;
}
