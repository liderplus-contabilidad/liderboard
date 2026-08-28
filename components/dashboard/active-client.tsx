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
import type { CostCenterDraft } from "@/lib/cost-center";
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
   * The one of the OPEN center, when exactly one is resolved. It goes next to the client's and in
   * the same order as in the files —principal first—, so the header confirms on screen what the
   * Excel and the report are going to print.
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
   * An entry that can be OPENED but not administered: no `⋯` menu, and separated from the list by a
   * rule. It is what the cross-client consolidado needs, which is not a stored row but a reading
   * derived from all of them — renaming or deleting it would not mean anything.
   */
  readOnly?: boolean;
  /** The client's logo, if it uploaded one. The consolidado, not being a stored row, has none. */
  logo?: EntityLogo;
}

/**
 * A workspace's logo drawn at a given size. Returns `null` with no logo instead of a grey
 * placeholder: the header of whoever uploads none has to stay exactly as it was, and an empty gap
 * there would only add noise to a block that is clean today.
 *
 * The `alt` is EMPTY on purpose. The client's name is written beside it on both surfaces that use
 * it, so alternative text would repeat it out loud: the logo is decoration for a label that is
 * already being read.
 */
function EntityLogoMark({ logo, size }: { logo: EntityLogo | undefined; size: number }) {
  if (!logo) {
    return null;
  }
  return (
    // No `next/image`: the source is a data URL from IndexedDB, not an asset with a path.
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

/** Width of a row's `⋯` menu. Subtracted from the button's right edge to line them up. */
const ROW_MENU_WIDTH = 170;

/**
 * The words a module uses for what it holds. This block is the same control in PyG and in
 * Ocupaciones, but the SUBJECT is NOT the same —there it is the client, here the hotel—, and a
 * selector saying «cliente» over a list of hotels would be a small lie repeated in ten places.
 *
 * The default is PyG's, which is the one that introduced it, so its calls do not change.
 */
export interface EntityLabels {
  /** Lowercase singular: «cliente», «hotel». The phrases are built with it. */
  subject: string;
  /** Lowercase plural: «clientes», «hoteles». */
  plural: string;
  /** What a rename does NOT touch, in the module's own words. */
  renameKeeps: string;
  /**
   * What the module calls a center: «centro de costo», «sucursal». OPTIONAL because there are
   * modules with none —Rol de Pagos' clients—, and forcing them to name something that does not
   * exist would be dead copy. Without these two words the per-center logo section does NOT render
   * even when centers arrive: missing the section shows, calling it by the wrong module's name does
   * not.
   */
  centerSubject?: string;
  /** Its plural: «centros de costo», «sucursales». Not derived from the singular — «centros de
   *  costo» is not «centro de costo» + «s», and a rule that tried would be right in one module and
   *  wrong in the other. */
  centerPlural?: string;
}

/** PyG's, which is what introduced the block, and that is why they are also the default. */
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
  /** What the module calls what it lists. By default, PyG's client. */
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
   * Whether ANY row has a logo. The thumbnail column appears whole or not at all: reserving it when
   * nobody has uploaded one would indent the entire list for a space that never gets filled, and
   * taking it away from the rows without a logo when others have one would misalign the names.
   */
  const someHasLogo = useMemo(() => (clients ?? []).some((entry) => entry.logo), [clients]);

  const block = (
    <div className="flex min-w-0 items-center gap-2.5">
      {/* To the LEFT of the name, not above it: the block is right-aligned against the header's
          edge, so the logo is the first thing crossed coming in from the content. With the center's
          behind it, the pair reads in the same order in which it prints. */}
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
        // A container with no role: everything inside it (the search box, each client, each action)
        // is already interactive on its own, so a `role` here would only add a level no reader
        // needs announced. Escape is handled above, next to ⌘K.
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
                  // A rule where what is not administered ends and the list begins.
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
                      {/* A gap of the same width when there is no logo: with some rows indented and
                          others not, the column of names stops being readable vertically. */}
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

      {/* Outside the panel and the `ul` that scrolls, anchored to the button that opened it: inside
          it would be clipped by the scroll container and would drag its own scrollbar. */}
      {menuFor && (
        <div
          role="menu"
          // The width goes in the style, not in a class, because it is the same figure subtracted
          // from the button's right edge to line them up: one figure, one place.
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
            Editar
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
  costCenter,
  onCostCenterChange,
  costCenterError,
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
   * This workspace's centers. WITHOUT them —or empty— the dialog stays exactly as it was, which is
   * what leaves Rol de Pagos untouched, whose clients have no centers, and a client in single-
   * statement mode, which has none either.
   */
  centers?: readonly CenterOption[];
  centerLogos?: CenterLogos | undefined;
  /**
   * The company data this workspace prints in its letterhead. It comes in through the same door as
   * `centers`: without it the dialog stays EXACTLY as it was, which is what leaves the modules that
   * ask for no profile untouched. Today only Rol de Pagos passes it.
   */
  company?: CompanyDraft;
  onCompanyChange?: (field: CompanyField, value: string) => void;
  /** The profile's rejection on submit —a RUC without thirteen digits—, already in Spanish. */
  companyError?: string | null;
  /**
   * This workspace's COST CENTER: a name more specific than its own plus its own logo, both
   * optional. It comes in through the same door as `company` and `centers` —without it the dialog
   * stays EXACTLY as it was—, and it is not the same as those: `centers` LISTS the centers that come
   * out of the data so they can be given a logo, and this DECLARES one that is in no data at all.
   * Today only Rol de Pagos passes it.
   */
  costCenter?: CostCenterDraft;
  onCostCenterChange?: (draft: CostCenterDraft) => void;
  /** The center's rejection on submit —a logo with no name—, already in Spanish. */
  costCenterError?: string | null;
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
  // The two words travel together or not at all: half a section headed «Logos por» with no subject
  // is worse than none.
  const centerWords =
    labels.centerSubject && labels.centerPlural
      ? { subject: labels.centerSubject, plural: labels.centerPlural }
      : null;

  // The first missing required field switches «Guardar» off and SAYS which one it is. A button
  // switched off with no reason sends the reader over eight fields by eye, which is exactly what
  // this message avoids. The RUC is not part of it: while being typed it is always half-written, so
  // it is judged on submit.
  const missingCompany = company && onCompanyChange ? firstMissingCompanyField(company) : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className={cn(
          // With the company section the modal is wider —six fields in 440 px come out as a very
          // tall single column— and it can scroll: the button that closes it cannot end up off
          // screen because of how many fields it asks for.
          "w-full max-h-[calc(100vh-56px)] overflow-y-auto rounded-[13px] border border-border bg-surface p-5 shadow-[0_24px_60px_rgba(15,23,42,0.24)]",
          (company && onCompanyChange) || (costCenter && onCostCenterChange)
            ? "max-w-[560px]"
            : "max-w-[440px]",
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
          The cost center goes NEXT TO the client's name and logo because it is the other half of the
          same thing —what the paper that is issued is called and what face it has— and above the
          letterhead because that way the dialog reads in the order in which the paper prints: first
          who heads the paper, then whose is the logo that closes it. The section does not exist if
          the module does not ask for it.
        */}
        {costCenter && onCostCenterChange && (
          <div className="mt-4 flex flex-col gap-1.5 rounded-[9px] border border-border-soft p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint">
                Centro de costo
              </span>
              <span className="text-[11px] text-faintest">opcional</span>
            </div>
            <p className="text-[11.5px] text-faint">
              Su nombre acompaña al del {labels.subject} en el PDF y en el Excel, y su logo va a la
              derecha del membrete. Sin centro todo queda como está.
            </p>
            <label className="mt-0.5 flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-soft">Nombre del centro</span>
              <input
                value={costCenter.name}
                disabled={busy}
                placeholder="Planta Ambato"
                onChange={(event) =>
                  onCostCenterChange({ ...costCenter, name: event.target.value })
                }
                className="h-[34px] rounded-[9px] border border-border bg-surface px-2.5 text-[12.5px] text-ink outline-none placeholder:text-faintest focus:border-brand"
              />
            </label>
            <div className="mt-1">
              <LogoPicker
                value={costCenter.logo}
                onChange={(next) => onCostCenterChange({ ...costCenter, logo: next })}
                disabled={busy}
                label="Logo del centro"
                hint={`Opcional. Va a la derecha del membrete; el del ${labels.subject} encabeza a la izquierda.`}
              />
            </div>
            {costCenterError && (
              <span className="text-[11.5px] text-negative">{costCenterError}</span>
            )}
          </div>
        )}

        {/*
          The company data is the LETTERHEAD: what the firm's paper prints under the logo. It goes
          here and not on a screen of its own because it is the other half of the same thing as the
          name and the logo —this workspace's identity— and separating them would force the reader to
          remember which one is edited where. The section does not exist if the module does not ask
          for it.
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
          The centers' logos go BELOW the main one and in the same dialog because they are the same
          thing —this workspace's visual identity— and splitting them across two places would force
          the reader to remember which one is edited where. The section does not exist until there
          are centers: a freshly created client has none, and a title promising a list over an empty
          list is worse than not being there.
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
            {/* Past four centers the list scrolls instead of pushing «Guardar» off screen: the
                button that closes the dialog cannot depend on how many centers the client
                loaded. */}
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
