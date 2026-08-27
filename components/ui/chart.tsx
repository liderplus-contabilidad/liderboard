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
import { SVGRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import type { ChartOption } from "@/lib/charts/types";
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
]);

/** `CHART_FONT` keeps the pure layer honest with a `var()`; only a real family measures. */
function resolvedFont(): string {
  const generated = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-ibm-plex-sans")
    .trim();
  return generated ? `${generated}, system-ui, sans-serif` : "system-ui, sans-serif";
}

export interface ChartProps {
  option: ChartOption;
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
 *   of twelve points is nowhere near where Canvas starts to win.
 * - **`setOption` on the live instance**, so a re-render is not a flash of an empty box.
 *   `notMerge` is on because a narrower selection has FEWER series and a merge would leave the
 *   dropped ones on screen.
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
    // Resolved HERE, not in the option builders: ECharts measures text on a canvas, and a canvas
    // font string cannot resolve a CSS variable. It falls back to a narrower family,
    // under-measures, and clips a long axis label AT THE START.
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

  // Hidden from assistive tech on purpose: read aloud, an axis of twelve numbers and eight legend
  // entries is noise. The numbers live in the card's table twin.
  return (
    <div className={cn("w-full", className)}>
      <span className="sr-only">{ariaLabel}</span>
      <div ref={host} aria-hidden style={{ height }} className="w-full" />
    </div>
  );
}
