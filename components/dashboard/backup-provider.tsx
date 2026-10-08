"use client";

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
import { flushSync } from "react-dom";
import { usePathname } from "next/navigation";
import { backupFilename, serializeBackup } from "@/lib/backup";
import { cashFlowBackupAdapter } from "@/lib/cash-flow/backup";
import { downloadBlob } from "@/lib/download";
import { todayISO } from "@/lib/cash-flow/dates";
import { useFilterNamespaceReset } from "@/components/dashboard/filter-state";
import type { BackupEnvelope } from "@/lib/backup";
import type { CashFlowBackupTables } from "@/lib/cash-flow/backup";
import { captureCashFlowBackup, restoreCashFlowBackup } from "@/lib/cash-flow/db";
import { CashFlowBackupModal } from "@/components/cash-flow/cash-flow-backup-modal";
import { BackupManagerModal } from "./backup-manager-modal";

const BackupContext = createContext<{
  open: (trigger: HTMLElement) => void;
  restoring: boolean;
  generation: number;
} | null>(null);

/** Global access; only the cash-flow view participates in its restore boundary. */
export function BackupProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [generation, setGeneration] = useState(0);
  const running = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const reset = useFilterNamespaceReset();
  const show = useCallback((trigger: HTMLElement) => {
    returnFocus.current = trigger;
    setOpen(true);
  }, []);
  useEffect(() => {
    if (!open && !file) {
      returnFocus.current?.focus();
      returnFocus.current = null;
    }
  }, [open, file]);
  const download = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setDownloading(true);
    try {
      const checkpoint = await captureCashFlowBackup();
      downloadBlob(
        new Blob([serializeBackup(checkpoint, cashFlowBackupAdapter)], {
          type: "application/json",
        }),
        backupFilename(checkpoint),
      );
    } finally {
      running.current = false;
      setDownloading(false);
    }
  }, []);
  const restore = useCallback(
    async (backup: BackupEnvelope<CashFlowBackupTables>) => {
      if (running.current) throw new Error("Ya hay una restauración en curso.");
      running.current = true;
      const resetView = pathname.startsWith("/cash-flow");
      try {
        await restoreCashFlowBackup(backup, undefined, () => {
          if (resetView) flushSync(() => setRestoring(true));
        });
        // This stage follows the commit: its failure must never be reported as a rollback.
        let refreshed = false;
        try {
          refreshed = reset(
            "cash-flow",
            [
              "checks.collectionFilter",
              "checks.tableSort",
              "cash-flow:cartera-columns",
              "cash-flow:marked-columns",
            ],
            { "cash-flow.asOf": todayISO() },
          );
        } catch {
          /* The data commit already succeeded. */
        }
        // Other modules keep their mounted page, editors and shell state.
        if (resetView) setGeneration((value) => value + 1);
        return refreshed;
      } finally {
        running.current = false;
        setRestoring(false);
      }
    },
    [reset, pathname],
  );
  const actions = useMemo(
    () => ({ open: show, restoring, generation }),
    [show, restoring, generation],
  );
  return (
    <BackupContext.Provider value={actions}>
      {children}
      {file ? (
        <CashFlowBackupModal
          file={file}
          download={download}
          onClose={() => {
            if (!restoring) setFile(null);
          }}
          onDone={() => {
            setFile(null);
            setOpen(false);
          }}
          restore={restore}
        />
      ) : open ? (
        <BackupManagerModal
          downloading={downloading}
          onDownload={download}
          onRestore={setFile}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </BackupContext.Provider>
  );
}

export function useBackups() {
  const actions = useContext(BackupContext);
  if (!actions) throw new Error("useBackups must be used within BackupProvider");
  return actions;
}

/** Editors unmount before replacement; the global sidebar and modal remain mounted. */
export function CashFlowBackupBoundary({ children }: { children: ReactNode }) {
  const { restoring, generation } = useBackups();
  if (restoring) return null;
  return (
    <div key={generation} className="contents">
      {children}
    </div>
  );
}
