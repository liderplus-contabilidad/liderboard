"use client";

import { Loader2, Upload } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Cell, HeadCell } from "@/components/data-table/grid-cells";
import { DataGrid } from "@/components/data-table/data-grid";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Checkbox } from "@/components/ui/checkbox";
import { ExcelUploadCard } from "@/components/ui/excel-upload-card";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { toast } from "@/components/ui/toaster";
import * as cashDb from "@/lib/cash-flow/db";
import { money } from "@/lib/cash-flow/derive";
import { isISODate } from "@/lib/cash-flow/dates";
import { detectCenters } from "@/lib/cash-flow/upload/center-labels";
import type { StoredPayableRow } from "@/lib/cash-flow/upload/liderplus";
import { LIDERPLUS_LABEL, type CarteraStrategy } from "@/lib/cash-flow/upload/registry";
import type { ParsedCartera } from "@/lib/cash-flow/types";
import { formatDayMonthYear } from "@/lib/date";
import { pluralize } from "@/lib/format";
import { useCashFlowData } from "./cash-flow-data-provider";

const PREVIEW_ROWS = 8;

type Staged =
  | { fileName: string; kind: "system"; strategy: CarteraStrategy; cartera: ParsedCartera }
  /** The module's own «Cartera para recargar»: put back as it is, marks included. */
  | { fileName: string; kind: "liderplus"; rows: StoredPayableRow[] };

/**
 * Loading a cartera, in the mockup's three steps inside ONE modal — subir → vista previa
 * normalizada → confirmar — with the two-phase shape every upload of this app has: the file is
 * PARSED on being picked and nothing is written until whoever loads it sees what it declares.
 *
 * What the preview shows is what the file SAYS about itself: which system wrote it, its razón
 * social (shown, never compared against the empresa's name — that label is the user's) and its
 * cut date. Contífico declares the cut; Dingoo does not, and the dialog asks for it with the bar's
 * date as default. Confirming applies the cut (`db.applyCut`): what comes is written, what stopped
 * coming is settled, and what the user wrote on a document survives.
 *
 * The module's own «Cartera para recargar» takes the other door: it is not a cut but the cartera
 * as it was exported, so confirming REPLACES what the empresa holds with it (`db.replaceCartera`),
 * marks included, and asks no cut date.
 *
 * The file's «Centro de costos» column is what says which CENTERS the empresa has, so the preview
 * DETECTS them (`detectCenters`) and proposes one center per label not yet declared, pre-checked —
 * as the check register's upload does with its banks. Confirming creates the checked ones first
 * (`createCentersForLabels`), so every document resolves its center from the first cut.
 */
export function PayablesUploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { activeClientId, asOf, centers } = useCashFlowData();
  const inputRef = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<Staged | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [cutDate, setCutDate] = useState<string>(asOf);
  const [failure, setFailure] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    setStaged(null);
    setFailure(null);
  }, []);

  const stagedRows = useMemo(
    () => (staged ? (staged.kind === "liderplus" ? staged.rows : staged.cartera.payables) : []),
    [staged],
  );
  const newCenters = useMemo(
    () => detectCenters(stagedRows, centers).filter((center) => !center.known),
    [stagedRows, centers],
  );

  const readFile = useCallback(
    async (file: File) => {
      setReading(true);
      setFailure(null);
      setStaged(null);
      try {
        const { readCartera } = await import("@/lib/cash-flow/upload/registry");
        const result = readCartera(await file.arrayBuffer());
        if (!result.ok) {
          setFailure(result.message);
          return;
        }
        const rows = result.kind === "liderplus" ? result.rows : result.cartera.payables;
        setPicked(
          new Set(
            detectCenters(rows, centers)
              .filter((center) => !center.known)
              .map((center) => center.name),
          ),
        );
        if (result.kind === "liderplus") {
          setStaged({ fileName: file.name, kind: "liderplus", rows: result.rows });
          return;
        }
        setStaged({
          fileName: file.name,
          kind: "system",
          strategy: result.strategy,
          cartera: result.cartera,
        });
        setCutDate(result.cartera.cutDate ?? asOf);
      } finally {
        setReading(false);
      }
    },
    [asOf, centers],
  );

  const togglePicked = useCallback((name: string) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

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
    if (staged.kind === "system" && !isISODate(cutDate)) {
      return;
    }
    setSaving(true);
    try {
      const summary = await cashDb.runCashFlowWrite(async () => {
        if (picked.size > 0) {
          await cashDb.createCentersForLabels(activeClientId, [...picked]);
        }
        return staged.kind === "liderplus"
          ? { written: await cashDb.replaceCartera(activeClientId, staged.rows), settled: 0 }
          : await cashDb.applyCut(activeClientId, staged.cartera, cutDate);
      });
      close();
      toast.success("Cartera incorporada al flujo", {
        description:
          pluralize(summary.written, "documento incorporado", "documentos incorporados") +
          (summary.settled > 0
            ? ` · ${pluralize(summary.settled, "documento liquidado", "documentos liquidados")} por no venir en este corte.`
            : "."),
        duration: summary.settled > 0 ? 8000 : undefined,
      });
    } catch {
      setFailure("No se pudo cargar la cartera. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  }, [staged, activeClientId, cutDate, picked, close]);

  const previewRows = stagedRows;
  const total = previewRows
    .filter((row) => !("status" in row) || row.status === "open")
    .reduce((acc, row) => acc + row.balance, 0);
  const settledCount =
    staged?.kind === "liderplus" ? staged.rows.filter((row) => row.status === "settled").length : 0;

  return (
    <Modal open={open} title="Cargar cartera por pagar" width={860} onClose={close}>
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
                {reading ? "Leyendo el archivo…" : "Elige la exportación de Contífico o de Dingoo"}
              </span>
              <span className="text-[11.5px] text-faint">.xlsx o .xls</span>
            </button>
          </>
        ) : (
          <>
            <ExcelUploadCard
              fileName={staged.fileName}
              notice={
                staged.kind === "system" && staged.cartera.skipped > 0
                  ? pluralize(
                      staged.cartera.skipped,
                      "fila de subtotal omitida",
                      "filas de subtotal omitidas",
                    )
                  : undefined
              }
              actionSlot={
                staged.kind === "system" && (
                  <FormField label="Fecha de corte" className="w-[150px] shrink-0 text-ink-soft">
                    <DateField
                      value={cutDate}
                      ariaLabel="Fecha de corte de la cartera"
                      onChange={(date) => date && setCutDate(date)}
                    />
                  </FormField>
                )
              }
            >
              <span className="w-full">
                {staged.kind === "liderplus" ? LIDERPLUS_LABEL : staged.strategy.label}
                {staged.kind === "system" &&
                  staged.cartera.companyName &&
                  ` · ${staged.cartera.companyName}`}
              </span>
              <span>
                <span className="tabular-nums">
                  {pluralize(previewRows.length, "documento")}
                  {settledCount > 0 && ` (${settledCount} liquidados)`}
                </span>
                {" · "}
                <span className="font-mono tabular-nums">{money(total)}</span>
                {staged.kind === "liderplus" && " abiertos"}
              </span>
            </ExcelUploadCard>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-[13px] font-semibold text-ink">Vista previa</h3>
                <span className="text-[11.5px] text-muted tabular-nums">
                  Primeras {Math.min(PREVIEW_ROWS, previewRows.length)} filas
                </span>
              </div>
              <DataGrid minWidth={800} containerClassName="max-h-[240px]">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <HeadCell>Proveedor</HeadCell>
                    <HeadCell>Documento</HeadCell>
                    <HeadCell>Vence</HeadCell>
                    <HeadCell align="right">Valor</HeadCell>
                    <HeadCell align="right">Pagos</HeadCell>
                    <HeadCell align="right">Saldo</HeadCell>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, PREVIEW_ROWS).map((row, index) => (
                    <tr key={index}>
                      <Cell className="max-w-[180px] truncate">{row.supplier}</Cell>
                      <Cell className="font-mono text-[11.5px] whitespace-nowrap">{`${row.docType} ${row.docNumber}`}</Cell>
                      <Cell className="text-muted tabular-nums whitespace-nowrap">
                        {formatDayMonthYear(row.dueOn) ?? "—"}
                      </Cell>
                      <Cell numeric>{money(row.amount)}</Cell>
                      <Cell numeric>{money(row.payments)}</Cell>
                      <Cell numeric strong value={row.balance}>
                        {money(row.balance)}
                      </Cell>
                    </tr>
                  ))}
                </tbody>
              </DataGrid>
            </div>

            {newCenters.length > 0 && (
              <section>
                <h3 className="text-[13px] font-semibold text-ink">Centros de costo nuevos</h3>
                <ul className="mt-3 max-h-[200px] overflow-y-auto divide-y divide-border-soft">
                  {newCenters.map((entry) => (
                    <li key={entry.name}>
                      <label className="flex cursor-pointer items-center gap-3 py-3 text-[12.5px] transition-colors hover:bg-canvas focus-within:bg-canvas">
                        <Checkbox
                          size={18}
                          checked={picked.has(entry.name)}
                          ariaLabel={`Crear centro ${entry.name}`}
                          onChange={() => togglePicked(entry.name)}
                        />
                        <span className="min-w-0 flex-1 font-semibold break-words text-ink">
                          {entry.name}
                        </span>
                        <span className="shrink-0 text-muted tabular-nums">
                          {pluralize(entry.count, "documento")}
                        </span>
                        <span className="w-[120px] shrink-0 text-right text-[11.5px] text-muted">
                          {picked.has(entry.name) ? "Se creará el centro" : "Sin asignar"}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="sticky bottom-0 z-20 flex flex-col gap-3 border-t border-border-soft bg-surface pt-4">
              {staged.kind === "liderplus" ? (
                <p className="rounded-[10px] border border-warning/40 bg-warning/5 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-ink">
                  Es la cartera que exportó este módulo: al confirmar{" "}
                  <strong className="font-semibold">se reemplaza toda la cartera actual</strong> por
                  la del archivo, con sus marcas y observaciones.
                </p>
              ) : (
                <p className="text-[12.5px] leading-relaxed text-muted">
                  Los documentos que ya existen conservan sus marcas; los que este corte no trae se
                  liquidan a la fecha de corte.
                </p>
              )}

              <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" size="md" disabled={saving} onClick={reset}>
                  Elegir otro archivo
                </Button>
                <Button
                  size="md"
                  disabled={saving || (staged.kind === "system" && !isISODate(cutDate))}
                  onClick={() => void confirm()}
                >
                  {saving
                    ? "Aplicando…"
                    : staged.kind === "liderplus"
                      ? "Reemplazar la cartera"
                      : "Confirmar e incorporar"}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
