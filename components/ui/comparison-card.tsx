import { cn } from "@/lib/cn";
import type { ComparisonCardData } from "@/lib/workspaces";

/**
 * Una de las dos tarjetas que un diálogo de choque enfrenta: lo que hay ABIERTO frente a lo que
 * traen los ARCHIVOS. Es el mismo bloque en PyG y en Ocupaciones porque la pregunta lo es —«¿esto
 * es lo mismo que ya tengo?»—, y la copia de los tres campos ya viene redactada desde `lib/`
 * (`describeIdentityChange` / `describeHotelChange`): esto solo la pone en pantalla.
 *
 * Las dos líneas van truncadas con su `title`: una razón social larga no puede ensanchar la
 * tarjeta, porque las dos se comparan lado a lado y tienen que medir lo mismo.
 */
export function ComparisonCard({
  card,
  monoDetail = false,
}: {
  card: ComparisonCardData;
  /**
   * Rinde `detail` en mono. Solo PyG lo pide: es donde esa línea lleva la razón social que el
   * lector coteja carácter a carácter contra su propio archivo.
   */
  monoDetail?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-[9px] bg-surface-muted px-3.5 py-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint">
        {card.caption}
      </p>
      <p className="mt-1 truncate text-[13px] font-bold text-ink" title={card.name}>
        {card.name}
      </p>
      <p
        className={cn("mt-0.5 truncate text-[11.5px] text-faint", monoDetail && "font-mono")}
        title={card.detail}
      >
        {card.detail}
      </p>
    </div>
  );
}
