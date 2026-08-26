"use client";

import { Info, Sparkles, X } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownPanel, useDropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/cn";
import { CHART_COMPOSITION_PALETTE, CHART_PALETTE } from "@/lib/charts/palette";
import {
  availablePresets,
  presetEffects,
  type PresetView,
} from "@/lib/profit-loss/charts/preset-views";
import { activeSource } from "@/lib/profit-loss/charts/selection";
import { usePygAnalytics } from "./pyg-analytics-provider";
import { usePygData } from "./pyg-data-provider";

/**
 * «Predeterminados»: las lecturas que la firma presenta siempre, en UN botón que cuelga su galería.
 *
 * Vive en la barra y no en la cabecera de su tarjeta —donde va todo control que lee una sola
 * tarjeta— porque no es una opción de dibujo: es la otra forma de decidir QUÉ se compara, la misma
 * pregunta que responde «Cuenta contable», y por eso son excluyentes y por eso deja chip. Pero se
 * separa de los cinco desplegables con una línea y se va al extremo derecho de la fila, porque
 * aquellos ACOTAN lo que ya hay en pantalla y estas lo SUSTITUYEN por otra lectura.
 *
 * Fue un interruptor por vista puesto en la propia barra, y el precio era que una vista no cabe en
 * su rótulo: lo único que decía qué iba a pasar al pulsar «Ventas» era un `title=` que solo existe
 * si dejas el ratón encima y esperas. En una tarjeta caben las tres cosas que hay que saber antes
 * de pulsar —el nombre, la pregunta que responde y qué filtros va a mover—, y esa tercera es la que
 * más falta hacía: estas vistas marcan centros, meses y frecuencia por su cuenta, y un botón que
 * mueve marcas que el usuario no puso, sin decirlo, se lee como un fallo.
 *
 * La galería CUELGA DEL BOTÓN (`DropdownPanel`) y no se pone en medio de la pantalla. Fue una
 * ventana, y una ventana apaga el fondo y se planta en el centro: eso es lo correcto para algo que
 * se lee SOLO, y esto es exactamente lo contrario —se elige mirando lo que ya hay dibujado, que es
 * lo que la vista va a sustituir—. Anclada al botón, además, el panel dice de dónde salió y se
 * cierra donde se abrió, como los cinco desplegables de al lado.
 *
 * **Se rinde entero** cuando el plan del cliente abierto no admite ninguna vista —la misma regla
 * con la que «Centro de costo» desaparece en modo estado único—, porque un botón que abre una
 * galería vacía enseña a no pulsar el de al lado.
 */
export function PresetFilter() {
  const { filters, selectPreset, clearPreset } = usePygData();
  const { context } = usePygAnalytics();

  const source = activeSource(context);
  // Qué vistas se ofrecen depende del PLAN abierto: «Ventas» necesita que declare líneas de
  // hotelería y el anexo, que declare cuentas de gasto que repartir.
  const presets = useMemo(() => availablePresets({ source }), [source]);
  if (presets.length === 0) {
    return null;
  }

  const active = presets.find((preset) => preset.id === filters.preset);

  return (
    <div className="ml-auto flex items-center border-l border-border-soft pl-3">
      <Dropdown>
        <PresetTrigger active={active} onClear={clearPreset} />
        {/* Al borde derecho de la barra: alineado a la izquierda se saldría de la ventana, y
            `DropdownPanel` lo devolvería adentro sin que ya apuntara a su botón. */}
        <DropdownPanel align="right" width={620}>
          <PresetGallery
            presets={presets}
            activeId={active?.id}
            onSelect={selectPreset}
            onClear={clearPreset}
          />
        </DropdownPanel>
      </Dropdown>
    </div>
  );
}

/**
 * El botón. Tiene TRES estados y no dos, que es lo que lo separa de los desplegables de al lado:
 * apagado se lee como uno más de la fila; abierto toma el `brand-soft` con el que todo control de
 * la barra dice «me estás usando»; y con una vista puesta se RELLENA de `brand`.
 *
 * Ese relleno es la única cosa maciza de toda la barra, y es deliberado: una vista predeterminada
 * no acota lo que hay en pantalla, lo SUSTITUYE, así que mientras está encendida es el dato más
 * importante de la fila. Pintarlo como un filtro con marcas —el mismo `brand-soft` que llevan
 * «Año · 2026» o «Periodo · 3»— lo dejaba indistinguible de ellos justo cuando más falta hace
 * distinguirlo. Y el rótulo dice CUÁL está puesta («Ventas», no «Predeterminados»), como hace
 * «Año · 2026», para que la vista abierta se lea sin abrir nada.
 *
 * Encendido son DOS botones dentro de la misma píldora, partidos por una divisoria: el rótulo abre
 * la galería y la **✕** quita la vista. Sin ella no había forma de apagarla a la vista: los botones
 * por vista de antes se apagaban pulsando el que estaba encendido, y al plegarlos en uno solo ese
 * gesto se perdió — quedaba el pie del panel y el chip de abajo, o sea dos sitios donde hay que
 * saber mirar. Es el mismo gesto que ya tienen los chips de la tira, que es donde el usuario ya
 * aprendió a quitar cosas. Son dos `<button>` hermanos y no uno dentro de otro, que no es HTML
 * válido y deja el clic de dentro sin forma de no disparar el de fuera.
 */
function PresetTrigger({
  active,
  onClear,
}: {
  active: PresetView | undefined;
  onClear: () => void;
}) {
  const { open, setOpen, triggerRef } = useDropdown();

  return (
    <div
      className={cn(
        "inline-flex h-[34px] items-center rounded-[9px] border text-[12.5px] font-semibold transition-colors",
        active
          ? "border-brand bg-brand text-white"
          : open
            ? "border-brand bg-brand-soft text-brand"
            : "border-border bg-surface text-muted",
      )}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex h-full items-center gap-2 rounded-l-[8px] pl-3 transition-colors",
          active ? "pr-2.5 hover:bg-brand-hover" : "rounded-r-[8px] pr-3 hover:bg-canvas",
        )}
      >
        <Sparkles size={15} />
        {active?.label ?? "Predeterminados"}
      </button>
      {active && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Quitar la vista ${active.label}`}
          className="inline-flex h-full items-center rounded-r-[8px] border-l border-white/25 px-2 transition-colors hover:bg-brand-hover"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

function PresetGallery({
  presets,
  activeId,
  onSelect,
  onClear,
}: {
  presets: readonly PresetView[];
  activeId: string | undefined;
  onSelect: (
    id: string,
    options: Pick<PresetView, "seeds" | "frequency" | "narrowedByCodes">,
  ) => void;
  onClear: () => void;
}) {
  const { setOpen } = useDropdown();

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        {presets.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            active={preset.id === activeId}
            onSelect={() => {
              // Lo que la vista declara de sí misma viaja al proveedor desde aquí: él no importa
              // de `charts/`, y quién siembra qué es de la vista, igual que `isAvailable`.
              onSelect(preset.id, {
                seeds: preset.seeds,
                frequency: preset.frequency,
                narrowedByCodes: preset.narrowedByCodes,
              });
              setOpen(false);
            }}
          />
        ))}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-4 border-t border-border-soft pt-[9px]">
        <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-faint">
          <Info size={13} className="mt-px shrink-0" />
          Al elegir una vista se marcan los filtros que necesita; puedes ajustarlos después en la
          barra.
        </p>
        {activeId !== undefined && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onClear();
              setOpen(false);
            }}
          >
            Quitar vista
          </Button>
        )}
      </div>
    </>
  );
}

/** Una vista: su forma, su nombre, la pregunta que responde y qué va a mover al encenderse. */
function PresetCard({
  preset,
  active,
  onSelect,
}: {
  preset: PresetView;
  active: boolean;
  onSelect: () => void;
}) {
  const effects = presetEffects(preset);

  return (
    <button
      type="button"
      onClick={onSelect}
      // Exactamente una puede estar puesta, así que la fila es de opción única y no una casilla:
      // es el mismo papel que `DropdownChoice` dentro del `role="menu"` del panel.
      role="menuitemradio"
      aria-checked={active}
      className={cn(
        "flex h-full flex-col gap-2.5 rounded-[13px] border p-3 text-left transition-colors",
        active ? "border-brand bg-brand-soft" : "border-border bg-surface hover:bg-canvas",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-px shrink-0">{GLYPHS[preset.id] ?? <BarsGlyph />}</span>
        <div className="min-w-0 flex-1">
          <div className={cn("text-[13px] font-semibold", active ? "text-brand" : "text-ink")}>
            {preset.label}
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-muted">{preset.description}</p>
        </div>
      </div>
      {effects.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {effects.map((effect) => (
            <span
              key={effect}
              className="rounded-full border border-border-soft bg-surface-muted px-2 py-0.5 text-[10.5px] font-medium text-faint"
            >
              {effect}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

/**
 * El glifo de cada vista dice la FORMA de su lectura —barras contra reparto—, que es lo que separa
 * de un vistazo dos tarjetas que por lo demás son dos párrafos iguales. No dice cuáles son los
 * datos: es una miniatura fija y no una previa de las cifras del cliente, porque dibujarla de
 * verdad exigiría una consulta al motor por tarjeta solo para adornar un menú.
 *
 * Los tonos salen de `lib/charts/palette.ts` y no de un hex suelto — es la misma regla por la que
 * ningún builder escribe un color a mano—, y de los DOS sets que le corresponden: barras que
 * comparan entidades toman las ranuras de identidad, y un reparto toma el set cálido con el que se
 * pinta la composición. Así el glifo se parece a lo que sale al pulsarlo.
 *
 * Vive aquí y no en el catálogo porque `lib/` no importa el renderizador, y cae en el genérico para
 * un id que no conozca, de modo que añadir una vista sigue siendo una entrada en `preset-views.ts`.
 */
const GLYPH_SIZE = 22;

function BarsGlyph() {
  const bars = [7, 11, 15, 20];

  return (
    <svg width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox="0 0 22 22" aria-hidden="true">
      {bars.map((height, index) => (
        <rect
          key={height}
          x={index * 5.6}
          y={22 - height}
          width={4.4}
          height={height}
          rx={1.2}
          fill={CHART_PALETTE[bars.length - 1 - index]}
        />
      ))}
    </svg>
  );
}

function PieGlyph() {
  // Un disco dibujado con el trazo de un círculo: `r` a la mitad del grosor lo rellena entero, y
  // cada porción es un tramo del `dasharray`. Girado un cuarto para que empiece arriba, como una
  // tarta de verdad.
  const shares = [0.45, 0.3, 0.25];
  const radius = 5.5;
  const circumference = 2 * Math.PI * radius;
  let consumed = 0;

  return (
    <svg width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox="0 0 22 22" aria-hidden="true">
      <g transform="rotate(-90 11 11)">
        {shares.map((share, index) => {
          const dash = `${share * circumference} ${circumference}`;
          const offset = -consumed * circumference;
          consumed += share;
          return (
            <circle
              key={share}
              cx={11}
              cy={11}
              r={radius}
              fill="none"
              stroke={CHART_COMPOSITION_PALETTE[index]}
              strokeWidth={radius * 2}
              strokeDasharray={dash}
              strokeDashoffset={offset}
            />
          );
        })}
      </g>
    </svg>
  );
}

const GLYPHS: Record<string, ReactNode> = {
  "lineas-de-negocio": <BarsGlyph />,
  "distribucion-de-gastos": <PieGlyph />,
};
