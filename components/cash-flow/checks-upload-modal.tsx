"use client";

import { Check, FileSpreadsheet, Landmark, Loader2, Upload } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/modal";
import { NoticeBanner } from "@/components/ui/notice-banner";
import * as cashDb from "@/lib/cash-flow/db";
import { money } from "@/lib/cash-flow/derive";
import { detectBanks } from "@/lib/cash-flow/upload/bank-labels";
import type { ParsedChecksLog } from "@/lib/cash-flow/upload/checks-log";
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
  const [done, setDone] = useState<cashDb.ChecksImportSummary | null>(null);

  const reset = useCallback(() => {
    setStaged(null);
    setFailure(null);
    setDone(null);
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

  const confirm = useCallback(async () => {
    if (!staged || !activeClientId) {
      return;
    }
    setSaving(true);
    try {
      if (picked.size > 0) {
        await cashDb.createAccountsForBanks(activeClientId, [...picked]);
      }
      setDone(await cashDb.importChecks(activeClientId, staged.log.checks));
    } finally {
      setSaving(false);
    }
  }, [staged, activeClientId, picked]);

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

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const total = staged
    ? staged.log.checks.filter((c) => !c.voided).reduce((acc, c) => acc + c.amount, 0)
    : 0;

  return (
    <Modal open={open} title="Cargar control de cheques" width={560} onClose={close}>
      <div className="flex flex-col gap-4 px-5 pb-5">
        <input
          ref={inputRef}
          type="file"
          accept=".xls,.xlsx"
          onChange={onPick}
          className="hidden"
        />
        {done ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-positive/10 text-positive">
              <Check size={22} />
            </span>
            <p className="text-[15px] font-bold text-ink">Histórico incorporado</p>
            <p className="max-w-[420px] text-[12.5px] text-muted">
              {pluralize(done.written, "cheque")} escritos
              {done.unassigned > 0 &&
                ` · ${done.unassigned} sin cuenta reconocida (asígnalos desde «Sin cuenta»)`}
              .
            </p>
            <Button size="sm" onClick={close}>
              Listo
            </Button>
          </div>
        ) : !staged ? (
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
              <span className="text-[11.5px] text-faint">
                CHEQUES INICIO.xlsx · se puede recargar: el egreso es la identidad
              </span>
            </button>
            {failure && <NoticeBanner>{failure}</NoticeBanner>}
          </>
        ) : (
          <>
            <div className="flex items-start gap-3 rounded-[9px] border border-border bg-surface-muted px-4 py-3">
              <FileSpreadsheet size={18} className="mt-0.5 shrink-0 text-brand" />
              <div className="min-w-0 flex-1 text-[12.5px]">
                <div className="truncate font-semibold text-ink">{staged.fileName}</div>
                <div className="text-muted">
                  {pluralize(staged.log.checks.length, "cheque")} · {money(total)} girados
                  {staged.log.skipped > 0 &&
                    ` · ${pluralize(staged.log.skipped, "fila")} vacías ignoradas`}
                </div>
              </div>
            </div>
            <div className="rounded-[9px] border border-border">
              <div className="flex items-center gap-2 border-b border-border bg-surface-muted px-3.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint">
                <Landmark size={13} />
                Bancos que nombra el libro · marca los que son cuentas de la empresa
              </div>
              <ul className="divide-y divide-border-soft">
                {detected.map((entry) => (
                  <li
                    key={entry.bank}
                    className="flex items-center gap-3 px-3.5 py-2 text-[12.5px]"
                  >
                    {entry.known ? (
                      <Check size={16} className="text-positive" />
                    ) : (
                      <Checkbox
                        size={16}
                        checked={picked.has(entry.bank)}
                        ariaLabel={`Crear cuenta ${entry.bank}`}
                        onChange={() => togglePicked(entry.bank)}
                      />
                    )}
                    <span className="flex-1 font-semibold text-ink">{entry.bank}</span>
                    <span className="text-faint">{pluralize(entry.count, "cheque")}</span>
                    <span className="w-[150px] text-right text-[11.5px] text-faint">
                      {entry.known
                        ? "ya es una cuenta"
                        : entry.suggested
                          ? "se creará la cuenta"
                          : "no parece un banco"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="rounded-[10px] border border-border bg-surface-muted px-3.5 py-2.5 text-[11.5px] leading-relaxed text-ink-soft">
              Cada fila se escribe por su N° EGRESO: recargar el libro actualiza lo que cambió y no
              duplica nada. Las cuentas marcadas se crean sin número ni sobregiro —se completan en
              «Configurar»— y cada cheque encuentra la suya; lo que no case queda «sin cuenta»,
              visible y fuera de toda suma.
            </p>
            <div className="flex items-center justify-between gap-2">
              <Button variant="secondary" size="sm" disabled={saving} onClick={reset}>
                Elegir otro archivo
              </Button>
              <Button size="sm" disabled={saving} onClick={() => void confirm()}>
                {saving ? "Escribiendo…" : "Confirmar e incorporar"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
