/**
 * The chart mark system. No option builder writes a hex of its own, so the day the brand moves
 * this file is the only edit.
 *
 * **The order of the slots IS the safety mechanism, not a preference.** The eight hexes were
 * picked as a SEQUENCE: slots 1–3 stay apart under deuteranopia and protanopia, and every
 * further slot was chosen against all the previous ones. A chart of four colors is safe
 * *because* it uses the first four — which is why `colorForEntity` is the only way in.
 *
 * **Slot 1 is not `--color-brand`.** The navy `#1e3a5f` sits below the luminance band a
 * categorical palette needs: against the white `surface` it reads as text rather than as a fill.
 * Slot 1 is a lighter step of that same family, so a chart still reads as the brand.
 *
 * The hexes mirror `app/globals.css`'s `@theme` on purpose — a renderer cannot consume a Tailwind
 * utility — and this is the single mirror point.
 */

/**
 * The eight slots, in the order that makes them separable. Never re-sort, never cycle.
 *
 * Saturados a pedido de la firma, que lee estos gráficos junto a su propio libro de Excel y los
 * veía apagados al lado. **Subir el croma no costó separabilidad: la mejoró.** Lo que un daltónico
 * distingue es sobre todo la LUMINOSIDAD y el eje azul-amarillo, así que el paso fue subir croma
 * manteniendo cada tono dentro de la banda y volver a medir, no elegir a ojo.
 *
 * Lo que dice el validador de ESTE orden, para que nadie tenga que volver a derivarlo:
 * banda de luminosidad PASS (los ocho dentro de L 0.43–0.77), piso de croma PASS,
 * separación CVD PASS —peor par adyacente ámbar↔verde ΔE 10.8 protan (antes 9.1)— y piso de
 * visión normal PASS —peor par rosa↔ámbar ΔE 21.7 (antes 19.6)—. El contraste contra la
 * superficie sigue por debajo de 3:1 en verde, ámbar y rosa, igual que antes: por eso toda serie
 * lleva leyenda y toda tarjeta tiene su gemela en tabla, que es el relieve que eso exige.
 */
export const CHART_PALETTE = [
  "#1466c8",
  "#f4501a",
  "#00c98a",
  "#ef9c00",
  "#f4629b",
  "#0b7a12",
  "#5b2fd6",
  "#ec2d2d",
] as const;

/** Lower than the engine's `MAX_SERIES` on purpose: a ninth color would land on top of one. */
export const CHART_MAX_SERIES = CHART_PALETTE.length;

/**
 * Fill colors for the three income statement sections.
 *
 * Matches the tones used in the data table but with deeper shades for better contrast.
 * Validated for accessibility: luminance, chroma, and color vision deficiency (CVD) separation pass.
 */
export const CHART_SECTION = {
  income: "#8fb03c",
  cost: "#3ba3c2",
  other: "#ee8b39",
} as const;

/**
 * Exists so `colorForEntity` is total, NOT so a ninth series can be drawn: queries cap at
 * `CHART_MAX_SERIES`, so reaching this in a chart is a bug upstream showing itself.
 */
export const CHART_NEUTRAL = "#b4bec9";

/**
 * El relleno de una FRANJA de fondo — lo que separa un grupo de columnas del siguiente sin añadir
 * una línea a la retícula. Espeja `--color-border-soft`, un paso por debajo de la línea de la
 * retícula: tiene que decir «esto va junto» de un vistazo sin competir con la barra que le cae
 * encima. `--color-surface-sunken` se probó primero y no se veía — con las barras delante, tres
 * puntos de luminosidad sobre el blanco no son un tramo, son ruido de compresión.
 */
export const CHART_BAND = "#edf1f5";

/**
 * The color comes from the entity's stable position in the compared dimension, NEVER from its
 * index in the result: filtering one series out leaves every other one painted as it was.
 */
export function colorForEntity(entityId: string, order: readonly string[]): string {
  const slot = order.indexOf(entityId);
  if (slot < 0 || slot >= CHART_PALETTE.length) {
    return CHART_NEUTRAL;
  }
  return CHART_PALETTE[slot];
}

/**
 * A label NEVER takes the color of its series: that makes the text a second encoding of what the
 * mark already says. `onFill` is the exception, sitting on a saturated mark.
 */
export const CHART_INK = {
  strong: "#1e293b",
  muted: "#64748b",
  faint: "#94a3b8",
  onFill: "#ffffff",
} as const;

/** The surface a chart sits on; also the color painted into the gaps between fills. */
export const CHART_SURFACE = "#ffffff";

/** One recessive tone, continuous stroke — never dashed or dotted. */
export const CHART_LINES = {
  grid: "#edf1f5",
  axis: "#e5e9ee",
} as const;

/** Stroke weights and gaps shared by every mark. */
export const CHART_MARK = {
  /** Separation between stacked segments and contiguous bars, painted in the surface color. */
  gap: 2,
  /** Line series and reference marks. */
  lineWidth: 2,
  symbolSize: 6,
  barMaxWidth: 44,
  /** Rounded cap on the free end of a bar, anchored to the baseline. */
  radius: 4,
} as const;

/**
 * The SIGN of a variation, never a series color — a chart painting "serie 4" green teaches the
 * reader that green means good. Always shipped with an icon and the signed value.
 */
export const CHART_SIGN = {
  positive: "#16a34a",
  negative: "#dc2626",
} as const;

/** The `var()` resolves against `:root`, where `next/font` writes the generated family. */
export const CHART_FONT = "var(--font-ibm-plex-sans), system-ui, sans-serif";

/**
 * TWELVE hues for the twelve marks of ONE series — a bar per month, a bar per weekday — the way
 * `channelOption` already paints a bar per channel.
 *
 * It is a DECORATIVE set, and that is the whole difference from `CHART_PALETTE`. Those eight slots
 * encode IDENTITY and were sequenced to survive colour blindness, because telling two SERIES apart
 * depends on the colour alone. Here identity is on the axis: every bar is labelled with its month and
 * carries its figure, so the colour is not the reading — it keeps twelve bars from being a wall of one
 * tone. **Never use this set for series.**
 *
 * Muted on purpose (each hue mixed ~18 % toward a mid grey): twelve fully saturated bars side by side
 * are tiring to look at, and these are read for minutes at a time.
 *
 * What the validator says about this order, so nobody has to re-derive it: lightness band PASS (every
 * hue reads as a fill against white), chroma floor PASS (none of them reads grey), and the
 * NORMAL-VISION adjacent floor PASS — worst neighbouring pair ΔE 16.3, which is the check that matters
 * for «que varíe entre barras». Adjacent CVD separation does NOT clear (worst pair, teal↔rosa, ΔE 3.2
 * under protanopia): twelve colourblind-separable hues do not exist, which is exactly why the identity
 * set stops at eight. It is acceptable HERE and only here because a reader who cannot tell two of these
 * apart loses nothing — the month is written under the bar.
 *
 * The order alternates cool and warm families so neighbours differ; do not re-sort it.
 */
export const CHART_PERIOD_PALETTE = [
  "#3e74ab",
  "#dc7046",
  "#cd54a3",
  "#31aa7f",
  "#814bdd",
  "#dd9f1b",
  "#26a2da",
  "#d55756",
  "#6ea126",
  "#d980a1",
  "#1d968c",
  "#af5f22",
] as const;

/** The mark's own slot, by its place on the axis. A thirteenth is the neutral, never a new hue. */
export function colorForPeriod(index: number): string {
  return CHART_PERIOD_PALETTE[index] ?? CHART_NEUTRAL;
}

/**
 * NOT part of any categorical set: those slots exist to be told APART, this ramp exists to be read as
 * one quantity rising.
 *
 * ONE HUE, amarillo claro → ocre — a proper sequential scale, monotonic in lightness, so it survives
 * greyscale and a black-and-white print, and a 372-cell grid never reads as a rainbow. Its direction is
 * written on the grid's own legend («Menos → Más»).
 *
 * Its light steps sit ABOVE the lightness band a categorical fill needs, on purpose: in a heat grid the
 * lowest step is meant to be near the surface. It is `CHART_HEAT_EMPTY` it has to differ from, not the
 * page — and a cell with no data takes that instead, because empty and zero differ.
 */
export const CHART_HEAT_RAMP = ["#fde68a", "#fcd34d", "#f0b429", "#d98b0b", "#a15c07"] as const;

export const CHART_HEAT_EMPTY = "#f6f8fa";

/**
 * La pila de «Distribución», y NADA más. Cinco pasos azul marino → verde claro, monótonos en
 * luminosidad, más el neutro para «Otros».
 *
 * Es una escala ORDENADA y no un set categórico, y esa es toda la diferencia con `CHART_PALETTE`.
 * Allí ocho entidades se comparan entre sí y el color es lo único que las distingue, así que el
 * orden de las ranuras existe para que ninguna se parezca a otra. Aquí los segmentos son PARTES
 * DE UNA MISMA CIFRA, apiladas de mayor a menor en una sola columna: lo que el color tiene que
 * decir es «esto es un reparto y este trozo pesa más que el de arriba», que es justo lo que ocho
 * tonos de identidad —azul, rojo, verde, ámbar— borran, porque cada columna sale pareciendo cuatro
 * asuntos distintos amontonados. El rango va de oscuro abajo a claro arriba porque el orden ya es
 * ese, así que el tono y la posición dicen lo mismo y se refuerzan.
 *
 * **Son CINCO y no ocho, y eso está medido, no elegido.** El arco entero azul→verde mide unos 55
 * ΔE; repartido en ocho pasos deja pares vecinos en ΔE 8, por debajo del piso de visión NORMAL, y
 * en una pila los vecinos son exactamente lo que hay que distinguir. En cinco pasos el mismo arco
 * da 16.6 y pasa. Por eso `foldDistribution` pliega la cola a partir del sexto — el mismo corte
 * que `toPieSlices` ya aplica a la dona por la misma razón.
 *
 * Lo que dice el validador de este orden, para que nadie lo re-derive: piso de croma PASS,
 * separación CVD PASS —peor par adyacente azul↔azul ΔE 14.2 deutan—, piso de visión normal PASS
 * —peor par verde↔verde ΔE 16.6—. La banda de luminosidad NO se cumple y no debe cumplirse: es
 * un requisito de los rellenos categóricos, y una rampa secuencial existe justamente para salirse
 * de ella por los dos extremos (`CHART_HEAT_RAMP` hace lo mismo). El contraste del paso más claro
 * queda bajo 3:1, con el mismo relieve de siempre: leyenda, tooltip y la gemela en tabla.
 *
 * El último tono es `CHART_NEUTRAL` a propósito: «Otros» no es un puesto de la escala sino lo que
 * sobra, y un gris arriba del todo es lo que lo dice sin fingir que es una cuenta más.
 */
export const CHART_DISTRIBUTION_RAMP = [
  "#1a237e",
  "#1550e0",
  "#2f93ff",
  "#00a651",
  "#45de88",
  CHART_NEUTRAL,
] as const;

/** Cuántos segmentos dibuja una pila antes de plegar la cola: los pasos de su propia escala. */
export const CHART_DISTRIBUTION_MAX = CHART_DISTRIBUTION_RAMP.length;

/**
 * El tono por el LUGAR en la pila, que es el rango de la cuenta. No pasa por `colorForEntity`
 * porque aquí el color no sigue a la entidad: sigue a su tamaño, y ese es el encargo.
 */
export function colorForDistributionSlot(index: number): string {
  return CHART_DISTRIBUTION_RAMP[index] ?? CHART_NEUTRAL;
}

/**
 * «Composición de los ingresos», y NADA más. Seis tonos cálidos por el TAMAÑO de la parte, pedidos
 * por la firma sobre una tarta de referencia que trajeron. La tarjeta dejó de ser una tarta —hoy
 * son barras horizontales, como el ranking que tiene debajo— y el set se queda: lo que lo justifica
 * no es el círculo sino el reparto.
 *
 * Que sea un set propio y no `CHART_PALETTE` no es capricho: allí el color sigue a la ENTIDAD para
 * que filtrar una serie no repinte a las demás, y aquí no hay entidades que vayan y vengan —
 * `toPieSlices` devuelve el reparto entero, siempre completo y siempre ordenado de mayor a menor,
 * y el color ya seguía a ese orden. Es el mismo argumento de `CHART_DISTRIBUTION_RAMP`, con una
 * diferencia que cambia la forma: una pila necesita una RAMPA porque sus vecinos se tocan y hay que
 * leer «este trozo pesa más», mientras que un reparto de seis partes que no se tocan solo necesita
 * que las seis se distingan. Por eso esto son hues y no pasos de una escala.
 *
 * **Los tonos de la referencia NO son estos, y la razón está medida.** Aquellos —`#ff0000`,
 * `#ff5600`, `#ff8500`, `#99aa27`, `#00836f`— reprueban dos veces, y la que importa no es la de
 * daltonismo: `#ff5600`↔`#ff0000` dan ΔE 7.6 en visión NORMAL, o sea que la porción del 30 % y la
 * del 20 % son casi el mismo rojo para cualquiera (`#99aa27`↔`#ff8500` dan además ΔE 3.9 protan).
 * En la referencia eso no se nota porque cada porción lleva su «20%» impreso DENTRO: el número es
 * lo que desambigua, no el color. Aquí no: en barras el tono es lo que empareja una fila de la
 * tabla gemela con su barra —un punto de color de 8 px, sin cifra dentro que desambigüe—, así que
 * dos rojos casi iguales sí se confunden. Se conserva entonces el
 * CARÁCTER —el rojo, el naranja y el teal, que son tres de sus cinco tonos y los que dan el aire—
 * y se ensancha el arco: rojo, naranja y ámbar viven en unos 60° de tono, y tres de ellos no llegan
 * al piso de visión normal sin separarse en luminosidad, lo que saca al ámbar de la banda por
 * arriba. El verde oliva pasa a verde, y el quinto y el sexto —azul y magenta— los pone el arco,
 * no la referencia, que solo traía cinco porciones.
 *
 * Ninguno de los seis es una ranura de `CHART_PALETTE`, la misma regla que cumple la rampa de
 * distribución: son dos trabajos distintos y compartir un hex invitaría a leer un parentesco entre
 * una fila de este reparto y una serie de la tarjeta de al lado. El azul se desplazó a `#0f5bb5`
 * justamente por eso, porque `#1466c8` es la primera ranura de identidad.
 *
 * Lo que dice el validador de este orden, para que nadie lo re-derive: banda de luminosidad PASS
 * (los seis dentro de L 0.43–0.77), piso de croma PASS, separación CVD PASS —peor par adyacente
 * magenta↔azul ΔE 15.0 protan, tritan 11.5— y piso de visión normal PASS —peor par verde↔teal
 * ΔE 16.2—. El contraste del naranja (2.3) y el verde (2.92) queda bajo 3:1, con el relieve de
 * siempre: leyenda, tooltip y la gemela en tabla.
 *
 * El orden es el del reparto y no se re-ordena: la comprobación de CVD es sobre pares ADYACENTES,
 * así que mover un tono de sitio invalida la medición de arriba.
 */
export const CHART_COMPOSITION_PALETTE = [
  "#e02b2b",
  "#ff8a00",
  "#00836f",
  "#6fa428",
  "#0f5bb5",
  "#c2185b",
] as const;

/**
 * Cuántas partes dibuja la composición antes de plegar la cola en «Otros»: los tonos de su propia
 * escala. `toPieSlices` recibe este número en vez de llevar un 6 suelto, que es lo que garantiza
 * que «Otros» caiga siempre en la última ranura y ninguna fila se quede sin color.
 */
export const CHART_COMPOSITION_MAX = CHART_COMPOSITION_PALETTE.length;

/**
 * El tono por el LUGAR en el reparto, que es el tamaño de la parte. No pasa por `colorForEntity`
 * por lo dicho arriba: aquí el color no distingue entidades, ordena un reparto.
 */
export function colorForCompositionSlot(index: number): string {
  return CHART_COMPOSITION_PALETTE[index] ?? CHART_NEUTRAL;
}

/**
 * LA SECUENCIA DEL «Ranking de gastos», que es la única tarjeta que dibuja QUINCE barras: las ocho
 * ranuras de identidad seguidas de los doce tonos decorativos del periodo.
 *
 * Las ocho primeras se pintan como siempre, con `CHART_PALETTE`, y eso no es inercia: es el caso de
 * casi todos los clientes —un plan que no llega a nueve cuentas de gasto no ve nunca la cola—, así
 * que la tarjeta no cambia de aspecto hasta la novena barra. El problema empieza justo ahí, y ha
 * tenido dos formas. Con `colorForEntity` las siete últimas devolvían el mismo `CHART_NEUTRAL`
 * —siete barras grises idénticas al fondo de la lista, que es donde se mira para saber qué
 * recortar—. Se arregló con una gama de verde lima a siete luminosidades, y eso quitaba el gris
 * pero no el defecto: un mismo verde repetido sigue leyéndose como una mancha, y lo que la firma
 * pidió es lo que su propia tarta del anexo ya hace —que los tonos SEAN DISTINTOS—.
 *
 * **Por qué el set del periodo y no el de la tarta.** `CHART_SLICE_SEQUENCE` arranca con los seis
 * cálidos de «Composición de los ingresos», que es la tarjeta que va JUSTO ENCIMA del ranking en la
 * misma pantalla; las seis primeras barras saldrían del mismo tono que sus seis filas y, como en
 * las dos el color va por PUESTO y no por entidad, eso se leería como si la primera fila de una
 * fuera la primera de la otra. Los tres sets son disjuntos, así que empezar por las ranuras de
 * identidad evita el choque y deja veinte tonos sin repetir uno solo.
 *
 * **Y sí, `CHART_PERIOD_PALETTE` es el set DECORATIVO**, el que dice «nunca para series». La
 * excepción se paga aquí con el mismo relieve con el que la paga la dona del anexo, y está escrito
 * allí: cada barra lleva su cuenta rotulada en el canal de rótulos y su monto al lado, y la tarjeta
 * tiene su gemela en tabla con las quince cifras. El color no es la lectura —el orden lo dicen la
 * posición de la fila y la longitud de la barra—; lo único que hace es que la cola no sea una
 * mancha. Que su separación CVD entre vecinos no cierre es por eso admisible: un lector que no
 * distinga dos de estos tonos no pierde nada, porque el nombre de la cuenta está escrito al lado.
 */
export const CHART_RANKING_SEQUENCE = [...CHART_PALETTE, ...CHART_PERIOD_PALETTE] as const;

/**
 * Cuántas barras dibuja el ranking. Quince es un límite de LEGIBILIDAD que pidió la firma y no un
 * número que la paleta imponga —hay veinte ranuras—, así que se DECLARA en vez de derivarse de la
 * longitud de la secuencia, que es lo que hacía cuando el corte y la cola eran el mismo 8 + 7. Lo
 * que sigue siendo obligatorio es que ninguna barra dibujada se quede sin tono, y eso pasa de ser
 * una identidad accidental a un invariante escrito en el test: `CHART_RANKING_MAX` ≤ la secuencia.
 */
export const CHART_RANKING_MAX = 15;

/**
 * El tono de una barra del ranking por su PUESTO: las ocho primeras del set de identidad, las
 * siguientes de los decorativos del periodo. Pasada la secuencia se cae en el neutro, como todo lo
 * demás en este archivo — pero no se llega, porque el corte del ranking es `CHART_RANKING_MAX`.
 */
export function colorForRankingSlot(index: number): string {
  return index < 0 ? CHART_NEUTRAL : (CHART_RANKING_SEQUENCE[index] ?? CHART_NEUTRAL);
}

/**
 * La secuencia de la DONA DEL ANEXO, que es la única tarta de la app que no pliega su cola.
 *
 * «Composición de los ingresos» reparte seis porciones y cierra en «Otros» porque su pregunta es de
 * qué se compone el total: la séptima cuenta más grande no cambia esa respuesta. El anexo de gastos
 * hace la contraria — es una LISTA de rubros que tiene que aparecer entera, porque el contador la
 * coteja fila por fila contra su hoja—, y ahí «Otros · 16,6 %» esconde justo lo que se venía a leer.
 *
 * Son los seis tonos cálidos de la composición seguidos de los doce decorativos del periodo, y ese
 * orden importa: las porciones grandes conservan el aspecto que la tarta ya tenía, y la cola —que es
 * la que aparece de más— toma el set que existe para «una serie con muchas marcas». Reusarlo aquí es
 * legal por el MISMO motivo que allí, escrito en `CHART_PERIOD_PALETTE`: cada porción lleva su nombre
 * y su porcentaje en la etiqueta y otra vez en la leyenda, así que el color no es la lectura — evita
 * que diecisiete porciones sean una sola mancha, nada más.
 *
 * **Lo que NO arregla, y hay que saberlo:** una tarta de diecisiete porciones con cuatro por debajo
 * del 1 % no es legible por muchos tonos que tenga, y es el propio archivo de la firma el que lo
 * enseña. Lo que sostiene esta tarjeta no es el color sino los dos relieves de siempre — la etiqueta
 * que `hideOverlap` deja caer cuando no cabe, y la GEMELA EN TABLA, que lista los diecisiete con su
 * cifra. La dona da la forma; la tabla da el dato.
 */
export const CHART_SLICE_SEQUENCE = [
  ...CHART_COMPOSITION_PALETTE,
  ...CHART_PERIOD_PALETTE,
] as const;

/** Cuántas porciones puede nombrar una tarta sin repetir tono. La decimonovena cae en el neutro. */
export const CHART_SLICE_MAX = CHART_SLICE_SEQUENCE.length;

/** El tono por el LUGAR en el reparto, como en la composición: aquí tampoco sigue a la entidad. */
export function colorForSliceSlot(index: number): string {
  return index < 0 ? CHART_NEUTRAL : (CHART_SLICE_SEQUENCE[index] ?? CHART_NEUTRAL);
}

/** The scale is handed in, not derived per grid: two grids must mean the same by the same tone. */
function rampStep(ramp: readonly string[], value: number | null, min: number, max: number): string {
  if (value === null || !Number.isFinite(value)) {
    return CHART_HEAT_EMPTY;
  }
  if (max <= min) {
    return ramp[ramp.length - 1];
  }
  const share = (value - min) / (max - min);
  const slot = Math.min(ramp.length - 1, Math.floor(share * ramp.length));
  return ramp[Math.max(0, slot)];
}

export function heatStep(value: number | null, min: number, max: number): string {
  return rampStep(CHART_HEAT_RAMP, value, min, max);
}
