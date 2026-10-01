"use client";

import { Plus, CalendarDays, Columns3, List, ListFilter } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { deleteTask } from "@/lib/operations/db";
import { working } from "@/lib/operations/model";
import type { Company, ScheduleTask, TaskValues } from "@/lib/operations/types";
import { stagePatch, type TaskStage } from "@/lib/schedule/model";
import { attentionOf } from "@/lib/schedule/attention";
import { ScheduleKanban } from "./schedule-kanban";
import { ScheduleCalendar } from "./schedule-calendar";
import { TaskEditor, type TaskEditorTarget } from "./task-editor";
import { TaskStageSelect } from "./task-stage-select";
import { TaskDateField } from "./task-date-field";
import { TaskTypeField } from "./task-type-field";
import { TaskAttentionBadge } from "./task-attention-badge";
import { CompanyDetail } from "./company-detail";
import { CompanyFilters } from "./company-filters";
import { InlineField } from "./inline-field";
import { useOperations } from "./operations-provider";
import { DeleteRow } from "./row-actions";
import {
  CELL_CLASS,
  OperationsStatus,
  OperationsTable,
  OperationsToolbar,
  SELECT_CLASS,
} from "./table-chrome";

export function ScheduleView() {
  const ops = useOperations();
  const [pageMark, setPageMark] = useState({ key: "", page: 0 });
  const [editor, setEditor] = useState<TaskEditorTarget | null>(null);
  const openTask = useCallback(
    (id: string, field?: "dueOn" | "person") => setEditor({ id, field }),
    [],
  );
  const createKanbanTask = useCallback((stage: TaskStage) => setEditor({ date: null, stage }), []);
  const [companyDetailId, setCompanyDetailId] = useState("");
  const companyDetail = ops.companies.find((company) => company.id === companyDetailId);
  const lookup = useMemo(() => new Map(ops.companies.map((c) => [c.id, c])), [ops.companies]);
  const people = useMemo(
    () => [...new Set(ops.tasks.map((t) => working(t).person).filter(Boolean))].sort(),
    [ops.tasks],
  );
  const periods = useMemo(
    () =>
      [
        ...new Set([
          ops.period === "*" ? ops.today.slice(0, 7) : ops.period,
          ...ops.tasks.map((t) => working(t).period).filter(Boolean),
        ]),
      ]
        .sort()
        .reverse(),
    [ops.period, ops.tasks, ops.today],
  );
  const rows = ops.filteredTasks;
  const pageKey = `${ops.period}:${ops.groupId}:${ops.companyId}:${ops.search}:${ops.status}:${ops.person}:${ops.taskType}`;
  const page =
    pageMark.key === pageKey
      ? Math.min(pageMark.page, Math.max(0, Math.ceil(rows.length / 200) - 1))
      : 0;
  const pageTasks = rows.slice(page * 200, (page + 1) * 200);
  if (ops.loading) return <output className="block p-7 text-sm text-muted">Cargando…</output>;
  return (
    <div className="px-7 py-5">
      <OperationsToolbar placeholder="Buscar empresa o tarea" companyFilter={false}>
        <CompanyFilters
          selection={ops.companySelection}
          onGroupChange={ops.setGroupId}
          onCompanyChange={ops.setCompanyId}
        />
        {ops.scheduleView !== "calendar" && (
          <select
            aria-label="Período"
            className={`${SELECT_CLASS} font-mono tabular-nums`}
            value={ops.period}
            onChange={(e) => ops.setPeriod(e.target.value)}
          >
            <option value="*">Todos los períodos</option>
            {periods.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        )}
        {people.length > 1 && (
          <select
            aria-label="Responsable"
            value={ops.person}
            className={SELECT_CLASS}
            onChange={(e) => ops.setPerson(e.target.value)}
          >
            <option value="">Todos los responsables</option>
            {people.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        )}
        <Button
          size="toolbar"
          icon={<Plus size={14} />}
          disabled={!ops.companies.length}
          onClick={() => setEditor({ date: null })}
        >
          Nueva tarea
        </Button>
      </OperationsToolbar>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchableSelect
            label="Tipo de tarea"
            value={ops.taskType}
            options={ops.taskTypes}
            onChange={ops.setTaskType}
            allLabel="Todos los tipos de tarea"
            searchPlaceholder="Buscar tipo de tarea…"
            icon={<ListFilter size={14} />}
          />
          <div className="flex items-center gap-1.5" aria-label="Estado de tareas">
            {[
              { value: "", label: "Todas" },
              { value: "attention", label: "Atención" },
              { value: "done", label: "Hechas" },
            ].map((s) => (
              <Button
                key={s.value}
                size="sm"
                variant="ghost"
                aria-pressed={ops.status === s.value}
                onClick={() => {
                  if (s.value === "attention") {
                    ops.setPeriod("*");
                    ops.setScheduleView("agenda");
                  }
                  ops.setStatus(s.value);
                }}
                className={
                  ops.status === s.value
                    ? s.value === "attention"
                      ? "bg-alert/10 text-alert"
                      : "bg-brand-soft text-brand"
                    : ""
                }
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>
        <div
          className="flex items-center gap-1 rounded-[9px] border border-border bg-surface p-1"
          aria-label="Vista de tareas"
        >
          {(
            [
              { value: "agenda", label: "Agenda", icon: List },
              { value: "kanban", label: "Kanban", icon: Columns3 },
              { value: "calendar", label: "Calendario", icon: CalendarDays },
            ] as const
          ).map((view) => (
            <Button
              key={view.value}
              size="sm"
              variant="ghost"
              icon={<view.icon size={14} />}
              aria-pressed={ops.scheduleView === view.value}
              className={ops.scheduleView === view.value ? "bg-brand-soft text-brand" : ""}
              onClick={() => ops.setScheduleView(view.value)}
            >
              {view.label}
            </Button>
          ))}
        </div>
      </div>
      {ops.scheduleView === "kanban" ? (
        <ScheduleKanban onOpen={openTask} onCreate={createKanbanTask} />
      ) : ops.scheduleView === "calendar" ? (
        <ScheduleCalendar onOpen={openTask} onCreate={(date) => setEditor({ date })} />
      ) : (
        <OperationsTable
          headers={["", "Tarea", "Vencimiento", "Responsable", "Estado", "Notas", ""]}
          empty={
            pageTasks.length
              ? undefined
              : ops.status === "attention"
                ? "No hay tareas que requieran atención."
                : "Agrega una tarea o carga tu Excel."
          }
          columnWidths={[48, "32%", 180, 156, 124, "auto", 56]}
          tableClassName="table-fixed min-w-[1040px]"
        >
          {pageTasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              company={lookup.get(t.companyId)}
              today={ops.today}
              patch={ops.patchTask}
              onCompany={setCompanyDetailId}
              taskTypes={ops.taskTypes}
            />
          ))}
        </OperationsTable>
      )}
      {rows.length > 200 && ops.scheduleView === "agenda" && (
        <div className="mt-3 flex items-center justify-end gap-3 text-[12px] text-muted">
          <span className="tabular-nums">
            {page * 200 + 1}–{Math.min((page + 1) * 200, rows.length)} de {rows.length}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={page === 0}
            onClick={() => setPageMark({ key: pageKey, page: page - 1 })}
          >
            Anterior
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={(page + 1) * 200 >= rows.length}
            onClick={() => setPageMark({ key: pageKey, page: page + 1 })}
          >
            Siguiente
          </Button>
        </div>
      )}
      <OperationsStatus count={`${rows.length} tareas`} />
      {editor && !companyDetail && (
        <TaskEditor
          key={"id" in editor ? editor.id : `${editor.date ?? "new"}:${editor.stage ?? "pending"}`}
          target={editor}
          onClose={() => setEditor(null)}
          onCompany={setCompanyDetailId}
        />
      )}
      {companyDetail && (
        <CompanyDetail
          company={companyDetail}
          onClose={() => setCompanyDetailId("")}
          onSchedule={() => {
            setCompanyDetailId("");
            setEditor(null);
            ops.openCompanySchedule(companyDetail.id);
          }}
        />
      )}
    </div>
  );
}

const TaskRow = memo(function TaskRow({
  task,
  company,
  today,
  patch,
  onCompany,
  taskTypes,
}: {
  task: ScheduleTask;
  company: Company | undefined;
  today: string;
  patch: (id: string, patch: Partial<TaskValues>) => Promise<void>;
  onCompany: (id: string) => void;
  taskTypes: ReturnType<typeof import("@/lib/schedule/task-types").taskTypeOptions>;
}) {
  const v = working(task),
    c = company ? working(company) : null;
  const attention = attentionOf(v, today);
  const [busy, setBusy] = useState(false);
  return (
    <tr
      className={cn(
        "transition-colors focus-within:bg-surface-header",
        attention === "late"
          ? "bg-alert/5 hover:bg-alert/10"
          : attention === "soon"
            ? "bg-warning/5 hover:bg-warning/10"
            : attention === "prepare"
              ? "bg-brand/5 hover:bg-brand/10"
              : "hover:bg-surface-header",
      )}
    >
      <td className={CELL_CLASS}>
        <input
          type="checkbox"
          aria-label={`Marcar hecha ${v.title} de ${c?.name ?? "empresa"}`}
          checked={v.done}
          disabled={busy}
          onChange={async (e) => {
            const done = e.target.checked;
            setBusy(true);
            try {
              await patch(task.id, stagePatch(done ? "done" : "pending"));
            } catch {
              /* Provider shows the error. */
            } finally {
              setBusy(false);
            }
          }}
          className="size-4 cursor-pointer accent-brand"
        />
      </td>
      <td className={CELL_CLASS}>
        <TaskTypeField
          value={v.title}
          options={taskTypes}
          appearance="inline"
          completed={v.done}
          onCommit={(title) => patch(task.id, { title })}
        />
        <div className="pl-2.5 pt-1">
          <TaskAttentionBadge state={attention} />
        </div>
        {company ? (
          <button
            type="button"
            onClick={() => onCompany(company.id)}
            aria-label={`Ver empresa y claves de ${c?.name}`}
            title={c?.name}
            className="block h-6 max-w-full truncate rounded-[9px] px-2.5 text-left text-[12px] text-muted outline-none hover:text-brand hover:underline focus-visible:ring-2 focus-visible:ring-brand-soft"
          >
            {c?.name}
          </button>
        ) : (
          <span className="pl-2.5 font-medium">Sin empresa</span>
        )}
      </td>
      <td className={CELL_CLASS}>
        <TaskDateField
          value={v}
          today={today}
          label={`Elegir fecha de ${v.title} de ${c?.name ?? "empresa"}`}
          onCommit={(value) => patch(task.id, value)}
        />
      </td>
      <td className={CELL_CLASS}>
        <InlineField
          appearance="field"
          density="compact"
          value={v.person}
          title={v.person || "Asignar responsable"}
          label="Responsable de tarea"
          placeholder="Asignar"
          onCommit={(person) => patch(task.id, { person })}
        />
      </td>
      <td className={CELL_CLASS}>
        <TaskStageSelect value={v} onCommit={(value) => patch(task.id, value)} />
      </td>
      <td className={CELL_CLASS}>
        <InlineField
          appearance="field"
          density="compact"
          value={v.notes}
          title={v.notes || "Agregar nota"}
          label="Notas de tarea"
          placeholder="Agregar nota"
          onCommit={(notes) => patch(task.id, { notes })}
        />
      </td>
      <td className={CELL_CLASS}>
        <DeleteRow label={`tarea ${v.title}`} onDelete={() => deleteTask(task.id)} />
      </td>
    </tr>
  );
});
