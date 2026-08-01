import type { ReactNode } from "react";

/**
 * Una línea del panel «Se descarta de este …» que un borrado irreversible muestra antes de
 * confirmar. Existe como primitiva porque la forma —icono, qué se pierde en negrita, y en qué
 * cantidad— es lo que convierte «sus datos» en algo que uno lee en vez de confirmar de corrido, y
 * eso vale igual para un cliente de PyG que para un hotel de Ocupaciones.
 *
 * Lo que NO vive aquí son las filas concretas: cuáles son y qué cuentan es de cada módulo, porque
 * hablan de estados de resultados o de sucursales.
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
