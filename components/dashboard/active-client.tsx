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
import { cn } from "@/lib/cn";
import { matchesSearch } from "@/lib/workspaces";

export interface ActiveClientInfo {
  /** Empresa / client shown in bold. */
  name: string;
  /** Period label for the subline, e.g. "Ene–Dic 2026". */
  period?: string;
}

/** One row of the selector. `caption` is what the client IS — its system, mode and years. */
export interface ClientOption {
  id: string;
  name: string;
  /** «Por centros de costo · 2024–2026», or `undefined` for a client with no data yet. */
  caption?: string;
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
}

/** Las de PyG, que es quien estrenó el bloque, y por eso son también el default. */
export const DEFAULT_ENTITY_LABELS: EntityLabels = {
  subject: "cliente",
  plural: "clientes",
  renameKeeps: "sus datos, ajustes y comentarios",
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

  const block = (
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
  );

  if (!interactive) {
    return <div className="ml-auto flex min-w-0 flex-col items-end gap-[3px]">{block}</div>;
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
              {visible.map((entry) => (
                <li key={entry.id}>
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
                      className="flex min-w-0 flex-1 flex-col items-start text-left"
                    >
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
                    </button>
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
 * The «Agregar cliente» / «Renombrar cliente» modal: ONE field, because creating a client asks for
 * no file — the data comes later, and saying so is what stops the reader looking for an upload
 * step that is not there.
 *
 * Validation is the caller's: it owns the list, so only it can say which name is already taken.
 */
export function ClientNameDialog({
  open,
  mode,
  value,
  error,
  busy,
  onChange,
  onSubmit,
  onCancel,
  labels = DEFAULT_ENTITY_LABELS,
}: {
  open: boolean;
  mode: "create" | "rename";
  value: string;
  error: string | null;
  busy?: boolean;
  onChange: (value: string) => void;
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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="w-full max-w-[440px] rounded-[13px] border border-border bg-surface p-5 shadow-[0_24px_60px_rgba(15,23,42,0.24)]"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-brand-soft">
            <Building2 size={17} className="text-brand" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold tracking-[-0.2px] text-ink">
              {creating ? `Agregar ${labels.subject}` : `Renombrar ${labels.subject}`}
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
          <Button type="submit" size="sm" disabled={busy}>
            {creating ? `Crear ${labels.subject}` : "Guardar"}
          </Button>
        </div>
      </form>
    </div>
  );
}
