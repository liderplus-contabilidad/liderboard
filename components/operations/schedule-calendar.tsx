"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import { working } from "@/lib/operations/model";
import { formatDayMonthYear } from "@/lib/date";
import { calendarDays, calendarGroups, monthLabel, shiftMonth } from "@/lib/schedule/calendar";
import { taskStateLabel } from "@/lib/schedule/model";
import { attentionOf } from "@/lib/schedule/attention";
import type { Company, ScheduleTask } from "@/lib/operations/types";
import { useOperations } from "./operations-provider";
import { TASK_DRAG_TYPE, TaskCard } from "./task-card";
import { SELECT_CLASS } from "./table-chrome";

export function ScheduleCalendar({
  onOpen,
  onCreate,
}: {
  onOpen: (id: string, field?: "dueOn" | "person") => void;
  onCreate: (date: string | null) => void;
}) {
  const ops = useOperations(),
    [openDay, setOpenDay] = useState<string | null>(null),
    [over, setOver] = useState<string | null>(null);
  const days = useMemo(() => calendarDays(ops.calendarMonth), [ops.calendarMonth]);
  const groups = useMemo(() => calendarGroups(ops.filteredTasks), [ops.filteredTasks]);
  const companies = useMemo(() => new Map(ops.companies.map((c) => [c.id, c])), [ops.companies]);
  const openTask = (id: string, field?: "dueOn" | "person") => {
    setOpenDay(null);
    onOpen(id, field);
  };
  return (
    <>
      <section
        className="overflow-hidden rounded-[13px] border border-border bg-surface"
        aria-label="Calendario mensual"
      >
        <header className="flex items-center justify-between gap-4 border-b border-border-soft px-5 py-3">
          <div className="flex items-center gap-2">
            <Button
              size="toolbar"
              variant="ghost"
              iconOnly
              icon={<ChevronLeft size={16} />}
              aria-label="Mes anterior"
              onClick={() => ops.setCalendarMonth(shiftMonth(ops.calendarMonth, -1))}
            />
            <h2 className="min-w-[160px] text-[16px] font-semibold text-ink">
              {monthLabel(ops.calendarMonth)}
            </h2>
            <Button
              size="toolbar"
              variant="ghost"
              iconOnly
              icon={<ChevronRight size={16} />}
              aria-label="Mes siguiente"
              onClick={() => ops.setCalendarMonth(shiftMonth(ops.calendarMonth, 1))}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="toolbar"
              variant="secondary"
              onClick={() => ops.setCalendarMonth(ops.today.slice(0, 7))}
            >
              Hoy
            </Button>
            <input
              type="month"
              aria-label="Mes del calendario"
              value={ops.calendarMonth}
              onChange={(e) => {
                if (e.target.value) ops.setCalendarMonth(e.target.value);
              }}
              className={`${SELECT_CLASS} font-mono tabular-nums`}
            />
          </div>
        </header>
        <div className="grid grid-cols-7 border-b border-border-soft bg-surface-header">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
            <span key={day} className="py-2.5 text-center text-[12px] font-semibold text-muted">
              {day}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const tasks = day.inMonth ? (groups.dated.get(day.date) ?? []) : [];
            return (
              <div
                key={day.date}
                data-calendar-date={day.date}
                onDragOver={(e) => {
                  if (day.inMonth && e.dataTransfer.types.includes(TASK_DRAG_TYPE)) {
                    e.preventDefault();
                    setOver(day.date);
                  }
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  const id = e.dataTransfer.getData(TASK_DRAG_TYPE);
                  if (day.inMonth && ops.tasks.some((t) => t.id === id))
                    void ops.patchTask(id, { dueOn: day.date }).catch(() => {});
                }}
                className={`group min-h-[120px] min-w-0 border-b border-r border-border-soft p-2.5 ${!day.inMonth ? "bg-surface-muted" : over === day.date ? "bg-brand-soft" : "bg-surface"}`}
              >
                <div className="mb-2 flex items-center justify-between gap-1">
                  {day.inMonth ? (
                    <button
                      type="button"
                      disabled={!ops.companies.length}
                      aria-label={`Crear tarea el ${formatDayMonthYear(day.date)}`}
                      onClick={() => onCreate(day.date)}
                      className={`flex h-7 w-7 items-center justify-center rounded-full font-mono text-[13px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-brand ${day.date === ops.today ? "bg-brand text-surface" : "text-ink hover:bg-brand-soft hover:text-brand"}`}
                    >
                      {day.day}
                    </button>
                  ) : (
                    <span className="px-1.5 font-mono text-[13px] text-faint tabular-nums">
                      {day.day}
                    </span>
                  )}
                  {day.inMonth && (
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      disabled={!ops.companies.length}
                      icon={<Plus size={13} />}
                      aria-label={`Agregar tarea ${formatDayMonthYear(day.date)}`}
                      onClick={() => onCreate(day.date)}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  {tasks.slice(0, 3).map((task) => (
                    <CalendarTask
                      key={task.id}
                      task={task}
                      company={companies.get(task.companyId)}
                      today={ops.today}
                      onOpen={onOpen}
                    />
                  ))}
                </div>
                {tasks.length > 3 && (
                  <button
                    type="button"
                    className="mt-2 rounded-[9px] px-2 py-1 text-[12px] font-medium text-brand outline-none hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-brand"
                    onClick={() => setOpenDay(day.date)}
                  >
                    Ver {tasks.length - 3} más
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <section className="mt-5 border-t border-border-soft pt-4" aria-label="Tareas sin fecha">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[14px] font-semibold text-ink">Sin fecha</h2>
          <span className="font-mono text-[12px] text-muted tabular-nums">
            {groups.undated.length}
          </span>
        </div>
        {groups.undated.length ? (
          <div className="flex flex-wrap gap-2">
            {groups.undated.map((task) => (
              <div key={task.id} className="w-[220px]">
                <CalendarTask
                  task={task}
                  company={companies.get(task.companyId)}
                  today={ops.today}
                  onOpen={onOpen}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted">Todas las tareas de este período tienen fecha.</p>
        )}
      </section>
      {openDay && (
        <SidePanel
          title={formatDayMonthYear(openDay) ?? openDay}
          width={440}
          onClose={() => setOpenDay(null)}
        >
          <div className="space-y-3">
            {(groups.dated.get(openDay) ?? []).map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                company={companies.get(task.companyId)}
                today={ops.today}
                patch={ops.patchTask}
                onOpen={openTask}
                showStage
              />
            ))}
          </div>
          <Button
            size="toolbar"
            icon={<Plus size={14} />}
            className="mt-4"
            onClick={() => {
              setOpenDay(null);
              onCreate(openDay);
            }}
          >
            Nueva tarea
          </Button>
        </SidePanel>
      )}
    </>
  );
}

const CalendarTask = memo(function CalendarTask({
  task,
  company,
  today,
  onOpen,
}: {
  task: ScheduleTask;
  company?: Company;
  today: string;
  onOpen: (id: string) => void;
}) {
  const v = working(task),
    attention = attentionOf(v, today),
    name = company ? working(company).name : "Sin empresa";
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(TASK_DRAG_TYPE, task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      aria-label={`Editar ${v.title} de ${name}`}
      title={`${name} · ${v.title} · ${taskStateLabel(v, today)}`}
      onClick={() => onOpen(task.id)}
      className={`block w-full min-w-0 rounded-[9px] border px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand ${attention === "late" ? "border-alert bg-alert/10 text-alert" : attention === "soon" ? "border-warning bg-warning/15 text-warning" : attention === "prepare" ? "border-brand bg-brand/10 text-brand" : v.done ? "border-border-soft bg-surface-muted text-muted" : "border-border-soft bg-brand-soft text-brand"}`}
    >
      <span className="block truncate text-[12px] font-medium">{v.title}</span>
      <span className="mt-0.5 block truncate text-[12px]">{name}</span>
      {attention && (
        <span className="mt-1 block text-[11px] font-semibold">
          {attention === "late" ? "Vencida" : attention === "soon" ? "Por vencer" : "Por preparar"}
        </span>
      )}
    </button>
  );
});
