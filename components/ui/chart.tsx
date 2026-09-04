"use client";

import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from "echarts/components";
import { init, use, type ECharts, type EChartsCoreOption } from "echarts/core";
import { LabelLayout } from "echarts/features";
import { CanvasRenderer, SVGRenderer } from "echarts/renderers";
import { useEffect, useRef, useState } from "react";
import { is3DOption, type Chart3DOption, type ChartOption } from "@/lib/charts/types";
import { cn } from "@/lib/cn";

/**
 * The ONLY registration of ECharts in the app. The full package is close to a megabyte, so
 * registering from `echarts/core` is what keeps the rest out of the bundle; adding a chart type
 * means adding it here, deliberately.
 *
 * `LabelLayout` is what `labelLayout.hideOverlap` needs to DROP a label that does not fit instead
 * of drawing it clipped. `MarkLineComponent` draws the 80% cut of the Pareto card, and
 * `MarkAreaComponent` the band that says how far each group of the rotated axis reaches — without
 * registering it, a `markArea` does not fail: it simply is not drawn, which is worse.
 */
use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent,
  LabelLayout,
  SVGRenderer,
  // Only a 3D instance ever asks for it (see `registerGl`), but the renderer is chosen at `init` and
  // registering it there would be too late for the first `setOption`. It is the cheap half of the
  // pair: the megabyte is `echarts-gl`, and that one does stay out until a 3D card mounts.
  CanvasRenderer,
]);

/**
 * `echarts-gl` registered ONCE, on the first 3D mount, and never before.
 *
 * It weighs about as much as the rest of the app, so it enters through `import()` and not through
 * the module graph: a screen with no 3D card must not pay for it. The promise is memoised at module
 * scope rather than per component because `use()` is a GLOBAL registration — two cards mounting at
 * once would otherwise download and register it twice.
 */
let glRegistration: Promise<void> | null = null;

function registerGl(): Promise<void> {
  glRegistration ??= Promise.all([import("echarts-gl/charts"), import("echarts-gl/components")])
    .then(([{ Bar3DChart }, { Grid3DComponent }]) => {
      use([Bar3DChart, Grid3DComponent]);
    })
    .catch((error: unknown) => {
      // A failed import must not poison the memo: the next mount gets to try again.
      glRegistration = null;
      throw error;
    });
  return glRegistration;
}

/** `CHART_FONT` keeps the pure layer honest with a `var()`; only a real family measures. */
function resolvedFont(): string {
  const generated = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-ibm-plex-sans")
    .trim();
  return generated ? `${generated}, system-ui, sans-serif` : "system-ui, sans-serif";
}

export interface ChartProps {
  option: ChartOption | Chart3DOption;
  /** Fires with the clicked category's index; the caller decides what one level down means. */
  onSelect?: (dataIndex: number) => void;
  /** Plot height in px; the width always follows the container. */
  height?: number;
  /** What a screen reader announces. The card's table twin carries the actual numbers. */
  ariaLabel: string;
  className?: string;
}

/**
 * No other component calls `init`, so there is exactly one place an instance can leak.
 *
 * - **SVG, not Canvas.** Crisp at desktop density, exact 2px gaps and bar caps, and eight series
 *   of twelve points is nowhere near where Canvas starts to win. The ONE exception is a 3D option:
 *   `echarts-gl` draws through WebGL and simply produces nothing under the SVG renderer, so the
 *   renderer is chosen per INSTANCE and a change of dimension re-creates it — there is no way to
 *   swap a live instance's renderer.
 * - **`setOption` on the live instance**, so a re-render is not a flash of an empty box.
 *   `notMerge` is on because a narrower selection has FEWER series and a merge would leave the
 *   dropped ones on screen.
 */
export function Chart({ option, onSelect, height = 260, ariaLabel, className }: ChartProps) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<ECharts | null>(null);
  const dimension = is3DOption(option) ? "3d" : "2d";
  // `echarts-gl` must be registered BEFORE the first `setOption` that names `bar3D`, and it arrives
  // asynchronously. Until it does there is no instance at all: initialising one and drawing into it
  // twice is what makes the first paint flash.
  const [gl, setGl] = useState<"idle" | "ready" | "failed">("idle");

  useEffect(() => {
    if (dimension === "2d") {
      return;
    }
    let alive = true;
    registerGl().then(
      () => alive && setGl("ready"),
      () => alive && setGl("failed"),
    );
    return () => {
      alive = false;
    };
  }, [dimension]);

  const drawable = dimension === "2d" || gl === "ready";

  useEffect(() => {
    const node = host.current;
    if (!node || !drawable) {
      return;
    }
    const chart = init(node, undefined, { renderer: dimension === "3d" ? "canvas" : "svg" });
    instance.current = chart;

    // The sidebar collapses without a window resize event, so the container is what we watch.
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(node);

    return () => {
      observer.disconnect();
      chart.dispose();
      instance.current = null;
    };
  }, [drawable, dimension]);

  useEffect(() => {
    const chart = instance.current;
    if (!chart) {
      return;
    }
    // Resolved HERE, not in the option builders: ECharts measures text on a canvas, and a canvas
    // font string cannot resolve a CSS variable. It falls back to a narrower family,
    // under-measures, and clips a long axis label AT THE START.
    const withFont = {
      ...option,
      textStyle: { ...option.textStyle, fontFamily: resolvedFont() },
    };
    chart.setOption(withFont as unknown as EChartsCoreOption, { notMerge: true });
    // `drawable`/`dimension` are dependencies and not noise: when the registration lands the
    // instance is created in the SAME commit, and without them this effect would not re-run — the
    // 3D card would come up initialised and empty.
  }, [option, drawable, dimension]);

  useEffect(() => {
    const chart = instance.current;
    if (!chart) {
      return;
    }
    const handler = (params: { dataIndex?: number }) => {
      if (onSelect && typeof params.dataIndex === "number") {
        onSelect(params.dataIndex);
      }
    };
    chart.on("click", handler);
    return () => {
      // Teardown order puts the dispose effect first, so by now the instance may be gone.
      if (!chart.isDisposed()) {
        chart.off("click", handler);
      }
    };
  }, [onSelect, drawable, dimension]);

  // Hidden from assistive tech on purpose: read aloud, an axis of twelve numbers and eight legend
  // entries is noise. The numbers live in the card's table twin.
  return (
    <div className={cn("w-full", className)}>
      <span className="sr-only">{ariaLabel}</span>
      <div ref={host} aria-hidden style={{ height }} className="w-full" />
      {/* The host keeps its height throughout, so neither the wait nor the failure moves the card:
          what is said is said INSIDE the box the chart was going to occupy. */}
      {!drawable && (
        <div
          style={{ height, marginTop: -height }}
          className="flex w-full items-center justify-center text-[12px] text-faint"
        >
          {gl === "failed"
            ? "No se pudo cargar la vista 3D. Cambia a «Apilado» para ver estos mismos datos."
            : "Preparando la vista 3D…"}
        </div>
      )}
    </div>
  );
}
