"use client";

import {
  Building2,
  Check,
  ChevronsUpDown,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CenterLogoRow, LogoPicker } from "@/components/ui/logo-picker";
import { cn } from "@/lib/cn";
import {
  COMPANY_FIELDS,
  firstMissingCompanyField,
  type CompanyDraft,
  type CompanyField,
} from "@/lib/company-profile";
import {
  matchesSearch,
  type CenterLogos,
  type CenterOption,
  type EntityLogo,
} from "@/lib/workspaces";

export interface ActiveClientInfo {
  /** Empresa / client shown in bold. */
  name: string;
  /** Period label for the subline, e.g. "Ene–Dic 2026". */
  period?: string;
  /** The logo, if this workspace has one. */
  logo?: EntityLogo;
  /**
   * El del CENTRO abierto, cuando hay exactamente uno resuelto. Va junto al del cliente y en el
   * mismo orden que en los archivos —principal primero—, así que la cabecera confirma en pantalla
   * lo que el Excel y el informe van a imprimir.
   */
  centerLogo?: EntityLogo;
}

/** One row of the selector. `caption` is what the client IS — its system, mode and years. */
export interface ClientOption {
  id: string;
  name: string;
  /** «Por centros de costo · 2024–2026», or `undefined` for a client with no data yet. */
  caption?: string;
  /**
   * Una entrada que se ABRE pero no se administra: sin menú `⋯`, y separada de la lista por una
   * línea. Es lo que necesita el consolidado entre clientes, que no es una fila guardada sino una
   * lectura derivada de todas ellas — renombrarlo o eliminarlo no querría decir nada.
   */
  readOnly?: boolean;
  /** El logo del cliente, si subió uno. El consolidado, que no es una fila guardada, no tiene. */
  logo?: EntityLogo;
}

/**
 * El logo de un workspace dibujado a un tamaño dado. Devuelve `null` sin logo en vez de un marcador
 * gris: la cabecera de quien no suba ninguno tiene que quedar exactamente como estaba, y un hueco
 * vacío ahí solo añadiría ruido a un bloque que hoy está limpio.
 *
 * El `alt` va VACÍO a propósito. El nombre del cliente está escrito al lado en las dos superficies
 * que lo usan, así que un texto alternativo lo repetiría en voz alta: el logo es decoración de una
 * etiqueta que ya se lee.
 */
function EntityLogoMark({ logo, size }: { logo: EntityLogo | undefined; size: number }) {
  if (!logo) {
    return null;
  }
  return (
    // Sin `next/image`: la fuente es un data URL de IndexedDB, no un asset con ruta.
    // oxlint-disable-next-line next/no-img-element
    <img
      src={logo.dataUrl}
      alt=""
      width={logo.width}
      height={logo.height}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-[5px] object-contain"
    />
  );
}

/** Ancho del menú `⋯` de una fila. Se resta del borde derecho del botón para alinearlos. */
const ROW_MENU_WIDTH = 170;

/**
 * Las palabras con que un módulo llama a lo que guarda. Este bloque es el mismo control en PyG y en
 * Ocupaciones, pero el sujeto NO es el mismo —allí es el cliente, aquí el hotel—, y un selector que
 * dijera «cliente» sobre una lista de hoteles sería una mentira pequeña repetida en diez sitios.
 *
 * El default es el de PyG, que es quien lo estrenó, así que sus llamadas no cambian.
 */
export interface EntityLabels {
  /** Singular en minúscula: «cliente», «hotel». Las frases se construyen con él. */
  subject: string;
  /** Plural en minúscula: «clientes», «hoteles». */
  plural: string;
  /** Lo que un renombrado NO toca, en las palabras del módulo. */
  renameKeeps: string;
  /**
   * Cómo llama el módulo a un centro: «centro de costo», «sucursal». OPCIONAL porque hay módulos
   * que no tienen ninguno —los clientes de Rol de Pagos—, y obligarles a nombrar algo que no
   * existe sería copia muerta. Sin estas dos palabras la sección de logos por centro NO se rinde
   * aunque lleguen centros: quedarse sin la sección se ve, y llamarla por el nombre del módulo
   * equivocado no.
   */
  centerSubject?: string;
  /** Su plural: «centros de costo», «sucursales». No se deriva del singular — «centros de costo»
   *  no es «centro de costo» + «s», y una regla que lo intentara acertaría en un módulo y no en el
   *  otro. */
  centerPlural?: string;
}

/** Las de PyG, que es quien estrenó el bloque, y por eso son también el default. */
export const DEFAULT_ENTITY_LABELS: EntityLabels = {
  subject: "cliente",
  plural: "clientes",
  renameKeeps: "sus datos, ajustes y comentarios",
  centerSubject: "centro de costo",
  centerPlural: "centros de costo",
};

export interface ActiveClientProps {
  client?: ActiveClientInfo;
  /** What the module is showing, first item of the subline. */
  caption?: string;
  /** Shown in place of the name when there is nothing loaded. */
  emptyLabel?: string;
  /** Shown under `emptyLabel` when there is nothing loaded. */
  emptySubline?: string;
  /**
   * The selector's list. WITHOUT it the block renders exactly as it always has — a read-only
   * summary — which is what lets Ocupaciones keep this component untouched until it grows its
   * own list of hotels.
   */
  clients?: ClientOption[];
  activeClientId?: string | null;
  onSelect?: (clientId: string) => void;
  onCreate?: () => void;
  onRename?: (clientId: string) => void;
  onDelete?: (clientId: string) => void;
  /** Cómo llama el módulo a lo que lista. Por defecto, el cliente de PyG. */
  labels?: EntityLabels;
}

/**
 * Active-client block for a module header. With no `clients` it is the read-only block it has
 * always been (Ocupaciones' hotel); with them it becomes the module's client SELECTOR — the
 * control lives where the user already looks to see which client is open.
 *
 * The dropdown has no scrim on purpose: the dashboard behind it stays readable, so the reader can
 * check a figure of the open client while deciding which one to switch to.
 */
export function ActiveClient({
  client,
  caption = "Estado de resultados",
  emptyLabel,
  emptySubline,
  clients,
  activeClientId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  labels = DEFAULT_ENTITY_LABELS,
}: ActiveClientProps) {
  const hasClient = Boolean(client?.name);
  const name = client?.name ?? emptyLabel ?? `Sin ${labels.subject} seleccionado`;
  const period = client?.period ?? "N/A";
  const interactive = clients !== undefined;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  /**
   * The row whose `⋯` menu is open, WITH the viewport rect of the button that opened it. The
   * menu is `fixed` and placed from that rect rather than absolutely positioned inside the row:
   * the list scrolls, and an absolute popup inside it is clipped by the scroll container, forces
   * a scrollbar of its own and rides the rows as they move.
   */
  const [menuFor, setMenuFor] = useState<{ id: string; top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    setMenuFor(null);
    setQuery("");
    if (returnFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  // ⌘K from anywhere in the module — announced in the list header, because a shortcut nobody can
  // see is a shortcut nobody uses — and Escape to close, returning focus to the block that opened
  // it. Both on the window: the panel is a plain container, and its own children never need to
  // know about either key.
  useEffect(() => {
    if (!interactive) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (event.key === "Escape") {
        setOpen((current) => {
          if (current) {
            setMenuFor(null);
            setQuery("");
            triggerRef.current?.focus();
          }
          return false;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [interactive]);

  // Focus lands in the search field, which is the first thing a twenty-client list needs.
  useEffect(() => {
    if (open) {
      searchRef.current?.focus();
    }
  }, [open]);

  const visible = useMemo(
    () => (clients ?? []).filter((entry) => matchesSearch(entry.name, query)),
    [clients, query],
  );

  /**
   * Si ALGUNA fila tiene logo. La columna de miniaturas aparece entera o no aparece: reservarla
   * cuando nadie ha subido ninguno sangraría toda la lista por un espacio que nunca se llena, y
   * quitársela a las filas sin logo cuando otras sí lo tienen desalinearía los nombres.
   */
  const someHasLogo = useMemo(() => (clients ?? []).some((entry) => entry.logo), [clients]);

  const block = (
    <div className="flex min-w-0 items-center gap-2.5">
      {/* A la IZQUIERDA del nombre, no encima: el bloque va alineado a la derecha contra el borde
          de la cabecera, así que el logo es lo primero que se cruza al venir desde el contenido.
          Con el del centro detrás, el par se lee en el mismo orden en que se imprime. */}
      <EntityLogoMark logo={client?.logo} size={28} />
      <EntityLogoMark logo={client?.centerLogo} size={24} />
      <div className="flex min-w-0 flex-col items-end gap-[3px]">
        <span
          className={cn(
            "max-w-[360px] truncate text-[15px] font-bold tracking-[-0.2px]",
            hasClient ? "text-brand" : "text-faint",
          )}
        >
          {name}
        </span>
        <div className="flex items-center gap-[7px] text-[11.5px] font-medium text-faint">
          {hasClient || !emptySubline ? (
            <>
              <span>{caption}</span>
              <span className="text-faintest">·</span>
              <span>{period}</span>
            </>
          ) : (
            <span>{emptySubline}</span>
          )}
        </div>
      </div>
    </div>
  );

  if (!interactive) {
    return <div className="ml-auto flex min-w-0 items-center justify-end">{block}</div>;
  }

  return (
    <div className="relative ml-auto">
      {open && (
        <button
          type="button"
          aria-label={`Cerrar el selector de ${labels.plural}`}
          onClick={() => close(false)}
          className="fixed inset-0 z-30 cursor-default"
        />
      )}

      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        className={cn(
          "relative z-40 flex items-center gap-3 rounded-[13px] border px-4 py-2 transition-colors",
          // Dotted while empty: a hollow waiting to be filled reads differently from a control
          // that has been switched off.
          hasClient
            ? "border-border bg-surface hover:bg-canvas"
            : "border-dashed border-border hover:bg-canvas",
        )}
      >
        {block}
        <ChevronsUpDown size={14} className="shrink-0 text-faint" />
      </button>

      {open && (
        // Un contenedor sin rol: todo lo que hay dentro (el buscador, cada cliente, cada acción)
        // es ya interactivo por sí mismo, así que un `role` aquí solo añadiría un nivel que
        // ningún lector necesita anunciar. Escape se atiende arriba, junto a ⌘K.
        <div
          id={listId}
          className="absolute right-0 top-[calc(100%+8px)] z-40 w-[340px] rounded-[13px] border border-border bg-surface p-2 shadow-[0_18px_44px_rgba(15,23,42,0.18)]"
        >
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint">
              {labels.plural}
            </span>
            <kbd className="rounded-[5px] border border-border-soft px-1.5 py-0.5 font-mono text-[10px] text-faintest">
              ⌘K
            </kbd>
          </div>

          <div className="relative mb-1.5">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Buscar ${labels.subject}…`}
              aria-label={`Buscar ${labels.subject}`}
              className="h-[34px] w-full rounded-[9px] border border-border bg-surface pl-8 pr-2.5 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-brand"
            />
          </div>

          {visible.length === 0 ? (
            <EmptyState className="py-5">
              {query
                ? `Ningún ${labels.subject} coincide con lo que buscas.`
                : `Todavía no hay ${labels.plural}.`}
            </EmptyState>
          ) : (
            <ul
              className="flex max-h-[280px] flex-col overflow-y-auto"
              // A scroll would leave the `fixed` menu behind, pointing at a row that has moved.
              onScroll={() => setMenuFor(null)}
            >
              {visible.map((entry, index) => (
                <li
                  key={entry.id}
                  // Una línea donde termina lo que no se administra y empieza la lista.
                  className={cn(
                    entry.readOnly &&
                      !visible[index + 1]?.readOnly &&
                      index < visible.length - 1 &&
                      "mb-1.5 border-b border-border-soft pb-1.5",
                  )}
                >
                  <div
                    className={cn(
                      "group flex items-center gap-2 rounded-[9px] px-2 py-1.5 transition-colors hover:bg-canvas",
                      entry.id === activeClientId && "bg-surface-muted",
                    )}
                  >
                    <span className="w-4 shrink-0">
                      {entry.id === activeClientId && <Check size={14} className="text-brand" />}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect?.(entry.id);
                        close(false);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      {/* Un hueco del mismo ancho cuando no hay logo: con unas filas sangradas y
                          otras no, la columna de nombres deja de poder leerse en vertical. */}
                      {someHasLogo && (
                        <span className="flex size-5 shrink-0 items-center justify-center">
                          <EntityLogoMark logo={entry.logo} size={20} />
                        </span>
                      )}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="max-w-full truncate text-[13px] font-semibold text-ink">
                          {entry.name}
                        </span>
                        <span
                          className={cn(
                            "max-w-full truncate text-[11.5px]",
                            entry.caption ? "text-faint" : "text-faintest",
                          )}
                        >
                          {entry.caption ?? "Sin datos cargados"}
                        </span>
                      </span>
                    </button>
                    {!entry.readOnly && (
                      <button
                        type="button"
                        aria-label={`Opciones de ${entry.name}`}
                        aria-haspopup="menu"
                        aria-expanded={menuFor?.id === entry.id}
                        onClick={(event) => {
                          const rect = event.currentTarget.getBoundingClientRect();
                          setMenuFor((current) =>
                            current?.id === entry.id
                              ? null
                              : { id: entry.id, top: rect.bottom + 6, right: rect.right },
                          );
                        }}
                        className={cn(
                          "shrink-0 rounded-[7px] p-1 text-faint transition-colors hover:bg-surface hover:text-ink",
                          menuFor?.id === entry.id
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100",
                        )}
                      >
                        <MoreHorizontal size={15} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-1.5 border-t border-border-soft pt-1.5">
            <button
              type="button"
              onClick={() => {
                close(false);
                onCreate?.();
              }}
              className="flex w-full items-center gap-2 rounded-[9px] px-2.5 py-2 text-left text-[13px] font-semibold text-ink transition-colors hover:bg-canvas"
            >
              <Plus size={15} className="text-muted" />
              Agregar {labels.subject}
            </button>
          </div>
        </div>
      )}

      {/* Fuera del panel y del `ul` que scrollea, anclado al botón que lo abrió: dentro sería
          recortado por el contenedor de scroll y arrastraría su propia barra. */}
      {menuFor && (
        <div
          role="menu"
          // El ancho va en el estilo, no en una clase, porque es la misma cifra que se resta del
          // borde derecho del botón para alinearlos: una sola cifra, un solo sitio.
          style={{ top: menuFor.top, left: menuFor.right - ROW_MENU_WIDTH, width: ROW_MENU_WIDTH }}
          className="fixed z-50 rounded-[9px] border border-border bg-surface p-1 shadow-[0_14px_36px_rgba(15,23,42,0.16)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const id = menuFor.id;
              close(false);
              onRename?.(id);
            }}
            className="flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-ink transition-colors hover:bg-canvas"
          >
            <Pencil size={14} className="text-muted" />
            Renombrar
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const id = menuFor.id;
              close(false);
              onDelete?.(id);
            }}
            className="flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-negative transition-colors hover:bg-negative/10"
          >
            <Trash2 size={14} />
            Eliminar
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The «Agregar cliente» / «Editar cliente» modal: the user's LABEL for the workspace and nothing
 * else — its name and its logo. Neither is data: the data comes later, and the note below says so,
 * because what stops a reader hunting for an upload step here is being told there isn't one.
 *
 * The logo sits next to the name for the same reason it does in `NamedEntity`: they are the two
 * halves of the same thing, and neither is ever compared against a file.
 *
 * Validation of the NAME is the caller's: it owns the list, so only it can say which one is already
 * taken. The logo validates itself inside `LogoPicker`, which needs no list to know a file is too
 * heavy.
 */
export function ClientNameDialog({
  open,
  mode,
  value,
  logo,
  centers,
  centerLogos,
  company,
  onCompanyChange,
  companyError,
  error,
  busy,
  onChange,
  onLogoChange,
  onCenterLogoChange,
  onSubmit,
  onCancel,
  labels = DEFAULT_ENTITY_LABELS,
}: {
  open: boolean;
  mode: "create" | "rename";
  value: string;
  logo: EntityLogo | null;
  /**
   * Los centros de este workspace. SIN ellos —o vacíos— el diálogo queda exactamente como estaba,
   * que es lo que deja intacto a Rol de Pagos, cuyos clientes no tienen centros, y a un cliente en
   * estado único, que tampoco.
   */
  centers?: readonly CenterOption[];
  centerLogos?: CenterLogos | undefined;
  /**
   * Los datos de la empresa que este workspace imprime en su membrete. Entran por la misma puerta
   * que `centers`: sin ellos el diálogo queda EXACTAMENTE como estaba, que es lo que deja intactos a
   * los módulos que no piden perfil. Hoy solo lo pasa Rol de Pagos.
   */
  company?: CompanyDraft;
  onCompanyChange?: (field: CompanyField, value: string) => void;
  /** El rechazo del perfil al enviar —un RUC que no tiene trece dígitos—, ya en castellano. */
  companyError?: string | null;
  error: string | null;
  busy?: boolean;
  onChange: (value: string) => void;
  onLogoChange: (logo: EntityLogo | null) => void;
  onCenterLogoChange?: (centerId: string, logo: EntityLogo | null) => void;
  onSubmit: () => void;
  onCancel: () => void;
  labels?: EntityLabels;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [open]);

  if (!open) {
    return null;
  }
  const creating = mode === "create";
  // Las dos palabras van juntas o no van: media sección rotulada «Logos por» sin sujeto es peor
  // que ninguna.
  const centerWords =
    labels.centerSubject && labels.centerPlural
      ? { subject: labels.centerSubject, plural: labels.centerPlural }
      : null;

  // El primer obligatorio que falta apaga «Guardar» y DICE cuál es. Un botón apagado sin motivo
  // manda a repasar ocho campos a ojo, que es justo lo que este mensaje evita. El RUC no entra
  // aquí: mientras se teclea está siempre a medias, así que se juzga al enviar.
  const missingCompany = company && onCompanyChange ? firstMissingCompanyField(company) : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className={cn(
          // Con la sección de empresa el modal es más ancho —seis campos en 440 px salen en una
          // columna altísima— y puede scrollear: el botón que lo cierra no puede quedar fuera de
          // la pantalla por cuántos campos pide.
          "w-full max-h-[calc(100vh-56px)] overflow-y-auto rounded-[13px] border border-border bg-surface p-5 shadow-[0_24px_60px_rgba(15,23,42,0.24)]",
          company && onCompanyChange ? "max-w-[560px]" : "max-w-[440px]",
        )}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-brand-soft">
            <Building2 size={17} className="text-brand" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold tracking-[-0.2px] text-ink">
              {creating ? `Agregar ${labels.subject}` : `Editar ${labels.subject}`}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-faint">
              {creating
                ? "Aparecerá en el selector del header."
                : `Solo cambia la etiqueta; ${labels.renameKeeps} no se tocan.`}
            </p>
          </div>
        </div>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint">
            Nombre del {labels.subject}
          </span>
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-[38px] rounded-[9px] border border-border bg-surface px-3 text-[13px] text-ink outline-none focus:border-brand"
          />
          {error ? (
            <span className="text-[11.5px] text-negative">{error}</span>
          ) : (
            <span className="text-[11.5px] text-faint">
              Como quieras verlo en el selector. Puedes renombrarlo después.
            </span>
          )}
        </label>

        <div className="mt-4">
          <LogoPicker
            value={logo}
            onChange={onLogoChange}
            disabled={busy}
            hint={`Opcional. Acompaña al nombre del ${labels.subject} en el header, en los Excel y en el comprobante en PDF.`}
          />
        </div>

        {/*
          Los datos de la empresa son el MEMBRETE: lo que el papel de la firma imprime bajo el logo.
          Van aquí y no en una pantalla propia porque son la otra mitad de lo mismo que el nombre y
          el logo —la identidad de este workspace— y separarlos obligaría a recordar cuál se edita
          dónde. La sección no existe si el módulo no la pide.
        */}
        {company && onCompanyChange && (
          <div className="mt-4 flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint">
                Datos de la empresa
              </span>
              <span className="text-[11px] text-faintest">para el membrete</span>
            </div>
            <p className="text-[11.5px] text-faint">
              Encabezan las pantallas del módulo, el comprobante en PDF y el Excel del período.
            </p>
            <div className="mt-0.5 grid grid-cols-2 gap-x-2.5 gap-y-2">
              {COMPANY_FIELDS.map((field) => (
                <label
                  key={field.id}
                  className={cn("flex flex-col gap-1", field.wide && "col-span-2")}
                >
                  <span className="text-[11px] font-medium text-ink-soft">
                    {field.label}
                    {!field.required && (
                      <span className="ml-1 font-normal text-faintest">opcional</span>
                    )}
                  </span>
                  <input
                    value={company[field.id]}
                    disabled={busy}
                    placeholder={field.placeholder}
                    onChange={(event) => onCompanyChange(field.id, event.target.value)}
                    className="h-[34px] rounded-[9px] border border-border bg-surface px-2.5 text-[12.5px] text-ink outline-none placeholder:text-faintest focus:border-brand"
                  />
                </label>
              ))}
            </div>
            {companyError ? (
              <span className="text-[11.5px] text-negative">{companyError}</span>
            ) : (
              missingCompany && <span className="text-[11.5px] text-faint">{missingCompany}</span>
            )}
          </div>
        )}

        {/*
          Los logos de los centros van DEBAJO del principal y en el mismo diálogo porque son la
          misma cosa —la identidad visual de este workspace— y separarlos en dos sitios obligaría a
          recordar cuál se edita dónde. La sección no existe hasta que hay centros: un cliente
          recién creado no tiene ninguno, y un título que promete una lista sobre una lista vacía es
          peor que no estar.
        */}
        {centers && centers.length > 0 && onCenterLogoChange && centerWords && (
          <div className="mt-4 flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint">
                Logos por {centerWords.plural}
              </span>
              <span className="text-[11px] text-faintest">opcional</span>
            </div>
            <p className="text-[11.5px] text-faint">
              En la hoja de cada {centerWords.subject}, el logo del {labels.subject} va a la
              izquierda y el suyo a la derecha.
            </p>
            {/* Con más de cuatro centros la lista scrollea en vez de empujar «Guardar» fuera de
                la pantalla: el botón que cierra el diálogo no puede depender de cuántos centros
                cargó el cliente. */}
            <ul className="max-h-[196px] divide-y divide-border-faint overflow-y-auto rounded-[9px] border border-border-soft px-2.5">
              {centers.map((center) => (
                <CenterLogoRow
                  key={center.id}
                  name={center.name}
                  color={center.color}
                  value={centerLogos?.[center.id] ?? null}
                  disabled={busy}
                  onChange={(next) => onCenterLogoChange(center.id, next)}
                />
              ))}
            </ul>
          </div>
        )}

        {creating && (
          <p className="mt-4 rounded-[9px] bg-surface-muted px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-soft">
            Los datos se cargan después. El {labels.subject} se crea vacío y entras a él con{" "}
            <strong className="font-semibold">Cargar Excel</strong> habilitado.
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <Button variant="secondary" size="sm" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={busy || missingCompany !== null}>
            {creating ? `Crear ${labels.subject}` : "Guardar"}
          </Button>
        </div>
      </form>
    </div>
  );
}
