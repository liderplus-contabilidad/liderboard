"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { MoreHorizontal, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dropdown, DropdownChoice, DropdownPanel, useDropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/cn";
import { attentionOf } from "@/lib/schedule/attention";
import { TaskAttentionBadge } from "./task-attention-badge";
import { TaskDateField } from "./task-date-field";
import { TaskAssigneeField } from "./task-assignee-field";
import { working } from "@/lib/operations/model";
import type { ScheduleTask, Company, TaskValues } from "@/lib/operations/types";
import {
  TASK_STAGES,
  stagePatch,
  taskStage,
  taskStatus,
  taskStateLabel,
  type TaskStage,
} from "@/lib/schedule/model";

export const TASK_DRAG_TYPE = "application/x-liderplus-task";
export const TaskCard = memo(function TaskCard({
  task,
  company,
  today,
  patch,
  onOpen,
  showStage = false,
}: {
  task: ScheduleTask;
  company?: Company;
  today: string;
  patch: (id: string, value: Partial<TaskValues>) => Promise<void>;
  onOpen: (id: string, field?: "dueOn" | "person") => void;
  showStage?: boolean;
}) {
  const v = working(task);
  const name = company ? working(company).name : "Sin empresa";
  const late = taskStatus(v, today) === "late";
  const attention = attentionOf(v, today);
  const [busy, setBusy] = useState(false),
    [dragging, setDragging] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const start = (event: DragEvent) => {
      if (!event.dataTransfer) return;
      event.dataTransfer.setData(TASK_DRAG_TYPE, task.id);
      event.dataTransfer.effectAllowed = "move";
      setDragging(true);
    };
    const end = () => setDragging(false);
    card.addEventListener("dragstart", start);
    card.addEventListener("dragend", end);
    return () => {
      card.removeEventListener("dragstart", start);
      card.removeEventListener("dragend", end);
    };
  }, [task.id]);
  const move = useCallback(
    async (stage: TaskStage) => {
      setBusy(true);
      try {
        await patch(task.id, stagePatch(stage));
        return true;
      } catch {
        return false; /* Provider displays the error and preserves the saved stage. */
      } finally {
        setBusy(false);
      }
    },
    [patch, task.id],
  );

  return (
    <article
      ref={cardRef}
      aria-label={`Tarea ${v.title}`}
      draggable={!busy}
      data-drag-task={task.id}
      className={cn(
        "group min-w-0 rounded-[13px] border border-border bg-surface p-3 shadow-[0_2px_6px_rgba(15,23,42,0.04)] transition-colors hover:border-brand/30",
        attention === "late"
          ? "border-alert/40 bg-alert/5"
          : attention === "soon"
            ? "border-warning/40 bg-warning/5"
            : attention === "prepare"
              ? "border-brand/30 bg-brand/5"
              : "",
        dragging && "opacity-50",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 pt-1.5">
          <button
            type="button"
            aria-label={`Editar ${v.title}`}
            title={v.title}
            onClick={() => onOpen(task.id)}
            className={cn(
              "block w-full rounded-[9px] text-left text-[14px] font-semibold leading-snug text-ink outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-brand",
              v.done && "text-muted line-through",
            )}
          >
            {v.title}
          </button>
          <p title={name} className="mt-1 truncate text-[12px] text-muted">
            {name}
          </p>
          {attention && (
            <div className="mt-2">
              <TaskAttentionBadge state={attention} />
            </div>
          )}
          {v.notes && (
            <p title={v.notes} className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-muted">
              {v.notes}
            </p>
          )}
        </div>
        <Dropdown className="shrink-0">
          <CardActions
            title={v.title}
            stage={taskStage(v)}
            busy={busy}
            move={move}
            onOpen={() => onOpen(task.id)}
          />
        </Dropdown>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border-soft pt-2.5">
        <TaskDateField
          appearance="card"
          value={v}
          today={today}
          overdue={late}
          label={`Editar fecha de ${v.title}`}
          onCommit={(value) => patch(task.id, value)}
        />
        <TaskAssigneeField
          value={v.person}
          label={`Editar responsable de ${v.title}`}
          onCommit={(person) => patch(task.id, { person })}
        />
        {showStage && <Badge variant={`stage-${taskStage(v)}`}>{taskStateLabel(v, today)}</Badge>}
      </div>
    </article>
  );
});

function CardActions({
  title,
  stage,
  busy,
  move,
  onOpen,
}: {
  title: string;
  stage: TaskStage;
  busy: boolean;
  move: (stage: TaskStage) => Promise<boolean>;
  onOpen: () => void;
}) {
  const { open, setOpen, triggerRef } = useDropdown();
  return (
    <>
      <Button
        ref={triggerRef}
        size="sm"
        variant="ghost"
        iconOnly
        icon={<MoreHorizontal size={15} />}
        aria-label={`Acciones de ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={open ? "bg-brand-soft text-brand" : ""}
      />
      <DropdownPanel align="right" width={210}>
        <Button
          size="sm"
          variant="ghost"
          role="menuitem"
          tabIndex={0}
          icon={<Pencil size={14} />}
          className="w-full justify-start"
          onClick={() => {
            setOpen(false);
            onOpen();
          }}
        >
          Editar tarea
        </Button>
        <p className="mb-1 mt-2 border-t border-border-soft px-2 pt-3 text-[12px] text-muted">
          Mover a
        </p>
        {TASK_STAGES.map((option) => (
          <DropdownChoice
            key={option.value}
            selected={stage === option.value}
            disabled={busy || stage === option.value}
            onSelect={() =>
              void move(option.value).then((saved) => {
                if (saved) setOpen(false);
              })
            }
          >
            {option.label}
          </DropdownChoice>
        ))}
      </DropdownPanel>
    </>
  );
}
