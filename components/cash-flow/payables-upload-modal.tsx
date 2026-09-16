"use client";

import { ArrowRight, Check, FileSpreadsheet, Loader2, MapPin, Upload } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Cell, HeadCell } from "@/components/data-table/grid-cells";
import { DataGrid } from "@/components/data-table/data-grid";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { NoticeBanner } from "@/components/ui/notice-banner";
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
  const [done, setDone] = useState<cashDb.CutSummary | null>(null);

  const reset = useCallback(() => {
    setStaged(null);
    setFailure(null);
    setDone(null);
  }, []);

  const stagedRows = useMemo(
    () => (staged ? (staged.kind === "liderplus" ? staged.rows : staged.cartera.payables) : []),
    [staged],
  );
  const detected = useMemo(() => detectCenters(stagedRows, centers), [stagedRows, centers]);

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

  const confirm = useCallback(async () => {
    if (!staged || !activeClientId) {
      return;
    }
    if (staged.kind === "system" && !isISODate(cutDate)) {
      return;
    }
    setSaving(true);
    try {
      if (picked.size > 0) {
        await cashDb.createCentersForLabels(activeClientId, [...picked]);
      }
      if (staged.kind === "liderplus") {
        const written = await cashDb.replaceCartera(activeClientId, staged.rows);
        setDone({ written, settled: 0 });
      } else {
        setDone(await cashDb.applyCut(activeClientId, staged.cartera, cutDate));
      }
    } finally {
      setSaving(false);
    }
  }, [staged, activeClientId, cutDate, picked]);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const previewRows = stagedRows;
  const total = previewRows
    .filter((row) => !("status" in row) || row.status === "open")
    .reduce((acc, row) => acc + row.balance, 0);
  const settledCount =
    staged?.kind === "liderplus" ? staged.rows.filter((row) => row.status === "settled").length : 0;

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
          </>
        ) : (
          <>
            <div className="flex items-start gap-3 rounded-[9px] border border-border bg-surface-muted px-4 py-3">
              <FileSpreadsheet size={18} className="mt-0.5 shrink-0 text-brand" />
              <div className="min-w-0 flex-1 text-[12.5px]">
                <div className="truncate font-semibold text-ink">{staged.fileName}</div>
                <div className="text-muted">
                  {staged.kind === "liderplus" ? (
                    <>
                      {LIDERPLUS_LABEL} · {pluralize(staged.rows.length, "documento")}
                      {settledCount > 0 && ` (${settledCount} liquidados)`} · {money(total)}{" "}
                      abiertos
                    </>
                  ) : (
                    <>
                      {staged.strategy.label}
                      {staged.cartera.companyName && ` · ${staged.cartera.companyName}`}
                      {" · "}
                      {pluralize(staged.cartera.payables.length, "documento")} · {money(total)}
                      {staged.cartera.skipped > 0 &&
                        ` · ${pluralize(staged.cartera.skipped, "fila")} de subtotal ignoradas`}
                    </>
                  )}
                </div>
              </div>
              {staged.kind === "system" && (
                <FormField label="Fecha de corte" className="w-[150px]">
                  <DateField
                    value={cutDate}
                    ariaLabel="Fecha de corte de la cartera"
                    onChange={(date) => date && setCutDate(date)}
                  />
                </FormField>
              )}
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
                Vista previa · primeras {Math.min(PREVIEW_ROWS, previewRows.length)} filas
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
                  {previewRows.slice(0, PREVIEW_ROWS).map((row, index) => (
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

            {detected.length > 0 && (
              <div className="rounded-[9px] border border-border">
                <div className="flex items-center gap-2 border-b border-border bg-surface-muted px-3.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint">
                  <MapPin size={13} />
                  Centros de costo que trae el archivo · marca los que son centros de la empresa
                </div>
                <ul className="divide-y divide-border-soft">
                  {detected.map((entry) => (
                    <li
                      key={entry.name}
                      className="flex items-center gap-3 px-3.5 py-2 text-[12.5px]"
                    >
                      {entry.known ? (
                        <Check size={16} className="text-positive" />
                      ) : (
                        <Checkbox
                          size={16}
                          checked={picked.has(entry.name)}
                          ariaLabel={`Crear centro ${entry.name}`}
                          onChange={() => togglePicked(entry.name)}
                        />
                      )}
                      <span className="flex-1 font-semibold text-ink">{entry.name}</span>
                      <span className="text-faint">{pluralize(entry.count, "documento")}</span>
                      <span className="w-[150px] text-right text-[11.5px] text-faint">
                        {entry.known
                          ? "ya es un centro"
                          : picked.has(entry.name)
                            ? "se creará el centro"
                            : "queda sin centro"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {staged.kind === "liderplus" ? (
              <p className="rounded-[10px] border border-warning/40 bg-warning/5 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-ink">
                Es la cartera que exportó este módulo. Al confirmar{" "}
                <strong className="font-semibold">se reemplaza toda la cartera actual</strong> por
                la del archivo, tal cual estaba: marcas, fechas programadas, aprobaciones,
                observaciones, obligaciones manuales y liquidadas incluidas. La cuenta «Pagar desde»
                se reconoce por su banco y número.
              </p>
            ) : (
              <p className="rounded-[10px] border border-border bg-surface-muted px-3.5 py-2.5 text-[11.5px] leading-relaxed text-ink-soft">
                Al confirmar, cada documento se escribe por su identidad (proveedor · tipo · número)
                y conserva lo que ya tenía anotado; lo que este corte ya no trae se da por liquidado
                a la fecha de corte. Las obligaciones manuales no se tocan.
              </p>
            )}

            <div className="flex items-center justify-between gap-2">
              <Button variant="secondary" size="sm" disabled={saving} onClick={reset}>
                Elegir otro archivo
              </Button>
              <Button
                size="sm"
                disabled={saving || (staged.kind === "system" && !isISODate(cutDate))}
                trailingIcon={<ArrowRight size={14} />}
                onClick={() => void confirm()}
              >
                {saving
                  ? "Aplicando…"
                  : staged.kind === "liderplus"
                    ? "Reemplazar la cartera"
                    : "Confirmar e incorporar"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
