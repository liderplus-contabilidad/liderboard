"use client";

import { ArrowRight, Check, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Cell, HeadCell } from "@/components/data-table/grid-cells";
import { DataGrid } from "@/components/data-table/data-grid";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { NoticeBanner } from "@/components/ui/notice-banner";
import * as cashDb from "@/lib/cash-flow/db";
import { money } from "@/lib/cash-flow/derive";
import { isISODate } from "@/lib/cash-flow/dates";
import type { CarteraStrategy } from "@/lib/cash-flow/upload/registry";
import type { ParsedCartera } from "@/lib/cash-flow/types";
import { formatDayMonthYear } from "@/lib/date";
import { pluralize } from "@/lib/format";
import { useCashFlowData } from "./cash-flow-data-provider";

const PREVIEW_ROWS = 8;

interface Staged {
  fileName: string;
  strategy: CarteraStrategy;
  cartera: ParsedCartera;
}

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
 */
export function PayablesUploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { activeClientId, asOf } = useCashFlowData();
  const inputRef = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<Staged | null>(null);
  const [cutDate, setCutDate] = useState<string>(asOf);
  const [failure, setFailure] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<cashDb.CutSummary | null>(null);

  const reset = useCallback(() => {
    setStaged(null);
    setFailure(null);
    setDone(null);
  }, []);

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
        setStaged({ fileName: file.name, strategy: result.strategy, cartera: result.cartera });
        setCutDate(result.cartera.cutDate ?? asOf);
      } finally {
        setReading(false);
      }
    },
    [asOf],
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
    if (!staged || !activeClientId || !isISODate(cutDate)) {
      return;
    }
    setSaving(true);
    try {
      setDone(await cashDb.applyCut(activeClientId, staged.cartera, cutDate));
    } finally {
      setSaving(false);
    }
  }, [staged, activeClientId, cutDate]);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const total = staged ? staged.cartera.payables.reduce((acc, row) => acc + row.balance, 0) : 0;

  return (
    <Modal open={open} title="Cargar cartera por pagar" width={720} onClose={close}>
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
            <p className="text-[15px] font-bold text-ink">Cartera incorporada al flujo</p>
            <p className="max-w-[440px] text-[12.5px] text-muted">
              {pluralize(done.written, "documento")} escritos
              {done.settled > 0 &&
                ` · ${pluralize(done.settled, "documento")} liquidados por no venir en este corte`}
              . La antigüedad y el estado se leen a la fecha de corte; nada se copia ni se pega a
              mano.
            </p>
            <Button size="sm" onClick={close}>
              Ir a Cuentas por pagar
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
                {reading ? "Leyendo el archivo…" : "Elige la exportación de Contífico o de Dingoo"}
              </span>
              <span className="text-[11.5px] text-faint">
                .xlsx o .xls · el formato se detecta solo
              </span>
            </button>
            {failure && <NoticeBanner>{failure}</NoticeBanner>}
            <div className="grid grid-cols-2 gap-3">
              <SourceCard
                name="Contífico"
                fmt="Cartera por Pagar (Detallado)"
                desc="Tabla plana con fecha de corte; también pegada en las hojas VENCIDA y POR VENCER del FORMATO IDEAL."
              />
              <SourceCard
                name="Dingoo"
                fmt="Reporte · Cuentas por pagar"
                desc="Reporte por proveedor con sus facturas y cuotas. No declara corte: se pide al confirmar."
              />
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3 rounded-[9px] border border-border bg-surface-muted px-4 py-3">
              <FileSpreadsheet size={18} className="mt-0.5 shrink-0 text-brand" />
              <div className="min-w-0 flex-1 text-[12.5px]">
                <div className="truncate font-semibold text-ink">{staged.fileName}</div>
                <div className="text-muted">
                  {staged.strategy.label}
                  {staged.cartera.companyName && ` · ${staged.cartera.companyName}`}
                  {" · "}
                  {pluralize(staged.cartera.payables.length, "documento")} · {money(total)}
                  {staged.cartera.skipped > 0 &&
                    ` · ${pluralize(staged.cartera.skipped, "fila")} de subtotal ignoradas`}
                </div>
              </div>
              <FormField label="Fecha de corte" className="w-[150px]">
                <input
                  type="date"
                  value={cutDate}
                  aria-label="Fecha de corte de la cartera"
                  onChange={(event) => setCutDate(event.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-[9px] py-1.5 font-sans text-[13px] tabular-nums text-ink outline-none focus:border-brand"
                />
              </FormField>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
                Vista previa normalizada · primeras{" "}
                {Math.min(PREVIEW_ROWS, staged.cartera.payables.length)} filas
              </p>
              <DataGrid>
                <thead>
                  <tr>
                    <HeadCell>Proveedor</HeadCell>
                    <HeadCell>Documento</HeadCell>
                    <HeadCell>Emisión</HeadCell>
                    <HeadCell>Vence</HeadCell>
                    <HeadCell align="right">Valor</HeadCell>
                    <HeadCell align="right">Pagos</HeadCell>
                    <HeadCell align="right">Saldo</HeadCell>
                  </tr>
                </thead>
                <tbody>
                  {staged.cartera.payables.slice(0, PREVIEW_ROWS).map((row, index) => (
                    <tr key={index}>
                      <Cell className="max-w-[220px] truncate">{row.supplier}</Cell>
                      <Cell className="font-mono text-[11.5px]">{`${row.docType} ${row.docNumber}`}</Cell>
                      <Cell className="tabular-nums text-muted">
                        {formatDayMonthYear(row.issuedOn) ?? "—"}
                      </Cell>
                      <Cell className="tabular-nums text-muted">
                        {formatDayMonthYear(row.dueOn) ?? "—"}
                      </Cell>
                      <Cell numeric tone="muted">
                        {money(row.amount)}
                      </Cell>
                      <Cell numeric tone="muted">
                        {money(row.payments)}
                      </Cell>
                      <Cell numeric strong value={row.balance}>
                        {money(row.balance)}
                      </Cell>
                    </tr>
                  ))}
                </tbody>
              </DataGrid>
            </div>

            <p className="rounded-[10px] border border-border bg-surface-muted px-3.5 py-2.5 text-[11.5px] leading-relaxed text-ink-soft">
              Al confirmar, cada documento se escribe por su identidad (proveedor · tipo · número) y
              conserva lo que ya tenía anotado; lo que este corte ya no trae se da por liquidado a
              la fecha de corte. Las obligaciones manuales no se tocan.
            </p>

            <div className="flex items-center justify-between gap-2">
              <Button variant="secondary" size="sm" disabled={saving} onClick={reset}>
                Elegir otro archivo
              </Button>
              <Button
                size="sm"
                disabled={saving || !isISODate(cutDate)}
                trailingIcon={<ArrowRight size={14} />}
                onClick={() => void confirm()}
              >
                {saving ? "Aplicando…" : "Confirmar e incorporar"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function SourceCard({ name, fmt, desc }: { name: string; fmt: string; desc: string }) {
  return (
    <div className="rounded-[9px] border border-border px-3.5 py-3">
      <div className="text-[12.5px] font-bold text-ink">{name}</div>
      <div className="font-mono text-[11px] text-brand">{fmt}</div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-faint">{desc}</p>
    </div>
  );
}
