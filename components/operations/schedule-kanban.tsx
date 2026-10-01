"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { working } from "@/lib/operations/model";
import { TASK_STAGES, stagePatch, taskStage, type TaskStage } from "@/lib/schedule/model";
import { useOperations } from "./operations-provider";
import { TASK_DRAG_TYPE, TaskCard } from "./task-card";

export function ScheduleKanban({
  onOpen,
  onCreate,
}: {
  onOpen: (id: string, field?: "dueOn" | "person") => void;
  onCreate: (stage: TaskStage) => void;
}) {
  const ops = useOperations(),
    [dragOver, setDragOver] = useState<TaskStage | null>(null);
  const companies = useMemo(() => new Map(ops.companies.map((c) => [c.id, c])), [ops.companies]);
  return (
    <div
      className="grid grid-cols-3 items-start gap-5 rounded-[13px] border border-border bg-surface p-3"
      aria-label="Tablero Kanban"
    >
      {TASK_STAGES.map((stage) => {
        const tasks = ops.filteredTasks.filter((t) => taskStage(working(t)) === stage.value);
        return (
          <div
            key={stage.value}
            data-task-stage={stage.value}
            aria-label={stage.label}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(TASK_DRAG_TYPE)) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOver(stage.value);
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const id = e.dataTransfer.getData(TASK_DRAG_TYPE);
              if (ops.filteredTasks.some((t) => t.id === id))
                void ops.patchTask(id, stagePatch(stage.value)).catch(() => {});
            }}
            className={`min-h-[240px] min-w-0 rounded-[13px] border p-2 ${dragOver === stage.value ? "border-brand bg-brand-soft" : "border-transparent"}`}
          >
            <header className="mb-3 flex items-center gap-2 border-b border-border-soft px-1 pb-3">
              <h2 className="text-[14px] font-semibold text-brand">{stage.label}</h2>
              <span className="rounded-full bg-brand-soft px-2 py-0.5 font-mono text-[12px] text-brand tabular-nums">
                {tasks.length}
              </span>
            </header>
            <div className="space-y-2.5">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  company={companies.get(task.companyId)}
                  today={ops.today}
                  patch={ops.patchTask}
                  onOpen={onOpen}
                />
              ))}
            </div>
            {!tasks.length && (
              <p className="px-3 py-5 text-[13px] text-muted">
                Sin tareas{" "}
                {stage.value === "doing"
                  ? "en curso"
                  : stage.value === "done"
                    ? "hechas"
                    : "pendientes"}
                .
              </p>
            )}
            <Button
              size="toolbar"
              variant="ghost"
              icon={<Plus size={14} />}
              className="mt-2 w-full justify-start"
              disabled={!ops.companies.length}
              aria-label={`Agregar tarea en ${stage.label}`}
              onClick={() => onCreate(stage.value)}
            >
              Agregar tarea
            </Button>
          </div>
        );
      })}
    </div>
  );
}
