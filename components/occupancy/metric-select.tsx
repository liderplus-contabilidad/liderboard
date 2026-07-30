"use client";

import { Gauge } from "lucide-react";
import { Dropdown, DropdownOption, DropdownPanel, DropdownTrigger } from "@/components/ui/dropdown";
import { METRICS, type OccupancyMetricId } from "@/lib/occupancy/analytics/types";

export interface MetricSelectProps {
  value: OccupancyMetricId;
  onChange: (metric: OccupancyMetricId) => void;
}

/**
 * The métrica is NOT a filter: it does not narrow what is on screen, it chooses which single figure
 * the «Análisis por métrica» section looks at. So it lives in that section's header — the filter
 * bar holds only what feeds every card of the tab.
 *
 * Single-choice by construction: ocupación is a %, ADR is $, PAX is a count, and two units in one
 * card would need the second `yAxis` the option types forbid.
 */
export function MetricSelect({ value, onChange }: MetricSelectProps) {
  const selected = METRICS.find((metric) => metric.id === value) ?? METRICS[0];

  return (
    <Dropdown>
      <DropdownTrigger icon={<Gauge size={15} />} active>
        {selected.label}
      </DropdownTrigger>
      <DropdownPanel width={260}>
        {METRICS.map((option) => (
          <DropdownOption
            key={option.id}
            selected={option.id === value}
            onToggle={() => onChange(option.id)}
          >
            {option.label}
            <span className="ml-1.5 text-[11px] text-faint">{option.hint}</span>
          </DropdownOption>
        ))}
      </DropdownPanel>
    </Dropdown>
  );
}
