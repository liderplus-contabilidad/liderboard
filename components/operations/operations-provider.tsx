"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as db from "@/lib/operations/db";
import { working } from "@/lib/operations/model";
import { companySelection } from "@/lib/operations/company-filters";
import type {
  Access,
  AccessValues,
  Company,
  CompanyValues,
  Obligation,
  OperationsImport,
  ScheduleTask,
  TaskValues,
} from "@/lib/operations/types";
import { todayLocal, type SchedulePresentation } from "@/lib/schedule/model";
import { calendarScope } from "@/lib/schedule/calendar";
import { visibleTasks } from "@/lib/schedule/scope";
import { taskTypeOptions } from "@/lib/schedule/task-types";

interface OperationsContextValue {
  companies: Company[];
  accesses: Access[];
  obligations: Obligation[];
  tasks: ScheduleTask[];
  loading: boolean;
  unlocked: boolean;
  hasVault: boolean;
  key: CryptoKey | null;
  search: string;
  setSearch: (v: string) => void;
  companyId: string;
  setCompanyId: (v: string) => void;
  companySelection: ReturnType<typeof companySelection>;
  groupId: string;
  setGroupId: (v: string) => void;
  detailCompanyId: string;
  setDetailCompanyId: (id: string) => void;
  openCompanySchedule: (id: string) => void;
  period: string;
  setPeriod: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
  person: string;
  taskType: string;
  setTaskType: (value: string) => void;
  taskTypes: ReturnType<typeof taskTypeOptions>;
  setPerson: (v: string) => void;
  filteredTasks: ScheduleTask[];
  scheduleView: SchedulePresentation;
  setScheduleView: (view: SchedulePresentation) => void;
  calendarMonth: string;
  setCalendarMonth: (month: string) => void;
  today: string;
  saving: number;
  error: string | null;
  clearError: () => void;
  save: <T>(operation: () => Promise<T>) => Promise<T>;
  unlock: (password: string) => Promise<void>;
  lock: () => void;
  patchCompany: (id: string, patch: Partial<CompanyValues>) => Promise<void>;
  patchAccess: (id: string, patch: Partial<AccessValues>) => Promise<void>;
  patchTask: (id: string, patch: Partial<TaskValues>) => Promise<void>;
  patchObligation: (
    id: string,
    patch: Partial<Pick<Obligation, "applies" | "interpretation" | "notes" | "label">>,
  ) => Promise<void>;
  commitImport: (incoming: OperationsImport, name: string) => Promise<void>;
}

const Context = createContext<OperationsContextValue | null>(null);
const EMPTY_PUBLIC = {
  companies: [] as Company[],
  obligations: [] as Obligation[],
  tasks: [] as ScheduleTask[],
  hasVault: false,
};

export function OperationsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [key, setKey] = useState<CryptoKey | null>(null);
  const live = useLiveQuery(() => db.readPublic(), []);
  const accesses = useLiveQuery(() => (key ? db.readAccesses(key) : Promise.resolve([])), [key]);
  const data = live ?? EMPTY_PUBLIC;
  const [searches, setSearches] = useState({ credentials: "", schedule: "" });
  const domain = usePathname().startsWith("/schedule") ? "schedule" : "credentials";
  const search = searches[domain];
  const setSearch = useCallback(
    (value: string) => setSearches((current) => ({ ...current, [domain]: value })),
    [domain],
  );
  const [companyMark, setCompanyId] = useState("");
  const [groupMark, setGroupMark] = useState("");
  const [detailCompanyId, setDetailCompanyId] = useState("");
  const selection = useMemo(
    () => companySelection(data.companies, groupMark, companyMark),
    [data.companies, groupMark, companyMark],
  );
  const { companyId, groupId } = selection;
  const setGroupId = useCallback(
    (group: string) => {
      setGroupMark(group);
      setCompanyId((current) => companySelection(data.companies, group, current).companyId);
    },
    [data.companies],
  );
  const [periodMark, setPeriod] = useState(""),
    [status, setStatus] = useState(""),
    [person, setPerson] = useState("");
  const [taskTypeMark, setTaskType] = useState("");
  const taskTypes = useMemo(() => taskTypeOptions(data.tasks), [data.tasks]);
  const taskType = taskTypes.some((option) => option.value === taskTypeMark) ? taskTypeMark : "";
  const [saving, setSaving] = useState(0),
    [error, setError] = useState<string | null>(null);
  const session = useRef(0);
  useEffect(() => {
    if (key)
      void db
        .migrateCompanyDetails(key)
        .catch((cause) =>
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudieron recuperar los campos anteriores.",
          ),
        );
  }, [key]);
  const [today, setToday] = useState(todayLocal);
  useEffect(() => {
    // The global due alert must advance even when the app stays open overnight.
    const refresh = () => setToday(todayLocal());
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const [scheduleView, setScheduleView] = useState<SchedulePresentation>("agenda");
  const [calendarMonthMark, setCalendarMonth] = useState("");
  const openCompanySchedule = useCallback(
    (id: string) => {
      setGroupMark("");
      setCompanyId(id);
      setSearches((current) => ({ ...current, schedule: "" }));
      setStatus("");
      setPerson("");
      setTaskType("");
      setPeriod("*");
      setScheduleView("agenda");
      router.push("/schedule");
    },
    [router],
  );
  const calendarMonth =
    calendarMonthMark ||
    data.tasks
      .map((t) => working(t).dueOn)
      .filter((date): date is string => !!date)
      .sort()
      .at(-1)
      ?.slice(0, 7) ||
    today.slice(0, 7);
  const period =
    periodMark ||
    data.tasks
      .map((t) => working(t).period)
      .sort()
      .at(-1) ||
    today.slice(0, 7);
  const save = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    setSaving((n) => n + 1);
    setError(null);
    try {
      return await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar. Inténtalo de nuevo.");
      throw cause;
    } finally {
      setSaving((n) => n - 1);
    }
  }, []);
  const unlock = useCallback(
    async (password: string) => {
      const token = ++session.current;
      const opened = await save(() =>
        data.hasVault ? db.unlockSpace(password) : db.createSpace(password),
      );
      if (token === session.current) setKey(opened);
    },
    [data.hasVault, save],
  );
  const lock = useCallback(() => {
    session.current++;
    setKey(null);
  }, []);
  const patchCompany = useCallback(
    (id: string, patch: Partial<CompanyValues>) => save(() => db.patchCompany(id, patch)),
    [save],
  );
  const patchAccess = useCallback(
    (id: string, patch: Partial<AccessValues>) => {
      if (!key) return Promise.reject(new Error("Desbloquea el espacio de claves."));
      return save(() => db.patchAccess(id, patch, key));
    },
    [key, save],
  );
  const patchTask = useCallback(
    (id: string, patch: Partial<TaskValues>) => save(() => db.patchTask(id, patch)),
    [save],
  );
  const patchObligation = useCallback(
    (
      id: string,
      patch: Partial<Pick<Obligation, "applies" | "interpretation" | "notes" | "label">>,
    ) => save(() => db.patchObligation(id, patch)),
    [save],
  );
  const commitImport = useCallback(
    async (incoming: OperationsImport, name: string) => {
      if (incoming.kind === "keys") {
        if (!key) throw new Error("Desbloquea el espacio antes de cargar las claves.");
        await save(() => db.importKeys(incoming, key, name));
      } else {
        await save(() => db.importSchedule(incoming));
        setPeriod(
          incoming.tasks
            .map((t) => working(t).period)
            .sort()
            .at(-1) ?? "",
        );
        setCalendarMonth(
          incoming.tasks
            .map((t) => working(t).dueOn)
            .filter((date): date is string => !!date)
            .sort()
            .at(-1)
            ?.slice(0, 7) ||
            incoming.tasks
              .map((t) => working(t).period)
              .sort()
              .at(-1) ||
            today.slice(0, 7),
        );
      }
    },
    [key, save, today],
  );
  const filteredTasks = useMemo(() => {
    const rows = visibleTasks(
      data.tasks,
      data.companies,
      {
        period: scheduleView === "calendar" ? "*" : period,
        companyId,
        groupId,
        search,
        status,
        person,
        taskType,
      },
      today,
    );
    return scheduleView === "calendar" ? calendarScope(rows, calendarMonth) : rows;
  }, [
    data.tasks,
    data.companies,
    period,
    companyId,
    groupId,
    search,
    status,
    person,
    taskType,
    today,
    scheduleView,
    calendarMonth,
  ]);
  const value: OperationsContextValue = {
    ...data,
    companies: data.companies,
    accesses: key ? (accesses ?? []) : [],
    key,
    unlocked: key !== null,
    loading: live === undefined,
    search,
    setSearch,
    companyId,
    setCompanyId,
    companySelection: selection,
    groupId,
    setGroupId,
    detailCompanyId,
    setDetailCompanyId,
    openCompanySchedule,
    period,
    setPeriod,
    status,
    setStatus,
    person,
    setPerson,
    taskType,
    setTaskType,
    taskTypes,
    filteredTasks,
    scheduleView,
    setScheduleView,
    calendarMonth,
    setCalendarMonth,
    today,
    saving,
    error,
    clearError: () => setError(null),
    save,
    unlock,
    lock,
    patchCompany,
    patchAccess,
    patchTask,
    patchObligation,
    commitImport,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useOperations() {
  const value = useContext(Context);
  if (!value) throw new Error("OperationsProvider is required.");
  return value;
}
