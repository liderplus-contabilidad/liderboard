"use client";

import { Info, Sparkles, X } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownPanel, useDropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/cn";
import { CHART_COMPOSITION_PALETTE, CHART_PALETTE } from "@/lib/charts/palette";
import {
  availablePresets,
  presetEffects,
  type PresetView,
} from "@/lib/profit-loss/charts/preset-views";
import { activeSource } from "@/lib/profit-loss/charts/selection";
import { usePygAnalytics } from "./pyg-analytics-provider";
import { usePygData } from "./pyg-data-provider";

/**
 * «Predeterminados»: the readings the firm always presents, in ONE button that hangs its gallery.
 *
 * It lives in the bar and not in its card's header —where every control read by a single card goes—
 * because it is not a drawing option: it is the other way of deciding WHAT is compared, the same
 * question «Cuenta contable» answers, and that is why they are mutually exclusive and why it leaves a
 * chip. But it is separated from the five dropdowns by a rule and moves to the far right of the row,
 * because those NARROW what is already on screen and these REPLACE it with another reading.
 *
 * It used to be a per-view switch in the bar itself, and the price was that a view does not fit in
 * its label: the only thing that said what would happen on pressing «Ventas» was a `title=` that only
 * exists if you leave the mouse on it and wait. A card has room for the three things you need to know
 * before pressing —the name, the question it answers and which filters it is going to move—, and that
 * third one was the one most needed: these views mark centers, months and frequency on their own, and
 * a button that moves marks the user did not make, without saying so, reads as a bug.
 *
 * The gallery HANGS OFF THE BUTTON (`DropdownPanel`) and is not planted in the middle of the screen.
 * It used to be a window, and a window dims the background and stands in the centre: that is right
 * for something read ALONE, and this is exactly the opposite —it is chosen while looking at what is
 * already drawn, which is what the view is going to replace—. Anchored to the button, besides, the
 * panel says where it came from and closes where it opened, like the five dropdowns next to it.
 *
 * **It renders nothing at all** when the open client's chart of accounts admits no view —the same
 * rule by which «Centro de costo» disappears in single-statement mode—, because a button that opens
 * an empty gallery teaches you not to press the one next to it.
 */
export function PresetFilter() {
  const { filters, selectPreset, clearPreset } = usePygData();
  const { context } = usePygAnalytics();

  const source = activeSource(context);
  // Which views are on offer depends on the open CHART OF ACCOUNTS: «Ventas» needs it to declare
  // hotel business lines and the annex needs it to declare expense accounts to break down.
  const presets = useMemo(() => availablePresets({ source }), [source]);
  if (presets.length === 0) {
    return null;
  }

  const active = presets.find((preset) => preset.id === filters.preset);

  return (
    <div className="ml-auto flex items-center border-l border-border-soft pl-3">
      <Dropdown>
        <PresetTrigger active={active} onClear={clearPreset} />
        {/* At the bar's right edge: left-aligned it would fall off the window, and `DropdownPanel`
            would push it back in without it pointing at its button any more. */}
        <DropdownPanel align="right" width={620}>
          <PresetGallery
            presets={presets}
            activeId={active?.id}
            onSelect={selectPreset}
            onClear={clearPreset}
          />
        </DropdownPanel>
      </Dropdown>
    </div>
  );
}

/**
 * The button. It has THREE states and not two, which is what separates it from the dropdowns next to
 * it: switched off it reads as one more of the row; open it takes the `brand-soft` with which every
 * control of the bar says «you are using me»; and with a view in place it is FILLED with `brand`.
 *
 * That fill is the only solid thing in the whole bar, and it is deliberate: a preset view does not
 * narrow what is on screen, it REPLACES it, so while it is on it is the most important datum of the
 * row. Painting it as a filter with marks —the same `brand-soft` «Año · 2026» or «Periodo · 3» carry—
 * left it indistinguishable from them exactly when telling it apart matters most. And the label says
 * WHICH one is in place («Ventas», not «Predeterminados»), as «Año · 2026» does, so the open view can
 * be read without opening anything.
 *
 * Switched on it is TWO buttons inside the same pill, split by a divider: the label opens the gallery
 * and the **✕** removes the view. Without it there was no way to switch it off in plain sight: the
 * old per-view buttons were switched off by pressing the one that was on, and folding them into one
 * lost that gesture — what was left was the panel's footer and the chip below, that is, two places
 * you have to know to look at. It is the same gesture the strip's chips already have, which is where
 * the user already learned to remove things. They are two sibling `<button>`s and not one inside the
 * other, which is not valid HTML and leaves the inner click with no way not to fire the outer one.
 */
function PresetTrigger({
  active,
  onClear,
}: {
  active: PresetView | undefined;
  onClear: () => void;
}) {
  const { open, setOpen, triggerRef } = useDropdown();

  return (
    <div
      className={cn(
        "inline-flex h-[34px] items-center rounded-[9px] border text-[12.5px] font-semibold transition-colors",
        active
          ? "border-brand bg-brand text-white"
          : open
            ? "border-brand bg-brand-soft text-brand"
            : "border-border bg-surface text-muted",
      )}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex h-full items-center gap-2 rounded-l-[8px] pl-3 transition-colors",
          active ? "pr-2.5 hover:bg-brand-hover" : "rounded-r-[8px] pr-3 hover:bg-canvas",
        )}
      >
        <Sparkles size={15} />
        {active?.label ?? "Predeterminados"}
      </button>
      {active && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Quitar la vista ${active.label}`}
          className="inline-flex h-full items-center rounded-r-[8px] border-l border-white/25 px-2 transition-colors hover:bg-brand-hover"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

function PresetGallery({
  presets,
  activeId,
  onSelect,
  onClear,
}: {
  presets: readonly PresetView[];
  activeId: string | undefined;
  onSelect: (
    id: string,
    options: Pick<PresetView, "seeds" | "frequency" | "narrowedByCodes">,
  ) => void;
  onClear: () => void;
}) {
  const { setOpen } = useDropdown();

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        {presets.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            active={preset.id === activeId}
            onSelect={() => {
              // What the view declares about itself travels to the provider from here: the provider
              // does not import from `charts/`, and who seeds what belongs to the view, like
              // `isAvailable`.
              onSelect(preset.id, {
                seeds: preset.seeds,
                frequency: preset.frequency,
                narrowedByCodes: preset.narrowedByCodes,
              });
              setOpen(false);
            }}
          />
        ))}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-4 border-t border-border-soft pt-[9px]">
        <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-faint">
          <Info size={13} className="mt-px shrink-0" />
          Al elegir una vista se marcan los filtros que necesita; puedes ajustarlos después en la
          barra.
        </p>
        {activeId !== undefined && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onClear();
              setOpen(false);
            }}
          >
            Quitar vista
          </Button>
        )}
      </div>
    </>
  );
}

/** A view: its shape, its name, the question it answers and what it will move on being switched on. */
function PresetCard({
  preset,
  active,
  onSelect,
}: {
  preset: PresetView;
  active: boolean;
  onSelect: () => void;
}) {
  const effects = presetEffects(preset);

  return (
    <button
      type="button"
      onClick={onSelect}
      // Exactly one can be in place, so the row is single-choice and not a checkbox: it is the same
      // role as `DropdownChoice` inside the panel's `role="menu"`.
      role="menuitemradio"
      aria-checked={active}
      className={cn(
        "flex h-full flex-col gap-2.5 rounded-[13px] border p-3 text-left transition-colors",
        active ? "border-brand bg-brand-soft" : "border-border bg-surface hover:bg-canvas",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-px shrink-0">{GLYPHS[preset.id] ?? <BarsGlyph />}</span>
        <div className="min-w-0 flex-1">
          <div className={cn("text-[13px] font-semibold", active ? "text-brand" : "text-ink")}>
            {preset.label}
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-muted">{preset.description}</p>
        </div>
      </div>
      {effects.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {effects.map((effect) => (
            <span
              key={effect}
              className="rounded-full border border-border-soft bg-surface-muted px-2 py-0.5 text-[10.5px] font-medium text-faint"
            >
              {effect}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

/**
 * Each view's glyph says the SHAPE of its reading —bars against a breakdown—, which is what tells at
 * a glance two cards that are otherwise two identical paragraphs apart. It does not say what the data
 * is: it is a fixed thumbnail and not a preview of the client's figures, because drawing it for real
 * would take one query to the engine per card just to decorate a menu.
 *
 * The hues come from `lib/charts/palette.ts` and not from a loose hex — the same rule by which no
 * builder writes a colour by hand—, and from the TWO sets that correspond to it: bars that compare
 * entities take the identity slots, and a breakdown takes the warm set the composition is painted
 * with. That way the glyph looks like what comes out on pressing it.
 *
 * It lives here and not in the catalogue because `lib/` does not import the renderer, and it falls
 * back to the generic one for an id it does not know, so adding a view is still one entry in
 * `preset-views.ts`.
 */
const GLYPH_SIZE = 22;

function BarsGlyph() {
  const bars = [7, 11, 15, 20];

  return (
    <svg width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox="0 0 22 22" aria-hidden="true">
      {bars.map((height, index) => (
        <rect
          key={height}
          x={index * 5.6}
          y={22 - height}
          width={4.4}
          height={height}
          rx={1.2}
          fill={CHART_PALETTE[bars.length - 1 - index]}
        />
      ))}
    </svg>
  );
}

function PieGlyph() {
  // A disc drawn with a circle's stroke: `r` at half the thickness fills it entirely, and each slice
  // is a segment of the `dasharray`. Rotated a quarter turn so it starts at the top, like a real pie.
  const shares = [0.45, 0.3, 0.25];
  const radius = 5.5;
  const circumference = 2 * Math.PI * radius;
  let consumed = 0;

  return (
    <svg width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox="0 0 22 22" aria-hidden="true">
      <g transform="rotate(-90 11 11)">
        {shares.map((share, index) => {
          const dash = `${share * circumference} ${circumference}`;
          const offset = -consumed * circumference;
          consumed += share;
          return (
            <circle
              key={share}
              cx={11}
              cy={11}
              r={radius}
              fill="none"
              stroke={CHART_COMPOSITION_PALETTE[index]}
              strokeWidth={radius * 2}
              strokeDasharray={dash}
              strokeDashoffset={offset}
            />
          );
        })}
      </g>
    </svg>
  );
}

const GLYPHS: Record<string, ReactNode> = {
  "lineas-de-negocio": <BarsGlyph />,
  "distribucion-de-gastos": <PieGlyph />,
};
