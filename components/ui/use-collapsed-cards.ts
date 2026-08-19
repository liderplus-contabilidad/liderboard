"use client";

import { useCallback, useMemo, useState } from "react";

export interface CollapsedCards {
  isCollapsed: (id: string) => boolean;
  toggle: (id: string) => void;
  /** True cuando NO queda ninguna desplegada — lo que hace que el botón diga «Desplegar todos». */
  allCollapsed: boolean;
  toggleAll: () => void;
}

/**
 * Qué tarjetas de una pestaña están plegadas. Vive aquí y no dentro de `ChartCard` porque un
 * «Cerrar todos» necesita una sola verdad: con el estado repartido por tarjeta, el botón tendría
 * que empujar un valor a cada una y las dos podrían discrepar.
 *
 * Guarda las PLEGADAS y no las abiertas, la regla del sidebar y por el mismo motivo: una tarjeta
 * nueva —otra vista predeterminada, otro cliente— nace visible sin que nadie tenga que sembrarla.
 * Y se lee CRUZANDO contra los ids que hay en pantalla, así que una marca de una tarjeta que ya no
 * está no deja nada colgando.
 */
export function useCollapsedCards(ids: readonly string[]): CollapsedCards {
  const [collapsed, setCollapsed] = useState<readonly string[]>([]);

  const isCollapsed = useCallback((id: string) => collapsed.includes(id), [collapsed]);

  const toggle = useCallback((id: string) => {
    setCollapsed((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }, []);

  const allCollapsed = useMemo(
    () => ids.length > 0 && ids.every((id) => collapsed.includes(id)),
    [ids, collapsed],
  );

  // Un solo botón con dos sentidos: si queda alguna abierta, cierra; si no queda ninguna, abre.
  // Dos botones separados dejarían siempre uno sin trabajo que hacer.
  const toggleAll = useCallback(() => {
    setCollapsed(allCollapsed ? [] : [...ids]);
  }, [allCollapsed, ids]);

  return { isCollapsed, toggle, allCollapsed, toggleAll };
}
