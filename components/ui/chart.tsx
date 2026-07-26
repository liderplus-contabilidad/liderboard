"use client";

import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from "echarts/components";
import { init, use, type ECharts, type EChartsCoreOption } from "echarts/core";
import { LabelLayout } from "echarts/features";
import { SVGRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import type { ChartOption } from "@/lib/charts/types";
import { cn } from "@/lib/cn";

/**
 * The ONLY registration of ECharts in the app, and the only partial import list. The full
 * package is close to a megabyte and this dashboard draws bars, lines and pies — registering
 * from `echarts/core` is what keeps the rest out of the client bundle. Adding a chart type
 * means adding it here, deliberately.
 *
 * `LabelLayout` is not decoration: it is what `labelLayout.hideOverlap` in the option builders
 * needs to drop a label that does not fit instead of drawing it clipped. `MarkLineComponent`
 * draws the 80% cut of the Pareto card.
 */
use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  LabelLayout,
  SVGRenderer,
]);

/**
 * The concrete family `next/font` generated, read off `:root`. `CHART_FONT` keeps the pure
 * layer honest with a `var()`, but only a real family name can be measured on a canvas.
 */
function resolvedFont(): string {
  const generated = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-ibm-plex-sans")
    .trim();
  return generated ? `${generated}, system-ui, sans-serif` : "system-ui, sans-serif";
}

export interface ChartProps {
  option: ChartOption;
  /**
   * Fires with the clicked category's index. It is what makes a chart a place to explore FROM
   * rather than only to read: the caller decides what going down one level means.
   */
  onSelect?: (dataIndex: number) => void;
  /** Plot height in px; the width always follows the container. */
  height?: number;
  /** What a screen reader announces. The card's table twin carries the actual numbers. */
  ariaLabel: string;
  className?: string;
}

/**
 * Mounts one ECharts instance, keeps it fed and tears it down. No other component calls
 * `init`, so there is exactly one place where an instance can leak.
 *
 * Two decisions worth keeping:
 *
 * - **SVG, not Canvas.** Text stays crisp at desktop density, the 2px gaps and the rounded bar
 *   caps come out exact, and eight series of twelve points is nowhere near the volume where
 *   Canvas starts to win.
 * - **`setOption` on the live instance.** Changing the frequency or the selection re-renders
 *   the plot without remounting it, so there is no flash of an empty box on every keystroke.
 *   `notMerge` is on because a narrower selection has FEWER series than the last one, and a
 *   merge would leave the dropped ones on screen.
 */
export function Chart({ option, onSelect, height = 260, ariaLabel, className }: ChartProps) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<ECharts | null>(null);

  useEffect(() => {
    const node = host.current;
    if (!node) {
      return;
    }
    const chart = init(node, undefined, { renderer: "svg" });
    instance.current = chart;

    // The sidebar collapses without a window resize event, so the container is what we watch.
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(node);

    return () => {
      observer.disconnect();
      chart.dispose();
      instance.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = instance.current;
    if (!chart) {
      return;
    }
    // The font is resolved HERE and not in the option builders because ECharts measures text on
    // a canvas, and a canvas font string cannot resolve a CSS variable: it silently falls back
    // to a narrower family, under-measures, and truncates a long axis label to a width that
    // renders wider than its own cap — which is how a label ends up clipped at the start.
    const withFont = {
      ...option,
      textStyle: { ...option.textStyle, fontFamily: resolvedFont() },
    };
    chart.setOption(withFont as unknown as EChartsCoreOption, { notMerge: true });
  }, [option]);

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
  }, [onSelect]);

  // The SVG is hidden from assistive tech on purpose: read aloud, an axis of twelve numbers and
  // eight legend entries is noise. The name goes out as text and the numbers live in the card's
  // table twin, which is the readable form of the same data.
  return (
    <div className={cn("w-full", className)}>
      <span className="sr-only">{ariaLabel}</span>
      <div ref={host} aria-hidden style={{ height }} className="w-full" />
    </div>
  );
}
