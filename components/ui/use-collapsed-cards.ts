"use client";

import { useCallback, useMemo, useState } from "react";

export interface CollapsedCards {
  isCollapsed: (id: string) => boolean;
  toggle: (id: string) => void;
  /** True when NONE is left expanded — which is what makes the button say «Desplegar todos». */
  allCollapsed: boolean;
  toggleAll: () => void;
}

/**
 * Which cards of a tab are collapsed. It lives here and not inside `ChartCard` because a «Cerrar
 * todos» needs one single truth: with the state spread per card, the button would have to push a
 * value into each one and the two could disagree.
 *
 * It stores the COLLAPSED ones and not the open ones, the sidebar's rule and for the same reason: a
 * new card —another preset view, another client— is born visible without anyone having to seed it.
 * And it is read by CROSSING against the ids on screen, so a mark for a card that is no longer there
 * leaves nothing hanging.
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

  // One single button with two meanings: if any is left open, it closes; if none is left, it opens.
  // Two separate buttons would always leave one with no work to do.
  const toggleAll = useCallback(() => {
    setCollapsed(allCollapsed ? [] : [...ids]);
  }, [allCollapsed, ids]);

  return { isCollapsed, toggle, allCollapsed, toggleAll };
}
