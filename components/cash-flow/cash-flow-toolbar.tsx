"use client";

import {
  CalendarDays,
  CircleDot,
  Flag,
  Landmark,
  MapPin,
  SlidersHorizontal,
  Timer,
} from "lucide-react";
import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dropdown,
  DropdownFooter,
  DropdownDone,
  DropdownOption,
  DropdownPanel,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { ChipBar, FilterChip } from "@/components/ui/filter-chip";
import { SearchInput } from "@/components/ui/search-input";
import { Toolbar, ToolbarLabel } from "@/components/ui/toolbar";
import { agingSideLabel } from "@/lib/cash-flow/aging";
import {
  STEP_MARKS,
  UNASSIGNED,
  withAccountToggled,
  withAllYears,
  withCheckSearch,
  withStepToggled,
  withYearToggled,
  withYearsCleared,
  type StepMark,
} from "@/lib/cash-flow/check-filters";
import { CHECK_STEP_LABELS } from "@/lib/cash-flow/checks";
import { isISODate, todayISO } from "@/lib/cash-flow/dates";
import {
  AGING_SIDES,
  PRIORITY_LABELS,
  PRIORITY_MARKS,
  withCenterToggled,
  withCentersCleared,
  withPriorityToggled,
  withSearch,
  withShowSettled,
  withSideToggled,
} from "@/lib/cash-flow/filters";
import { accountLabel } from "@/lib/cash-flow/flow";
import { cn } from "@/lib/cn";
import { formatDayMonthYear } from "@/lib/date";
import type { ModuleTabId } from "@/lib/modules";
import { yearMarkLabel } from "@/lib/period";
import { useCashFlowData } from "./cash-flow-data-provider";

function stepMarkLabel(mark: StepMark): string {
  return mark === "voided" ? "Anulado" : CHECK_STEP_LABELS[mark];
}

/**
 * The module's ONE filter bar, read by the four tabs. Two things are common to all of them and sit
 * first: the FECHA DE CORTE (design D11 — the date every reading is at) and «Centro», which renders
 * nothing for an empresa without centers. After them, each tab's own marks; every mark leaves a
 * chip, and none marked is all.
 *
 * The date is a native `<input type="date">` dressed as the bar's other triggers: the reading has
 * to be able to jump to any day, and a grid of days would be a control for a question the calendar
 * already answers.
 */
export function CashFlowToolbar({ tab }: { tab: ModuleTabId }) {
  const {
    activeClientId,
    centers,
    accounts,
    asOf,
    setAsOf,
    isToday,
    payableFilters,
    setPayableFilters,
    checkFilters,
    setCheckFilters,
    checkYearUniverse,
    visibleCheckYears,
  } = useCashFlowData();
  const idle = activeClientId === null;
  const settledId = useId();
  const centerIds = centers.map((center) => center.id);
  const centerName = (id: string) => centers.find((center) => center.id === id)?.name ?? id;
  const accountIds = [...accounts.map((account) => account.id), UNASSIGNED];
  const accountName = (id: string) => {
    const account = accounts.find((candidate) => candidate.id === id);
    return account ? accountLabel(account, centers) : "Sin cuenta";
  };

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (!isToday) {
    chips.push({
      key: "asOf",
      label: `Al ${formatDayMonthYear(asOf) ?? asOf}`,
      onRemove: () => setAsOf(todayISO()),
    });
  }
  for (const id of payableFilters.centerIds) {
    chips.push({
      key: `center-${id}`,
      label: centerName(id),
      onRemove: () => setPayableFilters((f) => withCenterToggled(f, id, centerIds)),
    });
  }
  if (tab === "cxp") {
    for (const side of payableFilters.sides) {
      chips.push({
        key: `side-${side}`,
        label: agingSideLabel(side),
        onRemove: () => setPayableFilters((f) => withSideToggled(f, side)),
      });
    }
    for (const mark of payableFilters.priorities) {
      chips.push({
        key: `prio-${mark}`,
        label: PRIORITY_LABELS[mark],
        onRemove: () => setPayableFilters((f) => withPriorityToggled(f, mark)),
      });
    }
    if (payableFilters.showSettled) {
      chips.push({
        key: "settled",
        label: "Con liquidadas",
        onRemove: () => setPayableFilters((f) => withShowSettled(f, false)),
      });
    }
  }
  if (tab === "cheques") {
    for (const id of checkFilters.accountIds) {
      chips.push({
        key: `acc-${id}`,
        label: accountName(id),
        onRemove: () => setCheckFilters((f) => withAccountToggled(f, id, accountIds)),
      });
    }
    for (const mark of checkFilters.steps) {
      chips.push({
        key: `step-${mark}`,
        label: stepMarkLabel(mark),
        onRemove: () => setCheckFilters((f) => withStepToggled(f, mark)),
      });
    }
  }

  const clearAll = () => {
    setAsOf(todayISO());
    setPayableFilters((f) => ({
      ...withCentersCleared(f),
      sides: [],
      priorities: [],
      showSettled: false,
    }));
    setCheckFilters((f) => ({ ...f, accountIds: [], steps: [] }));
  };

  return (
    <div className="shrink-0 border-b border-border bg-surface">
      <Toolbar inert={idle} className={cn(idle && "opacity-50")}>
        <ToolbarLabel icon={<SlidersHorizontal size={15} />}>Filtros</ToolbarLabel>

        <label
          className={cn(
            "inline-flex h-[34px] items-center gap-2 rounded-[9px] border px-3 text-[12.5px] font-semibold transition-colors",
            isToday
              ? "border-border bg-surface text-muted hover:bg-canvas"
              : "border-brand bg-brand-soft text-brand",
          )}
        >
          <CalendarDays size={15} />
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint">
            Corte
          </span>
          <input
            type="date"
            value={asOf}
            aria-label="Fecha de corte"
            onChange={(event) => {
              if (isISODate(event.target.value)) {
                setAsOf(event.target.value);
              }
            }}
            className="bg-transparent font-sans text-[12.5px] font-semibold tabular-nums text-inherit outline-none"
          />
        </label>

        {centers.length > 0 && (
          <Dropdown>
            <DropdownTrigger
              active={payableFilters.centerIds.length > 0}
              icon={<MapPin size={15} />}
            >
              {payableFilters.centerIds.length > 0
                ? `Centro · ${payableFilters.centerIds.length}`
                : "Centro"}
            </DropdownTrigger>
            <DropdownPanel width={240}>
              {centers.map((center) => (
                <DropdownOption
                  key={center.id}
                  selected={payableFilters.centerIds.includes(center.id)}
                  onToggle={() =>
                    setPayableFilters((f) => withCenterToggled(f, center.id, centerIds))
                  }
                >
                  {center.name}
                </DropdownOption>
              ))}
              <DropdownFooter>
                <DropdownDone />
              </DropdownFooter>
            </DropdownPanel>
          </Dropdown>
        )}

        {tab === "cxp" && (
          <>
            <Dropdown>
              <DropdownTrigger active={payableFilters.sides.length > 0} icon={<Timer size={15} />}>
                {payableFilters.sides.length === 1
                  ? agingSideLabel(payableFilters.sides[0])
                  : "Vencimiento"}
              </DropdownTrigger>
              <DropdownPanel width={220}>
                {AGING_SIDES.map((side) => (
                  <DropdownOption
                    key={side}
                    selected={payableFilters.sides.includes(side)}
                    onToggle={() => setPayableFilters((f) => withSideToggled(f, side))}
                  >
                    {agingSideLabel(side)}
                  </DropdownOption>
                ))}
                <DropdownFooter>
                  <DropdownDone />
                </DropdownFooter>
              </DropdownPanel>
            </Dropdown>
            <Dropdown>
              <DropdownTrigger
                active={payableFilters.priorities.length > 0}
                icon={<Flag size={15} />}
              >
                {payableFilters.priorities.length === 1
                  ? PRIORITY_LABELS[payableFilters.priorities[0]]
                  : "Prioridad"}
              </DropdownTrigger>
              <DropdownPanel width={220}>
                {PRIORITY_MARKS.map((mark) => (
                  <DropdownOption
                    key={mark}
                    selected={payableFilters.priorities.includes(mark)}
                    onToggle={() => setPayableFilters((f) => withPriorityToggled(f, mark))}
                  >
                    {PRIORITY_LABELS[mark]}
                  </DropdownOption>
                ))}
                <DropdownFooter>
                  <DropdownDone />
                </DropdownFooter>
              </DropdownPanel>
            </Dropdown>
            <span className="inline-flex h-[34px] items-center gap-2 px-1 text-[12.5px] font-semibold text-muted">
              <Checkbox
                id={settledId}
                checked={payableFilters.showSettled}
                onChange={(checked) => setPayableFilters((f) => withShowSettled(f, checked))}
              />
              <label htmlFor={settledId}>Ver liquidadas</label>
            </span>
            <SearchInput
              size="sm"
              value={payableFilters.search}
              placeholder="Proveedor, documento o concepto"
              onChange={(value) => setPayableFilters((f) => withSearch(f, value))}
              className="ml-auto w-[260px]"
            />
          </>
        )}

        {tab === "cheques" && (
          <>
            <Dropdown>
              <DropdownTrigger
                active={checkFilters.accountIds.length > 0}
                icon={<Landmark size={15} />}
              >
                {checkFilters.accountIds.length > 0
                  ? `Cuenta · ${checkFilters.accountIds.length}`
                  : "Cuenta"}
              </DropdownTrigger>
              <DropdownPanel width={280}>
                {accountIds.map((id) => (
                  <DropdownOption
                    key={id}
                    selected={checkFilters.accountIds.includes(id)}
                    onToggle={() => setCheckFilters((f) => withAccountToggled(f, id, accountIds))}
                  >
                    {accountName(id)}
                  </DropdownOption>
                ))}
                <DropdownFooter>
                  <DropdownDone />
                </DropdownFooter>
              </DropdownPanel>
            </Dropdown>
            <Dropdown>
              <DropdownTrigger
                active={checkFilters.steps.length > 0}
                icon={<CircleDot size={15} />}
              >
                {checkFilters.steps.length === 1 ? stepMarkLabel(checkFilters.steps[0]) : "Avance"}
              </DropdownTrigger>
              <DropdownPanel width={220}>
                {STEP_MARKS.map((mark) => (
                  <DropdownOption
                    key={mark}
                    selected={checkFilters.steps.includes(mark)}
                    onToggle={() => setCheckFilters((f) => withStepToggled(f, mark))}
                  >
                    {stepMarkLabel(mark)}
                  </DropdownOption>
                ))}
                <DropdownFooter>
                  <DropdownDone />
                </DropdownFooter>
              </DropdownPanel>
            </Dropdown>
            {checkYearUniverse.length > 0 && (
              <Dropdown>
                <DropdownTrigger active icon={<CalendarDays size={15} />}>
                  {yearMarkLabel(visibleCheckYears, checkYearUniverse)}
                </DropdownTrigger>
                <DropdownPanel width={200}>
                  <div className="-mx-1 mb-1">
                    <button
                      type="button"
                      onClick={() => setCheckFilters((f) => withAllYears(f, checkYearUniverse))}
                      className={cn(
                        "flex w-full items-center rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors",
                        checkFilters.years.length === checkYearUniverse.length
                          ? "bg-brand-soft font-medium text-brand"
                          : "text-ink hover:bg-canvas",
                      )}
                    >
                      Todos los años
                    </button>
                  </div>
                  <div className="-mx-1 max-h-72 overflow-auto border-t border-border-soft pt-1.5">
                    {checkYearUniverse.map((year) => (
                      <DropdownOption
                        key={year}
                        selected={visibleCheckYears.includes(year)}
                        onToggle={() =>
                          setCheckFilters((f) =>
                            f.years.length === 0
                              ? withYearToggled(withYearsCleared(f), year, checkYearUniverse)
                              : withYearToggled(f, year, checkYearUniverse),
                          )
                        }
                      >
                        {year}
                      </DropdownOption>
                    ))}
                  </div>
                  <DropdownFooter>
                    <DropdownDone />
                  </DropdownFooter>
                </DropdownPanel>
              </Dropdown>
            )}
            <SearchInput
              size="sm"
              value={checkFilters.search}
              placeholder="Beneficiario, cheque o egreso"
              onChange={(value) => setCheckFilters((f) => withCheckSearch(f, value))}
              className="ml-auto w-[260px]"
            />
          </>
        )}
      </Toolbar>

      {chips.length > 0 && (
        <div className="px-7 pb-3">
          <ChipBar onClearAll={clearAll}>
            {chips.map((chip) => (
              <FilterChip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
            ))}
          </ChipBar>
        </div>
      )}
    </div>
  );
}
