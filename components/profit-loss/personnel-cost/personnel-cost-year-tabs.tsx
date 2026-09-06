"use client";

import { Plus, X } from "lucide-react";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TabBar } from "@/components/ui/tab-bar";
import { maxCaptureYear, parseYearInput } from "@/lib/year-input";
import { usePersonnelCostData } from "./personnel-cost-data-provider";

/**
 * **The exercises of the client, one per tab**, and where a new one is opened.
 *
 * It lists EVERY year the module knows —the ones the estado de resultados brought and the ones
 * somebody typed— in one strip and in one order, because from here they are the same thing: a year
 * this client has. Which of the two a year is only decides what opening it can do, and that is said
 * inside the year, not by sorting it into a separate list.
 *
 * **It lives in DATOS and nowhere else**, because opening a year is a statement about which TABLE is
 * on screen — the comparativo of an exercise the estado de resultados answers, or the four lines of
 * one somebody typed. Gráficos reads the bar's marks and nothing else, so over there the strip would
 * be a control whose effect the reader cannot see: the rule this app already holds up everywhere, that
 * a control which means nothing for what is open renders nothing at all.
 *
 * **It does not narrow anything either.** The bar still marks years to COMPARE them, which is the
 * whole point of a comparativo; this strip picks the one year that is OPEN. The two gestures are
 * deliberately independent, and that is also why this is a tab strip and the filter is a dropdown:
 * exactly one can be open, and any number can be marked.
 */
export function PersonnelCostYearTabs() {
  const { universe, captureYear, setCaptureYear } = usePersonnelCostData();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Read once per mount: the ceiling must not shift under the user mid-session.
  const maxYear = useMemo(() => maxCaptureYear(new Date()), []);

  /**
   * Oldest first, and the year being opened is always in the strip even before it has a figure: a
   * year just added has nothing stored anywhere, and a tab bar whose active id is not among its items
   * would draw no underline at all.
   */
  const tabs = useMemo(
    () =>
      [...new Set([...universe.years, captureYear])]
        .sort((a, b) => a - b)
        .map((year) => ({ id: String(year), label: String(year) })),
    [universe.years, captureYear],
  );

  const focusOnOpen = useCallback((node: HTMLInputElement | null) => node?.focus(), []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = parseYearInput(draft, maxYear);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setCaptureYear(result.year);
    setDraft("");
    setError(null);
    setAdding(false);
  };

  return (
    <div className="shrink-0 border-b border-border bg-surface">
      <TabBar
        items={tabs}
        value={String(captureYear)}
        onChange={(id) => setCaptureYear(Number(id))}
        ariaLabel="Ejercicios del cliente"
        idPrefix="personnel-year"
        className="border-b-0 px-7"
        rightSlot={
          adding ? (
            <form onSubmit={submit} className="flex items-center gap-2">
              <input
                // The input REPLACES the button that was under the cursor, so focus has to follow it
                // there — without this the keyboard is left on an element that no longer exists. It is
                // a ref callback and not `autoFocus`, which fires on every mount of the page.
                ref={focusOnOpen}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setError(null);
                }}
                inputMode="numeric"
                placeholder="Año"
                aria-label="Año a agregar"
                className="h-8 w-[76px] rounded-[9px] border border-border px-2.5 text-center font-mono text-[12.5px] tabular-nums"
              />
              <Button type="submit" size="sm" variant="secondary">
                Agregar
              </Button>
              <button
                type="button"
                aria-label="Cancelar"
                onClick={() => {
                  setAdding(false);
                  setDraft("");
                  setError(null);
                }}
                className="rounded p-1 text-faint transition-colors hover:text-ink"
              >
                <X size={14} />
              </button>
            </form>
          ) : (
            // The year is TYPED and not stepped: a firm with a decade of history reaches 2016 without
            // a control that grows a button per year — `lib/year-input.ts` holds the rule.
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus size={14} />}
              onClick={() => setAdding(true)}
            >
              Agregar año
            </Button>
          )
        }
      />
      {error && <p className="px-7 pb-2 text-[12px] text-negative">{error}</p>}
    </div>
  );
}
