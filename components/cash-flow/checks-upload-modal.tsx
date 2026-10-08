"use client";

import { Check, Loader2, Upload } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ExcelUploadCard } from "@/components/ui/excel-upload-card";
import { Modal } from "@/components/ui/modal";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { toast } from "@/components/ui/toaster";
import * as cashDb from "@/lib/cash-flow/db";
import { money } from "@/lib/cash-flow/derive";
import { detectBanks } from "@/lib/cash-flow/upload/bank-labels";
import type { ParsedChecksLog } from "@/lib/cash-flow/upload/checks-log";
import { cn } from "@/lib/cn";
import { pluralize } from "@/lib/format";
import { useCashFlowData } from "./cash-flow-data-provider";

const REJECTION =
  "Este archivo no es el control de cheques. Se espera la hoja con N° EGRESO · BANCO · NOMBRE · CHEQUE · VALOR · FECHA DE EMISION.";

/**
 * Loading the register's book: parsed on being picked, written on confirm, upserting by voucher —
 * so the whole history can be reloaded any number of times without duplicating a row.
 *
 * The book's BANCO column is what says which accounts the empresa has, so the preview DETECTS them
 * (`detectBanks`) and proposes one account per real bank not yet declared, pre-checked; the cash
 * boxes and the annulments are listed unchecked, for the user to decide. Confirming creates the
 * checked ones first (`createAccountsForBanks`) and then writes the checks, so each resolves its
 * account at the door. The summary says how many came in and how many still resolved none.
 */
export function ChecksUploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { activeClientId, accounts } = useCashFlowData();
  const inputRef = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<{ fileName: string; log: ParsedChecksLog } | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [failure, setFailure] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    setStaged(null);
    setFailure(null);
  }, []);

  const detected = useMemo(
    () => (staged ? detectBanks(staged.log.checks, accounts) : []),
    [staged, accounts],
  );

  const readFile = useCallback(
    async (file: File) => {
      setReading(true);
      setFailure(null);
      setStaged(null);
      try {
        const [{ readGrid, readWorkbook }, { matchesChecksLog, parseChecksLog }] =
          await Promise.all([
            import("@/lib/excel/workbook"),
            import("@/lib/cash-flow/upload/checks-log"),
          ]);
        const workbook = readWorkbook(await file.arrayBuffer());
        const grid = workbook
          ? workbook.SheetNames.map((name) => readGrid(workbook, name)).find(
              (candidate) => candidate && matchesChecksLog(candidate),
            )
          : null;
        if (!grid) {
          setFailure(REJECTION);
          return;
        }
        const log = parseChecksLog(grid);
        setStaged({ fileName: file.name, log });
        setPicked(
          new Set(
            detectBanks(log.checks, accounts)
              .filter((bank) => bank.suggested)
              .map((bank) => bank.bank),
          ),
        );
      } finally {
        setReading(false);
      }
    },
    [accounts],
  );

  const onPick = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) {
        void readFile(file);
      }
    },
    [readFile],
  );

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const confirm = useCallback(async () => {
    if (!staged || !activeClientId) {
      return;
    }
    setSaving(true);
    try {
      const summary = await cashDb.runCashFlowWrite(async () => {
        if (picked.size > 0) {
          await cashDb.createAccountsForBanks(activeClientId, [...picked]);
        }
        return cashDb.importChecks(activeClientId, staged.log.checks);
      });
      close();
      const description =
        pluralize(summary.written, "cheque incorporado", "cheques incorporados") +
        (summary.unassigned > 0 ? ` · ${summary.unassigned} sin cuenta reconocida.` : ".");
      if (summary.unassigned > 0) {
        toast.warning("Control de cheques incorporado", { description, duration: 8000 });
      } else {
        toast.success("Control de cheques incorporado", { description });
      }
    } catch {
      setFailure("No se pudo cargar el control de cheques. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  }, [staged, activeClientId, picked, close]);

  const togglePicked = useCallback((bank: string) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(bank)) {
        next.delete(bank);
      } else {
        next.add(bank);
      }
      return next;
    });
  }, []);

  const total = staged
    ? staged.log.checks.filter((c) => !c.voided).reduce((acc, c) => acc + c.amount, 0)
    : 0;

  return (
    <Modal open={open} title="Cargar control de cheques" width={560} onClose={close}>
      <div className="flex flex-col gap-6">
        <input
          ref={inputRef}
          type="file"
          accept=".xls,.xlsx"
          onChange={onPick}
          className="hidden"
        />
        {failure && <NoticeBanner>{failure}</NoticeBanner>}
        {!staged ? (
          <>
            <button
              type="button"
              disabled={reading}
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-[9px] border border-dashed border-border bg-surface-muted px-5 py-10 text-center transition-colors hover:border-brand disabled:cursor-progress"
            >
              {reading ? (
                <Loader2 size={22} className="animate-spin text-brand" />
              ) : (
                <Upload size={22} className="text-faint" />
              )}
              <span className="text-[13px] font-semibold text-ink">
                {reading ? "Leyendo el archivo…" : "Elige el libro del control de cheques"}
              </span>
              <span className="text-[11.5px] text-faint">.xlsx o .xls</span>
            </button>
          </>
        ) : (
          <>
            <ExcelUploadCard
              fileName={staged.fileName}
              notice={
                staged.log.skipped > 0
                  ? pluralize(staged.log.skipped, "fila vacía omitida", "filas vacías omitidas")
                  : undefined
              }
            >
              <span>
                <span className="tabular-nums">
                  {pluralize(staged.log.checks.length, "cheque")}
                </span>
                {" · "}
                <span className="font-mono tabular-nums">{money(total)}</span> girados
              </span>
            </ExcelUploadCard>
            <section>
              <h3 className="text-[13px] font-semibold text-ink">Cuentas bancarias</h3>
              <ul className="mt-3 max-h-[240px] overflow-y-auto divide-y divide-border-soft">
                {detected.map((entry) => {
                  const Row = entry.known ? "div" : "label";
                  return (
                    <li key={entry.bank}>
                      <Row
                        className={cn(
                          "flex items-center gap-3 py-3 text-[12.5px]",
                          !entry.known &&
                            "cursor-pointer transition-colors hover:bg-canvas focus-within:bg-canvas",
                        )}
                      >
                        {entry.known ? (
                          <Check size={18} className="shrink-0 text-brand" aria-hidden="true" />
                        ) : (
                          <Checkbox
                            size={18}
                            checked={picked.has(entry.bank)}
                            ariaLabel={`Crear cuenta ${entry.bank}`}
                            onChange={() => togglePicked(entry.bank)}
                          />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold break-words text-ink">
                            {entry.bank}
                          </span>
                          {!entry.known && !entry.suggested && (
                            <span className="block text-[11.5px] text-muted">
                              No parece un banco
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-muted tabular-nums">
                          {pluralize(entry.count, "cheque")}
                        </span>
                        <span className="w-[112px] shrink-0 text-right text-[11.5px] text-muted">
                          {entry.known
                            ? "Cuenta existente"
                            : picked.has(entry.bank)
                              ? "Se creará la cuenta"
                              : "Sin asignar"}
                        </span>
                      </Row>
                    </li>
                  );
                })}
              </ul>
            </section>
            <div className="flex items-center justify-between gap-3 border-t border-border-soft pt-4">
              <Button variant="ghost" size="md" disabled={saving} onClick={reset}>
                Elegir otro archivo
              </Button>
              <Button size="md" disabled={saving} onClick={() => void confirm()}>
                {saving ? "Escribiendo…" : "Confirmar e incorporar"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
