/**
 * La regla de si un rol de pagos puede aterrizar en el período que está abierto — pura, porque es
 * lo único que separa cargar el mes correcto de sobrescribir otro mes en silencio.
 *
 * El archivo DECLARA su propio período (`GENERAL!B2`, ver `rol-general.ts`), así que aquí no se
 * adivina nada: o coincide con el período abierto o no, y si no, se RECHAZA nombrando LOS DOS
 * meses. Nombrar solo uno («este archivo no corresponde a este período») deja al contador
 * comparando a ciegas su carpeta contra la pantalla; nombrar los dos convierte el rechazo en la
 * instrucción de qué hacer a continuación.
 *
 * NO se compara la razón social del archivo contra el nombre del cliente. Es la misma resolución
 * que PyG y Ocupaciones ya sostienen: el usuario llama «Manor Galápagos» a lo que el archivo llama
 * `HOTEL BOUTIQUE CULTURA MANOR`, y la etiqueta que eligió no es una identidad que contradecir.
 */
import { periodLongLabel } from "../periods";

export interface PeriodRef {
  year: number;
  monthIndex: number;
}

export type RosterImportVerdict = { ok: true } | { ok: false; message: string };

function samePeriod(a: PeriodRef, b: PeriodRef): boolean {
  return a.year === b.year && a.monthIndex === b.monthIndex;
}

/**
 * `file` es el período que el archivo declara; `target`, el que está abierto; `existing`, los
 * períodos que el cliente ya tiene registrados — sirve para que el rechazo sepa si el destino
 * correcto ya existe («ábrelo ahí») o todavía no («regístralo»), en vez de dar la misma frase para
 * dos situaciones que se resuelven distinto.
 */
export function verifyRosterTarget(
  file: PeriodRef,
  target: PeriodRef,
  existing: readonly PeriodRef[],
): RosterImportVerdict {
  if (samePeriod(file, target)) {
    return { ok: true };
  }

  const fileLabel = periodLongLabel(file.year, file.monthIndex);
  const targetLabel = periodLongLabel(target.year, target.monthIndex);
  const registered = existing.some((period) => samePeriod(period, file));

  return {
    ok: false,
    message: registered
      ? `Este archivo es el rol de ${fileLabel} y lo estás cargando en ${targetLabel}. Abre ${fileLabel}, que ya está registrado, y cárgalo ahí.`
      : `Este archivo es el rol de ${fileLabel} y lo estás cargando en ${targetLabel}. Registra el período ${fileLabel} y cárgalo ahí.`,
  };
}
