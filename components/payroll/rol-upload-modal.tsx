"use client";

import { AlertTriangle, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber, pluralize } from "@/lib/format";
import { computeLinePayroll } from "@/lib/payroll/employee-input";
import { DEFAULT_PAYROLL_PARAMETERS } from "@/lib/payroll/engine/parameters";
import { computePeriodFinancials } from "@/lib/payroll/period-detail";
import { periodLongLabel } from "@/lib/payroll/periods";
import type { ParsedPayrollEmployeeLine, PayrollPeriod } from "@/lib/payroll/types";
import { verifyRosterTarget } from "@/lib/payroll/upload/import";
import { usePayrollData } from "./payroll-data-provider";

/**
 * The upload of ONE período's rol de pagos, with the same two-phase shape PyG's and Ocupaciones'
 * modals already have: the file is PARSED on being dropped and nothing is written until whoever
 * uploads it sees what it declares and confirms it.
 *
 * Here it is one file and not a batch because a rol IS the whole month —its `GENERAL` sheet lists
 * every employee who was paid—, so there is nothing to select within a batch.
 *
 * What this preview exists to show is what the file SAYS about itself: its month (read from
 * `GENERAL!B2`) and its razón social. The month is what decides whether it can land here; the razón
 * social is shown and is NOT compared against the client's name — the accountant calls «Manor
 * Galápagos» what the file calls `HOTEL BOUTIQUE CULTURA MANOR`, and that label is one they chose.
 */

interface StagedFile {
  fileName: string;
  company: string;
  year: number;
  monthIndex: number;
  lines: ParsedPayrollEmployeeLine[];
  warnings: string[];
  /** The reason why it CANNOT land in this período, or `null` if it can. */
  rejection: string | null;
}

interface RolUploadModalProps {
  period: PayrollPeriod;
  /** Every período of the client — the rejection for a different month needs to know whether the
   *  período the file belongs to already exists, so it can say «open it» instead of «register it». */
  periods: readonly PayrollPeriod[];
  /** How many employees the período already has: what this upload replaces. */
  currentCount: number;
  onClose: () => void;
}

export function RolUploadModal({ period, periods, currentCount, onClose }: RolUploadModalProps) {
  const { importRoster } = usePayrollData();
  const inputRef = useRef<HTMLInputElement>(null);

  const [staged, setStaged] = useState<StagedFile | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);

  const readFile = useCallback(
    async (file: File) => {
      setReading(true);
      setFailure(null);
      setStaged(null);
      try {
        // Dynamic: SheetJS weighs what it weighs and is only needed when someone is about to load
        // something — the same reason PyG imports its export layer this way.
        const [{ parseRolGeneral }, { PayrollParseError }] = await Promise.all([
          import("@/lib/payroll/upload/rol-general"),
          import("@/lib/payroll/upload/errors"),
        ]);
        try {
          const parsed = parseRolGeneral(await file.arrayBuffer());
          const verdict = verifyRosterTarget(parsed, period, periods);
          setStaged({
            fileName: file.name,
            company: parsed.company,
            year: parsed.year,
            monthIndex: parsed.monthIndex,
            lines: parsed.lines,
            warnings: parsed.warnings,
            rejection: verdict.ok ? null : verdict.message,
          });
        } catch (error) {
          setFailure(
            error instanceof PayrollParseError
              ? error.message
              : "No se pudo leer el archivo. Verifica que sea un Excel (.xls o .xlsx) válido.",
          );
        }
      } finally {
        setReading(false);
      }
    },
    [period, periods],
  );

  const onPick = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // The value is ALWAYS cleared, even with no file: without that, picking the same file again
      // does not fire `change` and the modal stays mute.
      event.target.value = "";
      if (file) {
        void readFile(file);
      }
    },
    [readFile],
  );

  const confirm = useCallback(async () => {
    if (!staged || staged.rejection) {
      return;
    }
    setSaving(true);
    try {
      await importRoster(period.id, staged.lines);
      onClose();
    } finally {
      setSaving(false);
    }
  }, [staged, importRoster, period.id, onClose]);

  // The preview totals with the ENGINE, just like the período's screen: so what is shown before
  // confirming is exactly what will be seen after loading.
  const totals = staged
    ? computePeriodFinancials(
        // No extra concepts: the accountant's file declares none, and the ones the PERÍODO has
        // declared do not arrive with the upload but with the record that is already stored.
        staged.lines.map((line) => computeLinePayroll(line, DEFAULT_PAYROLL_PARAMETERS)),
      )
    : undefined;
  const canConfirm = staged !== null && staged.rejection === null && !saving;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-6">
      <div className="w-full max-w-[560px] rounded-[13px] border border-border bg-surface shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-[15px] font-bold tracking-[-0.2px] text-ink">
              Cargar rol de pagos
            </h2>
            <p className="mt-0.5 text-[12.5px] text-faint">
              El archivo declara su propio mes en la hoja GENERAL; se carga en{" "}
              {periodLongLabel(period.year, period.monthIndex)}.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="mt-0.5 shrink-0 text-faint transition-colors hover:text-muted"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          <input
            ref={inputRef}
            type="file"
            accept=".xls,.xlsx"
            onChange={onPick}
            className="hidden"
          />

          {!staged && !failure && (
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
                {reading ? "Leyendo el archivo…" : "Elige el rol de pagos"}
              </span>
              <span className="text-[11.5px] text-faint">
                Excel del sistema contable (.xls o .xlsx)
              </span>
            </button>
          )}

          {failure && (
            <div className="rounded-[9px] border border-negative/30 bg-negative/5 px-4 py-3.5">
              <p className="text-[12.5px] leading-snug text-negative">{failure}</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setFailure(null);
                  inputRef.current?.click();
                }}
              >
                Elegir otro archivo
              </Button>
            </div>
          )}

          {staged && (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3 rounded-[9px] border border-border px-4 py-3.5">
                <FileSpreadsheet size={18} className="mt-0.5 shrink-0 text-brand" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-ink">{staged.fileName}</p>
                  <p className="mt-0.5 text-[11.5px] text-faint">
                    {staged.company || "Sin razón social declarada"} ·{" "}
                    <span className="font-semibold">
                      {periodLongLabel(staged.year, staged.monthIndex)}
                    </span>
                  </p>
                  <p className="mt-1.5 font-mono text-[11.5px] tabular-nums text-muted">
                    {pluralize(staged.lines.length, "empleado")}
                    {totals && ` · líquido ${formatCurrency(totals.net, { cents: true })}`}
                  </p>
                </div>
              </div>

              {staged.rejection ? (
                <Notice tone="negative">{staged.rejection}</Notice>
              ) : (
                currentCount > 0 && (
                  <Notice tone="warning">
                    Este período ya tiene {pluralize(currentCount, "empleado")}. El archivo los
                    reemplaza: el rol es el mes completo, así que se queda exactamente lo que
                    declara.
                  </Notice>
                )
              )}

              {staged.warnings.map((warning) => (
                <Notice key={warning} tone="warning">
                  {warning}
                </Notice>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-border px-5 py-3.5">
          {staged && (
            <Button
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => inputRef.current?.click()}
            >
              Elegir otro archivo
            </Button>
          )}
          <Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" disabled={!canConfirm} onClick={() => void confirm()}>
            {saving
              ? "Cargando…"
              : staged
                ? `Cargar ${formatNumber(staged.lines.length)} ${staged.lines.length === 1 ? "empleado" : "empleados"}`
                : "Cargar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Notice({ tone, children }: { tone: "negative" | "warning"; children: React.ReactNode }) {
  const negative = tone === "negative";

  return (
    <div
      className={
        negative
          ? "flex items-start gap-2.5 rounded-[9px] border border-negative/30 bg-negative/5 px-4 py-3"
          : "flex items-start gap-2.5 rounded-[9px] border border-warning/30 bg-warning/5 px-4 py-3"
      }
    >
      <AlertTriangle
        size={15}
        className={negative ? "mt-px shrink-0 text-negative" : "mt-px shrink-0 text-warning"}
      />
      <p
        className={
          negative
            ? "text-[12px] leading-snug text-negative"
            : "text-[12px] leading-snug text-warning"
        }
      >
        {children}
      </p>
    </div>
  );
}
