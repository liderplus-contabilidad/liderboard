"use client";

import { AlertTriangle, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber, pluralize } from "@/lib/format";
import { NO_EXTRA_CONCEPTS, computeLinePayroll } from "@/lib/payroll/employee-input";
import { DEFAULT_PAYROLL_PARAMETERS } from "@/lib/payroll/engine/parameters";
import { computePeriodFinancials } from "@/lib/payroll/period-detail";
import { periodLongLabel } from "@/lib/payroll/periods";
import type { ParsedPayrollEmployeeLine, PayrollPeriod } from "@/lib/payroll/types";
import { verifyRosterTarget } from "@/lib/payroll/upload/import";
import { usePayrollData } from "./payroll-data-provider";

/**
 * La carga del rol de pagos de UN período, con la misma forma en dos fases que ya tienen los
 * modales de PyG y de Ocupaciones: el archivo se PARSEA al soltarlo y no se escribe nada hasta que
 * quien carga ve qué declara y lo confirma.
 *
 * Aquí es un archivo y no un lote porque un rol ES el mes entero —su hoja `GENERAL` lista a todos
 * los empleados que cobraron—, así que no hay nada que seleccionar dentro de una tanda.
 *
 * Lo que esta pantalla previa existe para mostrar es lo que el archivo DICE de sí mismo: su mes
 * (leído de `GENERAL!B2`) y su razón social. El mes es lo que decide si puede aterrizar aquí; la
 * razón social se muestra y NO se compara contra el nombre del cliente — el contador llama «Manor
 * Galápagos» a lo que el archivo llama `HOTEL BOUTIQUE CULTURA MANOR`, y esa etiqueta la eligió él.
 */

interface StagedFile {
  fileName: string;
  company: string;
  year: number;
  monthIndex: number;
  lines: ParsedPayrollEmployeeLine[];
  warnings: string[];
  /** El motivo por el que NO puede aterrizar en este período, o `null` si sí puede. */
  rejection: string | null;
}

interface RolUploadModalProps {
  period: PayrollPeriod;
  /** Todos los períodos del cliente — el rechazo por mes distinto necesita saber si el período al
   *  que el archivo pertenece ya existe, para decir «ábrelo» en vez de «regístralo». */
  periods: readonly PayrollPeriod[];
  /** Cuántos empleados tiene ya el período: lo que esta carga reemplaza. */
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
        // Dinámico: SheetJS pesa lo suyo y solo hace falta cuando alguien va a cargar algo — la
        // misma razón por la que PyG importa su capa de exportación así.
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
      // El valor se limpia SIEMPRE, incluso sin archivo: sin eso, volver a elegir el mismo archivo
      // no dispara `change` y el modal se queda mudo.
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

  // La previa totaliza con el MOTOR, igual que la pantalla del período: así lo que se enseña
  // antes de confirmar es exactamente lo que se verá después de cargar.
  const totals = staged
    ? computePeriodFinancials(
        // Sin conceptos extra: el archivo del contador no declara ninguno, y los que el PERÍODO
        // tenga declarados no llegan con la carga sino con la ficha que ya está guardada.
        staged.lines.map((line) =>
          computeLinePayroll(line, DEFAULT_PAYROLL_PARAMETERS, NO_EXTRA_CONCEPTS),
        ),
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
