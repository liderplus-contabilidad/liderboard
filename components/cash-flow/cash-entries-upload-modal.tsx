"use client";

import { Check, FileSpreadsheet, Loader2, MapPin, Upload } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/modal";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { CASH_SECTION_TITLES } from "@/lib/cash-flow/cash-entries";
import * as cashDb from "@/lib/cash-flow/db";
import { money } from "@/lib/cash-flow/derive";
import { unknownCenterLabels, type ParsedCashSheet } from "@/lib/cash-flow/upload/cash-entries";
import { pluralize } from "@/lib/format";
import { useCashFlowData } from "./cash-flow-data-provider";

/**
 * Loading a `CARGAS CASH` sheet — the contador's or the one this tab exports — with the two-phase
 * shape every upload of this app has: parsed on being picked, nothing written until the preview
 * is confirmed. The preview says which BLOCKS the file brings (each REPLACES the empresa's whole
 * section, the other is left alone) and proposes, pre-checked, the centers its columns name and
 * the empresa lacks — the same gesture the cartera's upload makes. Confirming creates the checked
 * centers first, so every column resolves at the door (`replaceCashSections`); a column nothing
 * answers is reported in the summary and its figures are not written.
 */
export function CashEntriesUploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { activeClientId, centers } = useCashFlowData();
  const inputRef = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<{ fileName: string; sheet: ParsedCashSheet } | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [failure, setFailure] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<cashDb.CashSheetSummary | null>(null);

  const reset = useCallback(() => {
    setStaged(null);
    setFailure(null);
    setDone(null);
  }, []);

  const proposed = useMemo(
    () => (staged ? unknownCenterLabels(staged.sheet, centers) : []),
    [staged, centers],
  );

  const readFile = useCallback(
    async (file: File) => {
      setReading(true);
      setFailure(null);
      setStaged(null);
      try {
        const { readCashSheet } = await import("@/lib/cash-flow/upload/cash-entries");
        const result = readCashSheet(await file.arrayBuffer());
        if (!result.ok) {
          setFailure(result.message);
          return;
        }
        setStaged({ fileName: file.name, sheet: result.sheet });
        setPicked(new Set(unknownCenterLabels(result.sheet, centers)));
      } finally {
        setReading(false);
      }
    },
    [centers],
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

  const confirm = useCallback(async () => {
    if (!staged || !activeClientId) {
      return;
    }
    setSaving(true);
    try {
      if (picked.size > 0) {
        await cashDb.createCentersForLabels(activeClientId, [...picked]);
      }
      setDone(await cashDb.replaceCashSections(activeClientId, staged.sheet));
    } finally {
      setSaving(false);
    }
  }, [staged, activeClientId, picked]);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const sections = staged?.sheet.sections ?? [];
  const total = sections.reduce(
    (acc, section) =>
      acc +
      section.rows.reduce(
        (sum, row) => sum + Object.values(row.amounts).reduce((a, b) => a + b, 0),
        0,
      ),
    0,
  );

  return (
    <Modal open={open} title="Cargar Cargas cash" width={560} onClose={close}>
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
            <p className="text-[15px] font-bold text-ink">Matriz cargada</p>
            <p className="max-w-[420px] text-[12.5px] text-muted">
              {pluralize(done.written, "fila")} escritas en{" "}
              {done.sections.map((id) => CASH_SECTION_TITLES[id]).join(" y ")}
              {done.unknownColumns.length > 0 &&
                ` · columnas sin centro, no escritas: ${done.unknownColumns.join(", ")}`}
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
                {reading ? "Leyendo el archivo…" : "Elige la hoja de Cargas cash"}
              </span>
              <span className="text-[11.5px] text-faint">
                La hoja «CARGAS CASH» del libro o el Excel que exporta esta pestaña
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
                  {sections
                    .map(
                      (section) =>
                        `${CASH_SECTION_TITLES[section.id]} · ${pluralize(section.rows.length, "fila")}`,
                    )
                    .join(" · ")}
                  {" · "}
                  {money(total)}
                  {staged.sheet.skipped > 0 &&
                    ` · ${pluralize(staged.sheet.skipped, "fila")} vacías ignoradas`}
                </div>
              </div>
            </div>
            {proposed.length > 0 && (
              <div className="rounded-[9px] border border-border">
                <div className="flex items-center gap-2 border-b border-border bg-surface-muted px-3.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint">
                  <MapPin size={13} />
                  Centros que nombra la hoja · marca los que son centros de la empresa
                </div>
                <ul className="divide-y divide-border-soft">
                  {proposed.map((name) => (
                    <li key={name} className="flex items-center gap-3 px-3.5 py-2 text-[12.5px]">
                      <Checkbox
                        size={16}
                        checked={picked.has(name)}
                        ariaLabel={`Crear centro ${name}`}
                        onChange={() => togglePicked(name)}
                      />
                      <span className="flex-1 font-semibold text-ink">{name}</span>
                      <span className="w-[190px] text-right text-[11.5px] text-faint">
                        {picked.has(name) ? "se creará el centro" : "su columna no se escribe"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="rounded-[10px] border border-warning/40 bg-warning/5 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-ink">
              Al confirmar,{" "}
              <strong className="font-semibold">
                cada bloque que trae el archivo reemplaza por completo
              </strong>{" "}
              las filas que hoy tiene ese bloque; un bloque que el archivo no trae no se toca.
              PROVEEDORES no se carga: se lee de los documentos marcados «Cash» en Cuentas por
              pagar.
            </p>
            <div className="flex items-center justify-between gap-2">
              <Button variant="secondary" size="sm" disabled={saving} onClick={reset}>
                Elegir otro archivo
              </Button>
              <Button size="sm" disabled={saving} onClick={() => void confirm()}>
                {saving ? "Escribiendo…" : "Confirmar y reemplazar"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
