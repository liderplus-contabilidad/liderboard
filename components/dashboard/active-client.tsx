import { cn } from "@/lib/cn";

export interface ActiveClientInfo {
  /** Empresa / client shown in bold. */
  name: string;
  /** Period label for the subline, e.g. "Ene–Dic 2026". */
  period?: string;
}

export interface ActiveClientProps {
  client?: ActiveClientInfo;
  /** What the module is showing, first item of the subline. */
  caption?: string;
  /** Shown in place of the name when there is nothing loaded. */
  emptyLabel?: string;
}

/**
 * Active-client block for a module header. With no `client` it renders the empty state; pass
 * parsed Excel metadata to populate it. Used by Pérdidas y Ganancias for its empresa and by
 * Ocupaciones for its hotel.
 */
export function ActiveClient({
  client,
  caption = "Estado de resultados",
  emptyLabel = "Sin cliente seleccionado",
}: ActiveClientProps) {
  const hasClient = Boolean(client?.name);
  const name = client?.name ?? emptyLabel;
  const period = client?.period ?? "N/A";

  return (
    <div className="ml-auto flex min-w-0 flex-col items-end gap-[3px]">
      <span
        className={cn(
          "max-w-[360px] truncate text-[15px] font-bold tracking-[-0.2px]",
          hasClient ? "text-brand" : "text-faint",
        )}
      >
        {name}
      </span>
      <div className="flex items-center gap-[7px] text-[11.5px] font-medium text-faint">
        <span>{caption}</span>
        <span className="text-faintest">·</span>
        <span>{period}</span>
      </div>
    </div>
  );
}
