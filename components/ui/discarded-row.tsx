import type { ReactNode } from "react";

/**
 * One line of the «Se descarta de este …» panel an irreversible deletion shows before confirming. It
 * exists as a primitive because the shape —an icon, what is lost in bold, and in what quantity— is
 * what turns «sus datos» into something one reads rather than confirms without stopping, and that
 * holds just as much for a PyG client as for an Ocupaciones hotel.
 *
 * What does NOT live here are the concrete rows: which they are and what they count belongs to each
 * module, because they speak of estados de resultados or of sucursales.
 */
export function DiscardedRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-2.5 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-soft">
      <span className="mt-0.5 shrink-0 text-muted">{icon}</span>
      <span>
        <strong className="font-semibold text-ink">{label}</strong> — {children}
      </span>
    </li>
  );
}
