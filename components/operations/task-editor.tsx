"use client";

import { useEffect, useState } from "react";
import { SidePanel } from "@/components/ui/side-panel";
import { Button } from "@/components/ui/button";
import { addTask, deleteTask } from "@/lib/operations/db";
import { working } from "@/lib/operations/model";
import { stagePatch, newTaskPeriod, type TaskStage } from "@/lib/schedule/model";
import { DEFAULT_PREPARATION_DAYS } from "@/lib/schedule/attention";
import type { TaskValues } from "@/lib/operations/types";
import { InlineField } from "./inline-field";
import { useOperations } from "./operations-provider";
import { DeleteRow } from "./row-actions";
import { TaskStageSelect } from "./task-stage-select";
import { TaskDateField } from "./task-date-field";
import { TaskTypeField } from "./task-type-field";
import { SELECT_CLASS } from "./table-chrome";

export type TaskEditorTarget =
  | { id: string; field?: "dueOn" | "person" }
  | { date: string | null; stage?: TaskStage };
const FIELDS: {
  key: Exclude<keyof TaskValues, "done" | "started" | "preparationDays">;
  label: string;
  type?: string;
}[] = [
  { key: "title", label: "Tarea" },
  { key: "dueOn", label: "Fecha de vencimiento" },
  { key: "person", label: "Responsable" },
  { key: "notes", label: "Notas" },
];
export function TaskEditor({
  target,
  onClose,
  onCompany,
}: {
  target: TaskEditorTarget;
  onClose: () => void;
  onCompany: (id: string) => void;
}) {
  const ops = useOperations();
  useEffect(() => {
    if ("id" in target && target.field)
      document.getElementById(`task-edit-${target.field}`)?.focus();
  }, [target]);
  if (!("id" in target))
    return (
      <NewTask date={target.date} initialStage={target.stage ?? "pending"} onClose={onClose} />
    );
  const task = ops.tasks.find((t) => t.id === target.id);
  if (!task) return null;
  const v = working(task),
    company = ops.companies.find((c) => c.id === task.companyId);
  return (
    <SidePanel title="Editar tarea" onClose={onClose} width={440}>
      <p className="mb-5 text-[13px] font-medium text-brand">
        {company ? working(company).name : "Sin empresa"}
      </p>
      {company && (
        <Button
          size="toolbar"
          variant="secondary"
          className="mb-5"
          onClick={() => onCompany(company.id)}
        >
          Ver empresa y claves
        </Button>
      )}
      <div className="space-y-4">
        {FIELDS.map((field) => (
          <label
            key={field.key}
            htmlFor={`task-edit-${field.key}`}
            className="block text-[13px] text-muted"
          >
            {field.label}
            {field.key === "title" ? (
              <div className="mt-2">
                <TaskTypeField
                  id="task-edit-title"
                  value={v.title}
                  options={ops.taskTypes}
                  onCommit={(title) => ops.patchTask(task.id, { title })}
                />
              </div>
            ) : field.key === "dueOn" ? (
              <div className="mt-2">
                <TaskDateField
                  id="task-edit-dueOn"
                  value={v}
                  today={ops.today}
                  label="Fecha de vencimiento"
                  onCommit={(patch) => ops.patchTask(task.id, patch)}
                />
              </div>
            ) : (
              <InlineField
                appearance="field"
                className="mt-2"
                id={`task-edit-${field.key}`}
                value={v[field.key] ?? ""}
                type={field.type}
                label={field.label}
                onCommit={(value) => ops.patchTask(task.id, { [field.key]: value })}
              />
            )}
          </label>
        ))}
        <label htmlFor="task-edit-preparationDays" className="block text-[13px] text-muted">
          Avisar para preparar
          <select
            id="task-edit-preparationDays"
            value={v.preparationDays ?? DEFAULT_PREPARATION_DAYS}
            onChange={(e) =>
              void ops
                .patchTask(task.id, { preparationDays: Number(e.target.value) })
                .catch(() => {})
            }
            className={`${SELECT_CLASS} mt-2 w-full`}
          >
            {[0, 10, 15, 20, 30].map((days) => (
              <option key={days} value={days}>
                {days === 0 ? "Sin aviso de preparación" : `${days} días antes`}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="task-edit-stage" className="block text-[13px] text-muted">
          Estado
          <TaskStageSelect
            id="task-edit-stage"
            value={v}
            onCommit={(patch) => ops.patchTask(task.id, patch)}
          />
        </label>
        <div className="flex justify-end border-t border-border-soft pt-4">
          <DeleteRow
            label={`tarea ${v.title}`}
            onDelete={async () => {
              await deleteTask(task.id);
              onClose();
            }}
          />
        </div>
      </div>
    </SidePanel>
  );
}

function NewTask({
  date,
  initialStage,
  onClose,
}: {
  date: string | null;
  initialStage: TaskStage;
  onClose: () => void;
}) {
  const ops = useOperations();
  const [companyMark, setCompany] = useState(
    ops.companyId || (ops.companies.length === 1 ? ops.companies[0].id : ""),
  );
  const companyId = ops.companies.some((c) => c.id === companyMark) ? companyMark : "";
  const [draft, setDraft] = useState({
    title: "",
    period: newTaskPeriod(ops.scheduleView, ops.period, ops.calendarMonth, date, ops.today),
    dueOn: date ?? "",
    preparationDays: DEFAULT_PREPARATION_DAYS,
    person: ops.person,
    notes: "",
  });
  const [stage, setStage] = useState<TaskStage>(initialStage),
    [busy, setBusy] = useState(false);
  return (
    <SidePanel
      title="Nueva tarea"
      onClose={() => {
        if (!busy) onClose();
      }}
      width={440}
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!companyId || !draft.title.trim() || busy) return;
          setBusy(true);
          try {
            await ops.save(() =>
              addTask(companyId, draft.period, draft.title.trim(), {
                dueOn: draft.dueOn || null,
                person: draft.person,
                notes: draft.notes,
                preparationDays: draft.preparationDays,
                ...stagePatch(stage),
              }),
            );
            ops.setSearch("");
            ops.setStatus("");
            ops.setTaskType("");
            if (ops.companyId && ops.companyId !== companyId) ops.setCompanyId(companyId);
            if (ops.person && ops.person !== draft.person) ops.setPerson(draft.person);
            if (ops.scheduleView === "calendar")
              ops.setCalendarMonth(draft.dueOn.slice(0, 7) || draft.period);
            else ops.setPeriod(draft.period);
            onClose();
          } catch {
            /* Provider shows error without discarding the draft. */
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block text-[13px] text-muted">
          Empresa
          <select
            aria-label="Empresa de la tarea"
            className={`${SELECT_CLASS} mt-2 w-full`}
            value={companyId}
            required
            onChange={(e) => setCompany(e.target.value)}
          >
            <option value="">Selecciona una empresa</option>
            {ops.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {working(c).name}
              </option>
            ))}
          </select>
        </label>
        {FIELDS.map((field) => (
          <label key={field.key} className="block text-[13px] text-muted">
            {field.label}
            {field.key === "title" ? (
              <div className="mt-2">
                <TaskTypeField
                  value={draft.title}
                  options={ops.taskTypes}
                  disabled={busy}
                  onCommit={async (title) => setDraft((current) => ({ ...current, title }))}
                />
              </div>
            ) : field.key === "dueOn" ? (
              <div className="mt-2">
                <TaskDateField
                  value={{ dueOn: draft.dueOn || null, period: draft.period }}
                  today={ops.today}
                  label="Fecha de vencimiento"
                  disabled={busy}
                  onCommit={async (patch) => {
                    setDraft((current) => ({
                      ...current,
                      dueOn: patch.dueOn ?? "",
                      period: patch.period ?? current.period,
                    }));
                  }}
                />
              </div>
            ) : (
              <input
                aria-label={field.label}
                type={field.type ?? "text"}
                value={draft[field.key]}
                onChange={(e) =>
                  setDraft((current) => ({ ...current, [field.key]: e.target.value }))
                }
                className="mt-2 h-[38px] w-full rounded-[9px] border border-border bg-surface px-3 text-[13px] text-ink outline-none focus:border-brand"
              />
            )}
          </label>
        ))}
        <label className="block text-[13px] text-muted">
          Avisar para preparar
          <select
            aria-label="Avisar para preparar"
            value={draft.preparationDays}
            disabled={busy}
            onChange={(e) =>
              setDraft((current) => ({ ...current, preparationDays: Number(e.target.value) }))
            }
            className={`${SELECT_CLASS} mt-2 w-full`}
          >
            {[0, 10, 15, 20, 30].map((days) => (
              <option key={days} value={days}>
                {days === 0 ? "Sin aviso de preparación" : `${days} días antes`}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[13px] text-muted">
          Estado
          <select
            aria-label="Estado de nueva tarea"
            className={`${SELECT_CLASS} mt-2 w-full`}
            value={stage}
            onChange={(e) => setStage(e.target.value as TaskStage)}
          >
            <option value="pending">Pendiente</option>
            <option value="doing">En curso</option>
            <option value="done">Hecha</option>
          </select>
        </label>
        <div className="flex justify-end gap-2 border-t border-border-soft pt-4">
          <Button
            type="button"
            variant="secondary"
            size="toolbar"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button type="submit" size="toolbar" disabled={busy || !companyId || !draft.title.trim()}>
            {busy ? "Guardando…" : "Crear tarea"}
          </Button>
        </div>
        {ops.error && (
          <p role="alert" className="text-[13px] text-warning">
            {ops.error}
          </p>
        )}
      </form>
    </SidePanel>
  );
}
