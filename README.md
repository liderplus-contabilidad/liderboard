# liderboard

**LiderPlus** — panel financiero para una firma contable. La interfaz está en **español**;
el código (identificadores, slugs de rutas) en **inglés**. Es una app **solo para escritorio**
(sin capa responsive/móvil).

## Stack

- [Next.js](https://nextjs.org) 16 — App Router, Server Components por defecto.
- Tailwind CSS v4 (CSS-first; el tema vive en `app/globals.css`, no hay `tailwind.config.js`).
- [oxc](https://oxc.rs) para lint y formato (`oxlint` / `oxfmt`) — no ESLint/Prettier.
- [Apache ECharts](https://echarts.apache.org) 6 para las gráficas, con _imports parciales_
  desde `echarts/core` y renderer SVG.
- Fuentes IBM Plex Sans/Mono vía `next/font`; iconos de `lucide-react`.
- Gestor de paquetes: **pnpm**.

## Puesta en marcha

```bash
pnpm install
pnpm dev            # servidor de desarrollo en http://localhost:3000
```

## Scripts

| Tarea                             | Comando          |
| --------------------------------- | ---------------- |
| Servidor de desarrollo (:3000)    | `pnpm dev`       |
| Build de producción (type-check)  | `pnpm build`     |
| Servir el build                   | `pnpm start`     |
| Lint                              | `pnpm lint`      |
| Lint + autofix                    | `pnpm lint:fix`  |
| Formato                           | `pnpm fmt`       |
| Verificar formato (CI)            | `pnpm fmt:check` |
| Tests (Vitest, solo la capa pura) | `pnpm test`      |

Tests con **Vitest**, solo sobre la capa pura de `lib/` (parse/derive/persistencia, el motor
analítico, la paleta y los constructores de opción de gráfica); no hay tests de componentes.

## Estructura

```
app/(dashboard)/        shell persistente (sidebar + header) y páginas de cada módulo
components/ui/           primitivas reutilizables (Button, Dropdown, SegmentedControl,
                         Toolbar, EmptyState, FilterChip, Checkbox, Select, …)
components/dashboard/    shell: sidebar, header, tabs de módulo
components/profit-loss/  composiciones específicas de Pérdidas y Ganancias
  └ charts/              tarjetas y vistas de Gráficos y Análisis
components/occupancy/    composiciones específicas de Ocupaciones (tabs, grilla y gráficas)
  └ charts/              vista de Gráficos, mapa de calor y panel del día
lib/modules.ts           registro de módulos (única fuente de verdad de la navegación)
lib/format.ts            helpers de formato de toda la app (moneda EC, número, porcentaje)
lib/date.ts              etiquetas de calendario compartidas (meses en español)
lib/charts/              paleta categórica y sistema de marcas, comunes a toda la app
lib/profit-loss/upload/  registry de estrategias de carga (una por sistema contable) + merge
lib/profit-loss/analytics/  motor analítico puro (series, transformaciones, Pareto, pastel)
lib/profit-loss/charts/  traducción pura: selección → consulta → opción de ECharts
lib/occupancy/           capa pura de Ocupaciones (parse, derive, consolidate, export) + Dexie
lib/occupancy/analytics/ motor de Ocupaciones (series por métrica, KPIs, canales, semana)
lib/occupancy/charts/    traducción pura: marcas → consulta → opción de ECharts
openspec/                especificación viva: propuestas de cambio y specs por capacidad
```

## Especificación (OpenSpec)

Todo cambio no trivial se especifica con **[OpenSpec](https://github.com/Fission-AI/OpenSpec)**
antes de tocar código. El flujo vive en `openspec/`:

- `openspec/changes/<nombre>/` — una propuesta en curso: `proposal.md` (por qué), `design.md`
  (cómo), `specs/<capacidad>/spec.md` (requisitos con escenarios) y `tasks.md` (pasos). Se
  crean con `openspec new change` o con el skill `/opsx:propose`, y se validan con
  `openspec validate <nombre>`.
- `openspec/specs/<capacidad>/spec.md` — la especificación **vigente** de cada capacidad, a la
  que un cambio se archiva (`/opsx:archive`) una vez implementado.

No se usa `docs/superpowers/specs/` para specs nuevos: OpenSpec es la única fuente.

Las **funciones de formato son de toda la app**: cualquier número que se muestre al
usuario pasa por `lib/format.ts` (`formatCurrency` → USD de Ecuador con símbolo `$`) para
que todo el panel hable el mismo idioma. Los módulos nuevos las reutilizan en vez de
formatear localmente.

En Ecuador el dólar se escribe **con coma para los miles y punto para los centavos**
(`$57,961.95`). El ICU de `es-EC` aplica la convención española y devuelve `$57.961,95`,
así que los formateadores se construyen sobre `en-US` —el par de separadores que el país
usa de verdad— y la mitad española del idioma (el espacio del `%`, los textos) se escribe
a mano. `parseCurrency` es su inverso exacto y **valida la forma antes de limpiar los
separadores**: un importe tecleado al revés (`17.338,85`) se rechaza en vez de leerse como
17,33885.

**Los Excel que descarga la app no pasan por esos formateadores, y no pueden.** Una celda
guarda un número real más un código de formato, y la `,` y el `.` de ese código son
_marcadores_: el carácter que sale lo elige la configuración regional **de quien abre el
archivo**, y con el sistema en Ecuador es otra vez la convención equivocada de CLDR.
`CURRENCY_FMT` en `lib/profit-loss/export.ts` pide el locale en-US con `[$$-409]` porque es
lo único que el archivo puede declarar sobre sí mismo, y Sheets y LibreOffice sí lo
respetan — pero **Excel para Mac lo ignora**: en macOS `en_EC` los montos solo salieron
bien tras cambiar System Settings › Language & Region › Number format. Es decir: el formato
del Excel descargado **no está bajo el control de la app**. La alternativa determinista
sería escribir los montos como texto, y cuesta que las celdas dejen de sumar y que
`app-workbook.ts` pierda el round-trip, así que no se hace.

## Sistema visual

Los tokens viven una sola vez en el bloque `@theme` de `app/globals.css` y se consumen como
utilidades de Tailwind (`bg-brand`, `text-muted`, …). **Antes de escribir markup nuevo, usa un
token y una primitiva de `components/ui/`; no escribas hex sueltos ni estilos en línea.**

### Color

| Token                           | Valor                             | Uso                                                              |
| ------------------------------- | --------------------------------- | ---------------------------------------------------------------- |
| `brand`                         | `#1e3a5f`                         | Azul de marca: acción primaria, textos activos, código de cuenta |
| `brand-hover`                   | `#16324f`                         | Hover de la acción primaria                                      |
| `brand-soft`                    | `rgba(30,58,95,.08)`              | Fondo tenue de un control/fila activos                           |
| `canvas`                        | `#f4f6f8`                         | Fondo de la app (detrás de las tarjetas)                         |
| `surface`                       | `#ffffff`                         | Fondo de tarjeta, tabla, panel                                   |
| `surface-header`                | `#fafbfc`                         | Cabeceras y pies de tarjeta/tabla                                |
| `surface-muted`                 | `#f8fafc`                         | Hover de fila, franja de descanso                                |
| `surface-sunken`                | `#f3f6f9`                         | Barra hundida (toolbar `tone="sunken"`)                          |
| `surface-calc` / `-calc-strong` | `#f2f6fa` / `#eaf0f6`             | Relleno azulado de una fila **calculada** (Ocupaciones)          |
| `border`                        | `#e5e9ee`                         | Borde estándar de tarjeta/control                                |
| `border-soft` / `border-faint`  | `#edf1f5` / `#f1f4f7`             | Separadores internos de tabla, cada vez más tenues               |
| `ink` / `ink-soft`              | `#1e293b` / `#334155`             | Texto principal y su variante suave                              |
| `muted` / `faint` / `faintest`  | `#64748b` / `#94a3b8` / `#b4bec9` | Texto secundario → terciario → placeholder                       |
| `positive` / `negative`         | `#16a34a` / `#dc2626`             | **Solo el signo** de un valor (rojo = negativo/pérdida)          |
| `warning`                       | `#d97706`                         | Avisos de cuadre, marca de celda comentada                       |
| `zero`                          | `#c2cbd5`                         | El `–` de una celda en cero                                      |
| `marked` / `marked-strong`      | `#fef3c7` / `#f6c945`             | Celda con ajuste de valor (pintada) y borde de la recién movida  |
| `chip` / `chip-border`          | `#eef2f6` / `#dce3eb`             | Fondo y borde de chips de filtro                                 |

**Verde y rojo son señal de signo, no colores de serie.** Nunca pintan una categoría, y nunca
viajan solos: siempre acompañados de flecha (`▲`/`▼`) y del valor con signo, porque el color
solo no es una lectura para todos.

### Tipografía

- **Fuentes:** IBM Plex Sans (`font-sans`) para todo el texto; IBM Plex Mono (`font-mono`) para
  cifras, códigos de cuenta y valores editables. Se cargan con `next/font` en `app/layout.tsx`.
- **Todo número usa `tabular-nums`** para que las columnas alineen.
- **Escala real en uso** (px, porque el diseño es de densidad fija de escritorio):

  | Tamaño      | Dónde                                                     |
  | ----------- | --------------------------------------------------------- |
  | `21px`      | Cifra de un stat tile                                     |
  | `15px`      | Título de un panel lateral                                |
  | `13–14px`   | Celdas de tabla, cuerpo de controles, botón primario `md` |
  | `12.5px`    | Cuerpo de controles secundarios, etiquetas de métrica     |
  | `11.5px`    | Subtítulos, pies de tabla, badges de resultado            |
  | `10.5–11px` | Micro-etiquetas en versalitas, código de cuenta           |

- Las **micro-etiquetas** van en versalitas: `uppercase tracking-[0.5px]` (o `0.6px`) con
  `font-semibold text-faint`. Es el patrón de `ToolbarLabel` y de los encabezados de columna.

### Forma y espacio

- **Radios:** `13px` tarjeta/tabla/panel · `9px` botón y control de toolbar · `8–12px`
  popovers y campos · `rounded-full` chips y badges.
- **Alturas de control:** toolbar `34px` · botón `md` `38px` / `sm` `32px` (`h-8`) · input de
  popover `h-9` · botón de popover `h-8`. Las tres son tamaños del primitivo `Button`
  (`md` · `toolbar` · `sm`): un control de barra se pide con `size="toolbar"`, no se escribe a
  mano.
- **Padding de contenido:** `px-7 py-5` en el cuerpo de una vista · `px-[18px] py-3` en
  cabeceras de tarjeta · `gap-2.5` entre controles de una toolbar.
- **Sombras:** siempre `rgba(15,23,42,…)` (nunca negro puro). Popover
  `0_18px_50px_/.22`; modal `0_24px_60px_/.24`; panel lateral `-18px_0_50px_/.13`.
- **Iconos:** `lucide-react`, tamaño `13–16px` según el control.

### Gráficas

El sistema de marcas vive en `lib/charts/palette.ts` y es la **única** fuente de color de una
gráfica: `colorForEntity` es la única forma en que una serie recibe color. La paleta tiene
**ocho ranuras** en un orden que las mantiene separables bajo daltonismo — **no se re-ordenan
ni se ciclan**. Una opción de ECharts es un objeto plano que un canvas no puede resolver contra
una variable CSS, así que los hexes de `palette.ts` **espejan** los del `@theme` a propósito:
ese es el único punto de duplicación permitido, y ningún constructor de opción escribe un hex
propio. (Ver "Gráficos y Análisis" para las reglas de cobertura y doble eje.)

## Estado actual

Los módulos y su navegación salen de `lib/modules.ts`. Cada módulo expone las vistas
**Gráficos** y **Datos**; **Pérdidas y Ganancias** añade además **Análisis**. Dos módulos
tienen datos reales hoy: **PyG** (Datos, Gráficos y Análisis) y **Ocupaciones** (Datos y Gráficos).

Qué pieza de la interfaz aporta cada módulo se declara en el registro `MODULE_VIEWS` de
`ModuleTabs` (`rightSlot` · `toolbar` · `panel`); un módulo que no esté ahí renderiza
"próximamente", así que añadir uno es puramente aditivo. **El estado no vive ahí**: cada
proveedor de datos se monta en el layout del dashboard, porque el header lee lo mismo que el
panel (`ActiveClient` muestra la empresa de PyG y el hotel de Ocupaciones).

**Pérdidas y Ganancias (PyG)** tiene su capa de filtros conectada a los datos:

- El bloque del header (`ActiveClient`) es el **selector de clientes** del módulo (ver "Clientes
  de PyG" más abajo): nombre del cliente abierto, y al desplegarlo la lista completa con buscador,
  `⌘K`, `+ Agregar cliente` y un menú `⋯` por fila para renombrar o eliminar. Sigue siendo
  **prop-driven**: sin lista de clientes se rinde como el bloque de solo lectura de siempre, que
  es como lo usa Ocupaciones.
- **La fila de filtros es la única selección del módulo** — no hay un segundo control (ni
  "Comparar por", ni un selector de centro propio de Datos) donde elegir lo mismo distinto.
  En orden: **Cuenta contable** (marca varias; son a la vez el foco de la tabla de Datos y el
  universo de cuentas de las gráficas), **Nivel** (único control de profundidad del árbol:
  expande/colapsa hasta el nivel elegido, o "Todos los niveles"; el máximo es el nivel más
  profundo de **todos** los archivos del workspace; no filtra series, solo pliega la tabla),
  **Centro de costo** (checkboxes por vista real + atajo "Todos (Consolidado)"; oculto en
  modo un-solo-archivo) y **Periodo** (checkboxes de la granularidad activa; acota el eje de
  toda la pestaña y las columnas de Datos, nunca convierte un periodo en serie), con **Ver
  por** (granularidad) alineado a la derecha. Debajo, una **franja de chips** (una por marca
  activa, más "Quitar todo") aparece solo cuando hay algo marcado y es la misma en las tres
  pestañas. Las listas de cuentas y centros salen del Excel cargado; el estado vacío solo
  aparece cuando no hay datos.
- **Acciones de Excel** (`PygExcelActions`, solo en la tab Datos): el bloque compartido
  `ExcelActions` (ver "Acciones de Excel" más abajo) en el `rightSlot` de la fila de tabs —
  **Cargar Excel** (abre el modal de carga, el mismo para los dos modos), menú **Descargar
  Excel** (Excel completo/con tus datos · Un mes en crudo, ver "Descarga de Excel" más abajo) e
  ícono de **información** con los formatos aceptados, leídos del registry. No llevan selector
  de centro propio: qué centro lee Datos y si es editable sale del filtro **Centro de costo** de
  la fila de filtros (ver abajo).

**Tabla de Datos de PyG** (`DatosView` en la tab Datos) — el estado de resultados editable:

- Componente **controlado por props y listo para el Excel**: sin datos muestra un **estado
  vacío** ("Carga un Excel…"); cuando llegan filas, arma la grilla. La carga y la descarga
  del Excel ya están implementadas (ver "Carga de Excel" y "Descarga de Excel" más abajo).
- Grilla con **árbol de cuentas** (expandir/colapsar), meses + **Total**, **columnas
  ordenables**, negativos en rojo, ceros como `–` y marca de esquina en celdas con comentario.
  El filtro **Periodo** acota qué columnas se ven (conservando el índice real de cada mes, así
  que editar sigue escribiendo en el mes correcto); el **Total** sigue siendo el del año
  completo y se rotula **"Total año"** mientras haya un recorte de periodos activo, para que
  nadie lo lea como la suma de lo visible.
- **Edición de celdas**: solo las **cuentas de movimiento** (hoja del árbol) editan su valor;
  las **cuentas padre** se calculan desde sus movimientos y solo admiten comentario. Ediciones
  y comentarios persisten en IndexedDB (Dexie) y solo están disponibles en la vista Mensual.
- **Centro de costo, derivado del filtro** (no un selector propio de Datos): ningún centro
  marcado o varios marcados resuelven al **Consolidado** (suma de todos los centros mensuales,
  **Sin centro de costo** incluido — solo lectura); exactamente un centro marcado resuelve a
  **ese** centro, editable en vista Mensual (Sin centro de costo también, es un centro más). La
  tabla nombra la causa cuando no se puede editar (Consolidado, varios centros marcados, o vista
  no mensual). El subtítulo del header nombra el centro resuelto.
- **Meses no cargados, vacíos y no editables.** El workspace declara qué meses cargó de cada año
  (`loadedMonthsByYear`); un mes nunca cargado se rinde en blanco (`–`) y no abre para editar,
  distinto de un mes cargado con movimiento en cero. Una celda con un **ajuste de valor** se **pinta** de
  amarillo pastel (`marked`), conviviendo con el triángulo de comentario: una reclasificación
  mueve una celda de la sección de arriba, casi siempre fuera de vista, y una celda pintada se
  encuentra de un vistazo donde un subrayado no se veía. La que **acaba** de moverse lleva además
  un borde `marked-strong` que se desvanece solo — la pintura dice «esta está ajustada», el borde
  dice «esta es la que cambió recién».
- **Ficha de cuenta** (panel lateral): cada fila de cuenta trae un enlace **«ficha»** que
  aparece al pasar el mouse (columna fija a la derecha, para que no se pierda con el scroll
  horizontal; alcanzable con teclado). Abre un `SidePanel` derecho —sin velo, para leerse
  _contra_ la tabla— que resume el rendimiento de esa cuenta en **todos los periodos con
  información**: total, periodos con movimiento sobre periodos cubiertos (`2 de 7`, no de 12),
  promedio de periodos activos, periodo más alto, % dentro del padre, variación del último
  periodo contra el anterior y nivel en el plan; más la evolución dibujada con el mismo
  `barOption` dentro de una `ChartCard`. Los números salen del **motor analítico** (una consulta
  de una cuenta), así que heredan su cobertura: un `null` nunca se cuenta como `0` y un cero real
  no cuenta como movimiento. Sigue la **frecuencia activa** (en Anual, sin gráfica). Las reglas
  viven en `lib/profit-loss/charts/account-detail.ts` (puro, testeado); el panel solo formatea.
  Aplica a todas las cuentas salvo «Utilidad o Pérdida», que es derivada.
- **Segmentar gastos** (botón bajo la tarjeta, solo en Datos): parte el estado en operacional
  y no operacional. Copia el subárbol **5.2** como la raíz **6** de gastos no operacionales,
  re-nivelando el código (`5.2.1.1 → 6.1.1`) y conservando el nombre de cada cuenta, con todos
  los montos en **0**; alcanza a **todos los centros a la vez** en una sola transacción (el
  Consolidado se recalcula solo, porque suma hojas). Es **de un solo sentido** —para volver
  atrás se re-suben los archivos—, así que el control **desaparece** en cuanto no hay nada que
  segmentar, en vez de quedarse deshabilitado. Su rastro es la sección 6 misma: la presencia de
  la raíz 6 **es** el flag, no hay campo de dataset que migrar.
- **El par 6.x ↔ 5.2.x.** Escribir en una cuenta de la sección 6 hace **dos escrituras**: el
  monto en la 6 y el mismo monto **de menos** en su gemela dentro de 5.2, **por diferencia**
  contra lo que la gemela tenga en ese momento (respeta una corrección manual previa, y
  re-editar `25 → 40` mueve solo los 15). La sección 5 **no cambia su comportamiento**: sigue
  editándose igual que siempre. Nada topa en cero: clasificar de más deja la gemela negativa,
  que la tabla ya sabe mostrar. Las reglas viven en `lib/profit-loss/segment.ts` (puro, testeado).
- **Cómo cierra el estado.** Sin segmentar, una sola fila **«Utilidad o Pérdida»**, exactamente
  como antes. Segmentado, cuatro: **Utilidad Operacional** (Σ4 − Σ5) tras la sección 5,
  **Total No Operacional** (Σ6) tras la sección 6, y **Total Gastos del Ejercicio** (Σ5 + Σ6) y
  **Utilidad del Ejercicio** (Utilidad Operacional − Total No Operacional) cerrando la grilla. La
  fila no operacional es un **total de gastos, no una utilidad**: va en positivo como todo gasto
  en esta app y se **resta**, nunca se muestra negada — es la aritmética del consolidado del
  contador (`9.357,33 − 13.395,59 = −4.038,26`). Como la 6 descuenta de la 5, **la utilidad del
  ejercicio no se mueve al reclasificar** y el badge del header sigue mostrándola. Cada resumen se ancla tras su bloque solo en el orden
  natural: con un orden por mes activo las cuatro caen al final, porque ahí las secciones se
  reacomodan y "después de la sección 5" deja de significar algo.
- Rendimiento: filas memoizadas (`React.memo`), derivaciones con `useMemo` y
  `content-visibility` en las filas; sin virtualización (aún no hace falta).

Los importes usan el **formato de moneda de Ecuador** (`$`) vía `lib/format.ts`.

## Gráficos y Análisis (PyG)

Ambas pestañas consumen el **motor analítico** (`lib/profit-loss/analytics/`) a través de una
capa de traducción pura y testeada; ya no muestran "próximamente".

- **Reparto.** _Gráficos_ responde **cuánto y de qué** (montos por periodo, comparación entre
  cuentas y centros, composición de un total). _Análisis_ responde **cómo cambia**: el peso de
  cada cuenta sobre una base (análisis vertical), el % sobre ingresos de los gastos principales,
  la variación contra el periodo anterior y la concentración de gastos. Ninguna de las dos tiene
  selector de transformación: nombrar la operación del motor —índice base 100, media móvil, %
  sobre la cuenta padre— obligaba a conocer el motor, y lo que el contador lee son las preguntas,
  no las operaciones.
- **Vista por defecto, y filtros que acotan en vez de reemplazar.** Con un Excel cargado y
  nada marcado en la fila de filtros, _Gráficos_ trae los totales del periodo como **stat
  tiles** (Ingresos, Costos y Gastos, Utilidad o Pérdida — un total es un número, no una
  gráfica de una barra), la evolución de Ingresos contra Costos y Gastos, la composición de
  los ingresos y el ranking de gastos; _Análisis_ trae el **análisis vertical**, el % sobre
  ingresos de los gastos principales, la variación contra el periodo anterior y el Pareto. No hay una tarjeta de
  "Comparación" aparte: la tarjeta de evolución de Gráficos dibuja las cuentas (y centros)
  marcados cuando los hay, y las tarjetas de pregunta fija (composición, ranking, cascada, y
  las tres de Análisis) **intersecan** su universo con las cuentas marcadas — vacía a
  propósito cuando lo marcado cae fuera de su pregunta, con un estado vacío que nombra la
  causa en vez de un panel en blanco. Todos son **consultas normales al motor**
  (`toSeriesQuery`/`presetQuery`), la misma ruta para el preset y para lo marcado — no hay un
  camino aparte.
- **Análisis vertical sobre una cuenta base elegible.** La primera tarjeta de _Análisis_ es una
  **tabla** (no una gráfica, así que no pasa por `ChartCard`) de cuentas × periodos: cada celda
  es el % que esa cuenta representa de una cuenta base, y leer la fila es ver cómo fue variando
  ese peso. Las filas son el árbol de cuentas —con su sangría, su plegado y el filtro «Nivel»
  compartido con Datos— y **no tienen que colgar de la base**: con base `4 Ingresos`,
  `5.1 Costo de ventas` es una fila normal. La base la elige un desplegable en la **cabecera de
  la tarjeta**, no en la barra de filtros: nombra el denominador de una sola tarjeta, no recorta
  ni añade ningún dato, y las otras dos pestañas no lo leen. Cierra con **«Total año»**, que es
  `Σ cuenta ÷ Σ base` y **no** el promedio de los porcentajes de columna. Un mes no cargado, o
  una base en cero, dejan la columna vacía con un aviso que nombra el mes — nunca `0,0 %`.
  Todo el cálculo es `lib/profit-loss/charts/vertical.ts`, puro y testeado, y lee la fuente
  directo porque el tope de ocho series de la paleta no aplica a una tabla.
- **Sin una segunda selección que declarar.** El eje de comparación nunca se elige: marcar
  varias cuentas y/o varios centros en el filtro **es** la comparación, y el color se deriva
  del conteo de lo marcado (por cuenta, por centro, o por el par cuenta×centro cuando ambos
  ejes tienen más de una marca) en vez de leerse de una dimensión declarada.
- **Estado compartido, repartido por a quién sirve.** Los tres ejes de la selección —cuentas,
  centros y periodos marcados— viven en `PygFilters` dentro de `PygDataProvider` (en
  `lib/profit-loss/filters.ts`, puro), porque las tres pestañas los leen; se sanean **en
  lectura**, nunca en un efecto. `PygAnalyticsProvider` (montado dentro de `PygDataProvider`,
  así que el layout no cambia) expone `usePygAnalytics()` con solo la mitad de presentación —
  `sources`, `colorOf`, `runQuery` y la cuenta base del análisis vertical — porque solo
  Gráficos/Análisis la usan. La selección vive **en memoria** — sobrevive al cambio entre
  pestañas, no al recargar.

**Reglas que las gráficas no rompen** (cada una con su test en la capa pura):

- **Ninguna gráfica lleva doble eje Y.** El combo de barras + línea comparte un solo eje y una
  sola unidad (monto con su media móvil, o con el mismo periodo del año anterior); lo que cambia
  de unidad va en su propia tarjeta. Por eso el **Pareto** se dibuja como barras horizontales
  ordenadas con el acumulado **como etiqueta**, y no con una segunda escala de porcentaje.
- **Los periodos sin cobertura no se dibujan.** Un `null` no produce marca ni se interpola (los
  archivos que llegan hasta julio no inventan un desplome en agosto); un **`0` real sí se
  dibuja**, y el tooltip omite la serie sin cobertura en vez de reportar `$0`.
- **El color sigue a la entidad, nunca a su posición.** La ranura sale del orden del centro en
  el selector (o de la cuenta en la consulta), así que quitar una serie no repinta las demás y
  un centro conserva su color entre tarjetas. La paleta tiene **ocho ranuras** validadas bajo
  daltonismo y **no se ciclan**: la consulta topa en 8 series y el motor avisa cuántas descartó.
  Verde y rojo quedan **reservados** para el signo de una variación, y siempre con flecha y
  valor con signo — nunca color solo.
- **Un gasto reclasificado sigue siendo un gasto.** Las tarjetas leen **todas** las raíces de
  gasto que el estado tenga (`expenseRootsOf`, leído del propio origen y no declarado), así que
  segmentar no encoge el tile de Costos y Gastos ni el ranking por lo que se movió a la sección
  6, y la Utilidad de Gráficos sigue coincidiendo con el badge de Datos. La cascada y el signo
  contable lo heredan de `rootSign` en `derive.ts`, la **única** definición: 4 suma, 5 y 6 restan.
- **Cada tarjeta tiene su gemela en tabla** ("Ver como tabla"): las mismas series como filas y
  los periodos como columnas, con los valores **ya transformados** (índice 100, variación, YTD)
  y el periodo sin cobertura en blanco. Las advertencias del motor salen **completas** antes de
  la gráfica, y una consulta sin series explica por qué en vez de dibujar un plot vacío.

**Renderizado.** `components/ui/chart.tsx` es el **único** que llama a `echarts.init`: monta la
instancia, aplica cada cambio de opción **sobre la instancia viva** (sin remontar, sin
parpadeo), la redimensiona con `ResizeObserver` (el sidebar colapsa sin disparar `resize` de
ventana) y la destruye al desmontar. Solo se registran `BarChart`, `LineChart`, `PieChart` y
los componentes de rejilla, tooltip, leyenda, etiquetas y línea de referencia; el paquete
completo ronda el megabyte y el chunk de `/profit-loss` entero pesa menos que eso.

## Acciones de Excel (todos los módulos)

Cargar y descargar Excel se ve **igual en toda la app**: un solo primitivo,
`components/ui/excel-actions.tsx`, rinde la fila **Cargar Excel** (brand) · **Descargar Excel**
(secundario) · **ⓘ** (opcional). Los módulos no escriben markup de botón; aportan solo su
dominio. La galería viva está en `/docs/components#excel-actions`.

- **La forma del control de descarga se deriva de las opciones**, no se declara: una sola
  opción rinde un **botón plano** que la ejecuta directo (Ocupaciones, Rol de Pagos, y PyG cuando
  su sistema de origen es de solo lectura), dos o más rinden el **menú** («Excel completo»/«Excel
  con tus datos» + «Un mes en crudo»). Añadir o quitar una descarga es añadir o quitar un elemento
  del array: la forma se ajusta sola, sin un `if` en el módulo.
- **El progreso y el error viven en el primitivo.** Un módulo aporta `run: () => Promise<void>`
  —construye el workbook y lo entrega al navegador— y nada más: el bloque bloquea reentradas,
  cambia el icono por un spinner y, si la promesa rechaza, muestra un panel de error bajo el
  control que deja reintentar. Por eso el `try/catch` y el `import()` dinámico de `exceljs` no
  están duplicados por módulo.
- **`disabled` + `disabledReason`** es cómo un módulo dice que una descarga no está disponible
  (el Consolidado de Ocupaciones, PyG sin dataset); la razón se lee al apuntar el control.
- **La barra de tabs alinea el bloque una sola vez** (`ModuleTabs` envuelve el `rightSlot`), de
  modo que el mismo componente sirve fuera de ella — es lo que monta `PygEmptyState`.

**Para un módulo nuevo:** escribe `components/<módulo>/<módulo>-excel-actions.tsx` que cablee
tu proveedor y tu modal de carga sobre `<ExcelActions/>`, y decláralo en el `rightSlot` de
`MODULE_VIEWS`. No toques el primitivo: si necesitas algo que no expone, es señal de que el
caso es general y va en la API, no en tu módulo.

## Clientes de PyG

Una firma contable lleva diez clientes, no uno. PyG guarda **varios a la vez**, y abrir uno no
toca los datos, ajustes ni comentarios de los demás.

- **Qué es un cliente.** Un nombre que elige el usuario más **exactamente un** estado de
  resultados — sus datasets, su cobertura, sus ajustes y sus comentarios. La lista es plana: un
  cliente no contiene otros ni varios estados. Un cliente que migró de sistema contable se modela
  como dos clientes, porque sus planes de cuentas no se mezclan.
- **Se crea explícitamente y nace vacío** (`+ Agregar cliente`). **Ninguna carga inventa un
  cliente por su cuenta**; la única excepción la pide el usuario desde el diálogo de choque
  ("Crear cliente y cargar"), con el nombre propuesto y **editable**.
- **La etiqueta no es la identidad.** El usuario llama «Manor Galápagos» a lo que el archivo llama
  `DARWIN & WOLF HOTELES Y TURISMO DARWOLF S.A.`, así que el nombre **nunca** se compara contra un
  archivo. Un cliente vacío no tiene identidad: su primera carga la **adopta**, y de ahí en
  adelante el choque se comprueba contra la identidad adoptada. Renombrar no la cambia.
- **Reglas del nombre** (`lib/profit-loss/clients.ts`, puro y con tests): se recorta, no puede
  quedar vacío, tope de 60 caracteres, y es **único ignorando mayúsculas y acentos** — «manor» y
  «Manor» no son dos clientes. El rechazo **nombra** al cliente que ya lo usa.
- **El selector vive en el header** (`ActiveClient` + `PygClientActions`), donde el usuario ya
  mira para saber qué cliente tiene abierto. Al desplegarlo: buscador con foco al abrir (ignora
  mayúsculas y acentos), atajo **`⌘K`** anunciado en la cabecera, `Escape` que devuelve el foco al
  bloque, cada cliente con su sublínea (sistema · modo · años, o «Sin datos cargados») y un menú
  `⋯` por fila con **Renombrar** y **Eliminar**. Sin scrim: el tablero de atrás sigue legible
  mientras se decide. **El componente sigue siendo prop-driven** — sin lista de clientes se rinde
  como el bloque de solo lectura de siempre, que es lo que deja a Ocupaciones intacta.
- **Orden alfabético, sin columna `order`.** Renombrar reordena, que es lo que se espera al
  renombrar.
- **Eliminar cuantifica lo que descarta**: años, centros, cuentas y número de comentarios
  (`describeClientContents`), y nombra uno a uno los clientes que **no** se tocan. «Los ajustes»
  aquí significa lo que significa en toda la app — celdas editadas a mano por encima del valor del
  archivo. Al eliminar el cliente activo se abre el **primero por nombre** de los que queden; si
  no queda ninguno, la app entra en su estado vacío.
- **Sin clientes, la app lo dice y no deja cargar**: el bloque del header queda con **borde
  punteado** («Sin cliente seleccionado» / «Ningún estado de resultados cargado»), el contenido
  ofrece crear el primero explicando qué se gana, y la razón por la que no se puede cargar va
  **visible junto a «Cargar Excel»**, en una píldora, no escondida en un tooltip.
- **El choque de identidad tiene tres salidas, no dos** (`describeIdentityChange` devuelve sus dos
  formas). Las dos tarjetas comparan **empresa y sistema contable** — nunca un NIT, que ninguna
  estrategia extrae — y el sistema se nombra con la etiqueta de su estrategia, jamás con su id:
  - **Otro cliente ya tiene esa identidad**: el archivo pertenece allí. La acción principal es
    **cargar allí**, que no destruye nada; solo cambia el cliente activo.
  - **Ninguno coincide**: la acción principal es **crear el cliente y cargar**. Reemplazar el
    cliente abierto baja a acción secundaria, explicando cuándo tiene sentido (que se haya
    renombrado o cambiado de sistema) y qué descarta exactamente. Ese reemplazo **conserva los
    comentarios de las cuentas que también existan en el archivo nuevo** y descarta los ajustes de
    valor: un comentario sigue siendo cierto cuando la misma cuenta vuelve a llegar; un ajuste es
    una corrección sobre una cifra que el archivo acaba de reemplazar.
  - Y siempre **Cancelar** y **Elegir otro archivo**, que es la salida de «me equivoqué de
    archivo», la más frecuente de todas.
- **Cambiar de cliente no arrastra la selección anterior.** Los filtros se podan **en la lectura**
  (`sanitizeFilters`), no en un efecto, así que una cuenta, un centro o un año que no existan en el
  cliente nuevo desaparecen en el mismo render: no hay un render intermedio con una tabla vacía.
  Los filtros son estado de sesión y **no** se guardan por cliente.
- **Almacenamiento particionado por `clientId`** (Dexie **v7**): tabla `clients`, `clientId` en
  cada dataset, `meta` con **una fila por cliente** en vez de la fila única `"workspace"`, y una
  tabla `active` de una fila que recuerda cuál está abierto entre sesiones. `edits` no cambia de
  forma: cuelga de `datasetId`, único entre clientes, así que una edición no puede llegar al
  cliente equivocado ni con un bug; lo que gana es **borrado en cascada**.
- **`db.ts` es la única puerta a las tablas.** No es limpieza oportunista: con datos de varios
  clientes conviviendo, una consulta sin acotar los mezcla en silencio y nada aguas abajo puede
  notarlo. `ParsedDataset` (`types.ts`) es `PygDataset` sin `clientId` — la capa pura produce
  datasets que todavía no son de nadie y `db.ts` **estampa** el dueño al escribir, porque a qué
  cliente pertenece un archivo lo decide qué cliente está abierto, nunca el archivo.
- **La migración v7 es aditiva.** Dexie no baja de versión, así que no borra ningún dataset ni
  ninguna edición: el workspace guardado se convierte en el primer cliente, con su `companyName`
  recortado o `Cliente 1` si viniera vacío, y queda activo. Una base que nunca cargó nada no crea
  ningún cliente y la app arranca en su estado vacío.
- **Ocupaciones adoptó esta misma forma** en su propio cambio, sobre su propia base: ver
  «Ocupaciones guarda varios hoteles». Las dos listas siguen separadas; lo que comparten es
  `lib/workspaces.ts`, la mitad genérica de un nombre.

## Carga de Excel (PyG › Datos)

- **Un registry de estrategias, no un `if`.** `lib/profit-loss/upload/registry.ts` resuelve
  cada archivo probando una lista **ordenada** de estrategias y quedándose con la primera que
  detecta su forma (nunca el nombre); ninguna acierta → el error enumera los formatos
  aceptados, leídos del propio registry (también alimenta el `ⓘ` de "Archivos aceptados").
  Agregar un sistema contable nuevo es un archivo de estrategia + una línea en la lista, sin
  tocar el resto.
  - `monthly-centers.ts` — el reporte mensual por centros de costo (ver abajo).
  - `monthly-single.ts` — el reporte mensual sin centros de costo, estado único (ver abajo).
  - `microplus.ts` — el `BALANCE DE PERDIDAS Y GANANCIAS` de **MicroPlus**, un segundo sistema
    contable (ver abajo). Solo modo estado único: MicroPlus no maneja centros de costo.
  - `dingoo.ts` — el `ESTADO DE RESULTADOS` de **Dingoo**, un tercer sistema contable (ver
    abajo). También solo modo estado único.
  - `app-workbook.ts` — reconoce cualquiera de las dos descargas «con tus datos» que la propia
    app produce (por su hoja de metadatos oculta compartida) y reconstruye el workspace
    completo, en el modo que declare la metadata.
- **MicroPlus, el segundo sistema contable.** Es la prueba de que el registry es un punto de
  extensión real: entró sin tocar `merge-month.ts`, la persistencia, `derive.ts`, el motor de
  analytics, los gráficos, los filtros ni las vistas. Lo que ejercita, todo dentro de su
  estrategia:
  - **Todo se localiza por etiquetas, nunca por coordenadas** (`microplus-grid.ts`). El
    preámbulo viene repartido en celdas arbitrarias, así que la fila de encabezado es la que
    trae `CODIGO` **y** `NOMBRE DE LA CUENTA`, el rango sale de `Desde:`/`Hasta:` **en celdas
    separadas**, la empresa es el primer texto por encima del rango, y el resultado la fila que
    empieza con `RESULTADO:`. La paginación y la fecha de impresión se ignoran: no son el
    periodo.
  - **El valor de una cuenta es la única celda no nula a su derecha**, decidido por fila. La
    columna codifica la profundidad (el reporte está indentado) y la etiqueta `SALDO` señala una
    que solo usa el nivel 3; leer por la cabecera dejaría en cero todos los demás niveles.
  - **Tres normalizaciones:** se quita el punto final del código (marca de cuenta padre, que se
    conserva solo como verificación cruzada contra el árbol derivado — si discrepan, hay aviso y
    manda el árbol); los números se leen con separador de miles (`"1,221,507.82"`); y la **rama
    de gastos (raíz `5`) se niega al importar**, porque MicroPlus guarda los gastos en negativo y
    suma (`RESULTADO = 4 + 5`) mientras la app los guarda en positivo y resta. Las contra-cuentas
    positivas (`(-) DESCUENTO EN COMPRAS`) se niegan igual y quedan restando gasto.
  - **La misma regla de rango que el resto**, sin excepción por proveedor; anida hasta **7
    niveles**, uno más que los formatos anteriores, y el filtro de Nivel los ofrece sin cambios.
  - Es de **solo lectura**: la app no escribe la plantilla de MicroPlus.
- **Dingoo, el tercer sistema contable — y el espejo de MicroPlus.** Entró igual de limpio: sin
  tocar el núcleo. Lo interesante es dónde difiere, porque cada diferencia confirma que esa
  decisión pertenece a la estrategia:
  - **`Saldo` sí es la columna del valor.** Todos los niveles valen en ella, así que una celda
    vacía es un **cero** y no se sale a buscar el número a otra columna. Es lo contrario de
    MicroPlus, donde la columna codifica la profundidad.
  - **La rama que se niega es la `4`, no la `5`.** Dingoo guarda los **ingresos** en negativo y
    suma (`Resultado = 4 + 5`). Dos sistemas negando ramas opuestas sobre el mismo `derive.ts`
    intacto es la prueba de que la convención de signo es de la estrategia. Las contra-cuentas se
    niegan con su rama: `(-) DEVOLUCIONES EN VENTAS` llega positiva y queda restando ingreso.
  - **El código se conserva verbatim**, con sus ceros a la izquierda (`5.02.01.01.01` donde otros
    escriben `5.2.1.1.1`): es lo que el contador coteja contra su propio archivo. Solo cambia la
    grafía; el plan de cuentas es el mismo y el árbol se deriva de los códigos sin caso especial.
  - **El periodo es una sola línea `Desde el … al …`** — con `al`, no el `hasta el` del estado
    único, cuyo patrón **no** se relaja para aceptarlo. Misma regla de mes calendario exacto.
  - **La empresa se lee saltando los rótulos del propio reporte** (`REPORTE`, `ESTADO DE
RESULTADOS`), que encabezan el preámbulo; sin eso, «la primera línea no vacía» devolvería
    `REPORTE` como razón social.
  - **Las dos detecciones son mutuamente excluyentes, y no por el orden de la lista.** Una vez
    normalizados acentos y mayúsculas, `Código`+`Nombre de la cuenta` es indistinguible de
    `CODIGO`+`NOMBRE DE LA CUENTA`, así que el encabezado por sí solo hacía que MicroPlus
    reclamara los archivos de Dingoo. Cada `detect` exige además **su propia** declaración de
    rango, que es lo que de verdad los separa.
  - Es de **solo lectura**, como MicroPlus.
  - Limitación conocida: **«Segmentar gastos» no aparece** en un workspace Dingoo. `segment.ts`
    busca el código literal `5.2` y el subárbol de gastos de Dingoo es `5.02`, así que no hay nada
    que segmentar y el control se oculta (que es lo que ya hace en ese caso, no queda
    deshabilitado). Generalizarlo es trabajo aparte que beneficia a los cuatro sistemas.
- **Carga mensual e incremental, en ambos modos.** Un archivo = **un mes**. Por centros, la
  rejilla es `GENERAL` + una columna por centro + `SIN CENTRO DE COSTO` (la misma que siempre
  exporta el sistema contable), el archivo **no trae fecha** y el periodo sale del **nombre del
  archivo**, patrón obligatorio `PyG-AAAA-MM[-libre].(xlsx|xls)`. En estado único el archivo **sí
  declara su rango** (`Desde el DD/MM/AAAA hasta el DD/MM/AAAA`, leído por `date-range.ts`), así
  que el nombre no importa; se acepta solo si el rango es **exactamente un mes calendario** (día
  1 al último día real, bisiestos incluidos) — cualquier otra cosa (un acumulado, un mes
  parcial, un rango que no empieza el día 1) se rechaza nombrando el problema. Cualquiera de los
  dos modos escribe **una sola columna**: subir junio escribe el índice 5 y no toca ningún otro
  mes; un centro o una cuenta nuevos se dan de alta con ceros en los meses anteriores. Se pueden
  soltar varios meses de golpe: se parsean **todos antes de escribir nada**, se validan como
  conjunto (una sola identidad — ver abajo —, sin repetir un `(año, mes)`; **mezclar años sí es
  válido**) y se aplican en una sola escritura. Por dentro, un estado único es un workspace con **un único centro sin
  nombre** (`mode: "single"`, `centerId: null`): la misma `mergeMonthSlice` sirve a los dos
  modos, sin rama nueva — solo se salta la validación contra `GENERAL`, que no existe en este
  formato.
- **BREAKING:** los formatos de estado único anteriores —doce columnas de mes o una columna
  `Total` de rango anual— quedan retirados; ninguna estrategia los acierta. `baseFrequency` de
  estado único es ahora siempre `"mensual"`, así que trimestral/semestral/anual quedan
  disponibles sin tocar la capa de filtros.
- **Las ediciones sobreviven la recarga.** Volver a subir un mes reemplaza los valores del
  archivo pero conserva íntegra la capa de ajustes y comentarios — nunca se limpia `edits`. Si
  un ajuste queda encima de un valor que el archivo cambió, la carga lo reporta como
  **conflicto** en el resumen (centro, cuenta, mes, valor anterior/nuevo, valor del ajuste), con
  la opción de quitarlo ahí mismo; el ajuste sigue aplicándose mientras tanto.
- **Cobertura explícita, no adivinada, y por año.** El workspace declara qué meses cargó de cada
  año (`WorkspaceMeta.loadedMonthsByYear`, en ambos modos): un mes nunca cargado y un mes cargado
  en cero producen los mismos ceros pero significan cosas distintas, y solo el primero se rinde
  vacío en Datos y descubierto en Gráficos/Análisis. Va indexada por año porque la cobertura vive
  en el mismo eje que los datos: cargar enero de 2026 no puede marcar enero de 2025 como cubierto.
- **Avisos, nunca bloqueos:** cuadre contra `GENERAL` en modo por centros (un aviso por mes con
  cuántas cuentas no cuadran, nunca uno por cuenta); en estado único se valida en cambio la fila
  «Utilidad o Pérdida» del archivo contra el cálculo.
- **Identidad del workspace: `(sistema, empresa, modo)`** (`workspace-identity.ts`), **derivada**
  de los datasets y el `meta` del cliente, nunca guardada — por eso un cliente vacío no tiene
  identidad y su primera carga la **adopta**. Un archivo que contradiga cualquiera de los tres
  abre el **diálogo de choque** con tres salidas (ver "Clientes de PyG"), y lo que reemplace, lo
  reemplaza solo en el cliente abierto; mezclar identidades en una
  misma carga se rechaza nombrándolas. **El año no está en la identidad**: un dataset es un
  centro-año, así que un archivo de otro año no contradice nada — se suma al workspace sin
  preguntar, y una misma carga puede mezclar años mientras no repita un `(año, mes)`. El
  **sistema** es el id de la estrategia que originó el workspace (`upload/systems.ts`), guardado
  en `WorkspaceMeta.sourceSystemId` y llevado también dentro del Excel de la app, para que
  descargar y volver a cargar conserve el origen. Está en la identidad porque los planes de
  cuentas de dos sistemas son incompatibles (`4.1.01.01.01` frente a `4.1.1.1.1`) y, con la
  empresa coincidiendo —el mismo cliente migrando de sistema—, ninguna otra validación lo
  detendría.
- **Mapeo genérico:** cada estrategia lee su propio esqueleto (preámbulo → cabecera → filas
  `código, nombre, valores`), no un plan de cuentas fijo. Las sumas de cuentas padre y la fila
  "Utilidad o Pérdida" (raíces 4 − raíces 5) **siempre se recalculan desde las cuentas de
  movimiento**.
- **Frecuencias:** el archivo define la frecuencia base y la vista puede agregar hacia
  arriba (mensual → trimestral → semestral → anual, sumas de períodos); nunca se
  desagrega.
- **Persistencia:** IndexedDB (Dexie), particionada por cliente (ver "Clientes de PyG"). Los
  valores de archivo y las ediciones/comentarios viven en tablas separadas. Un mes nuevo (por
  centros o estado único) se aplica con `applyMonthSlice` (nunca toca `edits`); un «Excel
  completo»/«Excel con tus datos» **fusiona por año** dentro del cliente abierto — cada año que
  trae el archivo se reemplaza entero (con confirmación si ese año tiene ediciones) y un año que
  el archivo no trae queda intacto.
- **Decisión — edición solo en vista mensual:** editar valores y comentar celdas solo
  está disponible en la frecuencia Mensual, porque una celda agregada cubre varios
  meses y la edición sería ambigua.

## Descarga de Excel (PyG › Datos)

Generadas con **`exceljs`** (formato + notas de celda, que SheetJS no escribe), cargado por
_dynamic import_ para no engordar el bundle inicial. Dos opciones, sin plantilla vacía (llenar a
mano doce meses por cuenta no es un flujo real):

- **Excel completo / Excel con tus datos:** el estado de resultados del **cliente abierto**,
  entero y de ningún otro; el nombre del archivo no lleva la etiqueta del cliente, sino la empresa
  y el periodo, que es lo que el contador reconoce y lo que la recarga vuelve a leer. En modo por centros, una hoja
  **Consolidado** (suma de todos los centros, Sin centro de costo incluido, con los ajustes ya
  aplicados) más una hoja por centro; en estado único, una única hoja del Estado de Resultados.
  En ambos, los meses no cargados quedan **vacíos**, no en cero, y las cuentas padre llevan sus
  sumatorias en negrita con sangría por nivel. Se exporta siempre en la **frecuencia base**. Se
  **vuelve a subir tal cual**: una hoja de metadatos oculta compartida
  (`_liderplus_workspace_meta`, `veryHidden`) lleva el **modo**, el año, los meses cargados, los
  **comentarios** y el **valor de archivo original** de cada celda ajustada — así el reimport
  separa la base del ajuste en vez de hornearlo, y `app-workbook.ts` reconstruye el modo correcto
  a partir de esa marca. Nombre: `PyG-<año>-completo.xlsx` (por centros) o
  `PyG <empresa> <periodo>.xlsx` (estado único), deliberadamente fuera del patrón mensual para
  que nunca se lean como un mes.
- **Las notas son para leer; la metadata es la que se relee.** Cada celda ajustada lleva una
  **nota** con `Valor original: $X → $Y` (más el comentario si lo hay) y las celdas solo
  comentadas llevan su texto, para que un ajuste nunca sea invisible al abrir el archivo. El
  round-trip **no parsea esa prosa**: los comentarios se restauran desde la hoja de metadatos con
  su texto exacto, y los valores editados vuelven como nueva base.
- **Un mes en crudo:** el mes más reciente cargado, en la misma rejilla del sistema contable —
  por centros, `GENERAL` + centros + Sin centro de costo, con `GENERAL` como la suma de las
  demás columnas; en estado único, la columna `Total` sola, con su propia línea de rango
  (`Desde el … hasta el …`) para que la estrategia de estado único la vuelva a leer — con los
  ajustes ya aplicados. Nombre: `PyG-<año>-<mes>-liderboard.xlsx`, dentro del patrón mensual para
  que reentre sin renombrarlo (irrelevante en estado único, que no lee el nombre).
  **Solo aparece si la estrategia que originó el workspace declara que sabe escribir su formato**
  (`writesOwnFormat` en `UploadStrategy`; sin ese miembro, la estrategia es de solo lectura). Un
  workspace cargado desde MicroPlus o Dingoo, que la app solo sabe leer, se queda con una sola
  opción — y al quedar una, `ExcelActions` la rinde como botón plano en vez de menú, por su propia
  regla de forma. «Excel con tus datos» sigue disponible y sigue volviendo a entrar, conservando
  `microplus` o `dingoo` como sistema de origen.
- **`lib/download.ts`** expone `downloadBlob(blob, filename)`, reutilizable por cualquier módulo.

## Ocupaciones (análisis hotelero)

La pestaña **Datos** carga los `OCUPACION_*.xlsx` reales del contador y los deja navegables por
**Sucursal → Año → Mes**. La capa pura vive en `lib/occupancy/` (parse, derive, consolidate,
export + persistencia Dexie) y está cubierta por vitest; los componentes solo montan.

### Cómo se clasifican los datos

- **La unidad de guardado es la hotel-sucursal-año**, con clave compuesta
  `[hotelId+centerId+year]` en IndexedDB: el contador exporta **un Excel por sucursal y por año**,
  así que esa terna es lo que se escribe, se fusiona y se borra.
- El archivo **se declara a sí mismo**: bajo el título lleva dos líneas, el **hotel** y el
  **centro de costo** (sucursal). Se leen **por posición**, no por etiqueta. Un archivo sin
  línea de centro cae en la sucursal reservada `principal`, rotulada con el nombre del hotel;
  así un hotel de una sola propiedad no es un caso especial en ningún otro sitio.
- El **hotel activo** se elige en el header (`ActiveClient` con la lista de hoteles), con el año y
  la sucursal debajo.
- El espacio guarda **varios hoteles**, cada uno con lo suyo. Subir archivos de otro no borra nada
  por defecto: abre un diálogo de tres salidas (ver más abajo).

### Ocupaciones guarda varios hoteles

- **Un hotel es un nombre que elige el usuario** más lo que el espacio ya contenía: sucursales ×
  años, con su Consolidado. Se crea explícito (`+ Agregar hotel`) y **nace vacío**; ninguna carga
  inventa un hotel por su cuenta.
- **La etiqueta no es la identidad.** El usuario llama «Manor Galápagos» a lo que el archivo declara
  como `CULTURA MANOR`, así que el nombre **nunca** se compara contra el archivo. Lo que se compara
  es el **nombre de hotel que declara el archivo**, normalizado, que el hotel **adopta** en su
  primera carga — y se **deriva** de lo que guarda (`deriveHotelIdentity`), no se almacena: por eso
  un hotel vacío no tiene identidad y su primera carga no puede chocar.
- **Un archivo de otro hotel abre tres salidas** (`describeHotelChange`), y cuál es la principal lo
  decide si otro hotel ya tiene esa identidad: **cargarlo allí** (no se destruye nada, solo cambia
  el hotel activo), **crear el hotel al que pertenece** con un nombre propuesto y editable, o
  —degradada a secundaria— **reemplazar solo el hotel abierto**. Nada se escribe antes de elegir, y
  los archivos siguen en la lista de carga si se cancela.
- **Todo está acotado por `hotelId`** y siempre a través de `db.ts` (Dexie v4/v5: tabla `hotels`
  —que además guarda qué sucursal y qué año tenía abiertos—, `centerYears` con la clave nueva y una
  tabla `active` de una fila para que el hotel abierto sobreviva a una recarga). Con varios hoteles
  compartiendo una tabla, una consulta sin acotar mezclaría dos empresas en silencio.
- **La migración es aditiva.** Nada se borra: el espacio actual se vuelve el primer hotel, con su
  `hotelName` o «Hotel 1», y una base que nunca cargó nada no recibe ningún hotel.
- **Borrar un hotel cuenta lo que descarta** —sucursales, años y meses con datos— y dice que los
  demás no se tocan.

### Carga

- **Modal de staging** (como el de PyG): "Cargar Excel" abre un modal donde
  arrastras o eliges **varios Excel a la vez**, mezclando sucursales y años; cada uno se parsea
  al vuelo y se lista con lo que declara —`CULTURA MANOR · 2026 · 7 meses`, la sucursal-año que
  va a escribir y cuántos meses reemplaza— o con su motivo de fallo, y se puede quitar de la
  lista. Nada se escribe hasta confirmar.
- Se **parsea todo antes de escribir nada**: así la verificación de "todos los archivos son del
  mismo hotel" no puede dejar la base a medias. Si los archivos discrepan entre sí, el modal lo
  avisa nombrando ambos hoteles y no deja cargar; si un archivo falla al leerse, se marca en la
  lista con su motivo y los demás entran igual. Los avisos de lectura se ven en el modal, antes
  de confirmar.
- Recargar una sucursal-año **fusiona mes a mes**: los meses que el archivo trae se reemplazan y
  los escritos a mano sobreviven. El catálogo de canales guardado gana en el nombre (un canal
  renombrado lo conserva) y los canales nuevos del archivo se añaden.
- Solo se leen **insumos crudos**. ADR, ocupación, RevPAR, PAX y todos los totales se
  **recalculan**: en los archivos originales son fórmulas sin resultado cacheado y sus
  agregados mezclan "promedio de ratios" con "ratio de sumas".

### Grilla diaria

- Conceptos a la izquierda, días arriba, **Total / prom.** fijo a la derecha; la columna de
  concepto y la de total son _sticky_. **Todas las columnas de día se ven igual**: intentos
  previos de marcar el fin de semana se leían como "esos días están deshabilitados".
- El **relleno azulado** (`surface-calc`) significa una sola cosa: **esta fila es calculada**.
- Un mes importado se muestra **tal cual del Excel** —con su insignia— hasta la primera edición;
  esa edición pasa **el mes entero** a calculado de golpe, para que nunca se mezclen las dos
  procedencias en una misma tabla.
- **Edición en sitio** con navegación de hoja de cálculo (flechas entre celdas, Enter baja,
  Escape descarta). Los canales de venta son **por mes**: se dan de alta y de baja en el mes que
  se está viendo, sin tocar los demás.
- Avisos de **cuadre** (la suma de canales o de tipos de habitación no coincide con vendidas +
  complementarias) y de **PAX declarado a mano**, en un `NoticeBanner` expandible.

### Consolidado y vista anual

Son dos ejes distintos que se combinan libremente: el año de una sucursal, el consolidado de un
mes, o el año consolidado de todas.

- **Consolidado** (aparece con dos o más sucursales): suma los **insumos crudos** de todas y
  deja que `derive.ts` recalcule los indicadores como **ratio de sumas** — la única definición
  bajo la que `ADR × Ocupación = RevPAR` sigue siendo cierta al sumar. No se guarda: se deriva
  al leer, así que ninguna edición puede dejarlo obsoleto. Es de solo lectura.
- **Vista anual** (botón «Año» al final de la tira de MES): las mismas filas con **un mes por
  columna** y **Total año**. Siempre calculada y de solo lectura — una celda de mes es un
  agregado de días, no hay dónde escribirla. Volver a un mes es tan simple como pulsarlo.
- **Cobertura: cuenta como cargado el mes que tiene ventas** (ingresos o habitaciones vendidas), no
  el que existe. Un libro real es el año entero en doce bloques que el contador llena conforme pasan
  los meses, así que los que faltan ya traen la capacidad del hotel —y a veces filas de habitaciones
  y canales heredadas del año del que se copió—; leerlas como dato hundía la ocupación del año (56 %
  → 32 % en un archivo con siete meses vendidos). Un mes sin ventas deja **toda su columna vacía** y
  no entra en el «Total año», así que la vista anual y los gráficos reportan la misma cifra. Sus
  insumos siguen ahí, visibles y editables, en la grilla diaria de ese mes: la cobertura habla de los
  agregados, no borra nada.
- En la vista anual, **«Habitaciones disponibles» suma habitaciones-noche** (682 en enero) en
  vez del promedio redondeado que muestra la mensual (22): es el denominador real de la
  ocupación de ese mes. Es la única fila que agrega distinto según el alcance, y lo declara en
  su propio subtítulo.

### Descarga

- Exporta la **sucursal-año activa** en el mismo formato de bloques que el parser lee, con las
  dos líneas de cabecera, de modo que el archivo descargado **vuelve a entrar en su misma
  sucursal** sin crear una nueva ni pedir confirmación.
- En el **Consolidado** el botón se deshabilita y explica por qué: es un cálculo de la app, y
  devolverlo como Excel invitaría a re-subirlo como una sucursal fantasma.

### Gráficos

La pestaña tiene su propia **barra de filtros** — **Sucursal · Periodo**, con la franja de chips
activos debajo. Dos controles: **dónde** y **cuándo**. Como en PyG, **la comparación no se declara**:
marcar dos sucursales es lo que la produce.

**El año es parte de la fecha, no una serie.** Se elige dentro del periodo (año · mes · día), lo que
permite un tramo que cruce años; lo que compara son las **sucursales**.

**El filtro de Periodo tiene dos modalidades, nombradas y explicadas dentro del propio control**,
porque responden preguntas distintas:

|               | **Rango de fechas**                               | **Días específicos**                       |
| ------------- | ------------------------------------------------- | ------------------------------------------ |
| Cómo se elige | Desde año+mes+día → Hasta año+mes+día             | Se agregan fechas, de cualquier año        |
| Qué es        | Un tramo continuo                                 | Fechas sueltas                             |
| Qué muestra   | El **total** del tramo y su **evolución**         | Una **fila/columna por fecha**, comparadas |
| Chips         | **Uno**: «del 20 de marzo al 10 de abril de 2026» | Uno por fecha                              |

- **Los meses de los extremos son PARCIALES**: «del 20 de marzo al 10 de abril» son doce días de marzo
  y diez de abril, nunca dos meses enteros.
- **El gesto elige la modalidad**: mover un extremo _es_ un rango, agregar una fecha _es_ días. Lo
  elegido en la otra no se pierde al cambiar.
- **El tramo se escribe en palabras** bajo los selectores («del 20 de marzo al 10 de abril de 2026»):
  dos ternas de desplegables no dicen el tramo que forman.
- **`lib/occupancy/analytics/scope.ts` es la única respuesta a «qué días cubre el periodo»**
  (`periodCells` → `{año, mes, días}`), y de ahí leen el motor de series, los totales del reporte y el
  mapa de calor. Un 29 de febrero existe en año bisiesto y no en los demás; una fecha que el mes no
  tiene se descarta en vez de acercarse a otra.

Se lee en **dos secciones**, cada una con su título, su subtítulo y sus controles:

1. **«Reporte del periodo»** · con «Ver como» y «Ver por» — **cuatro tarjetas** con el total del
   periodo y, debajo, **una** de dos lecturas de esas mismas cifras: las **cuatro gráficas de barras**
   (por defecto, una por cifra) o la **tabla** (centrada, el periodo fila a fila). Nunca las dos: dicen
   lo mismo, y las gráficas dan la forma de la temporada mientras la tabla da la cifra exacta. Cierra con
   **Canales de venta**, alineado al ancho de la lectura que esté puesta.
2. **«Análisis por métrica»** · con el selector de métrica — una sola cifra de cerca: el mapa de calor
   día a día y el ritmo por día de la semana.

**Canales de venta vive en la PRIMERA sección** porque es la única tarjeta que **no lee la métrica**:
cuenta noches por canal, así que es un desglose del total del periodo y va donde está ese total.

**El color encodea el VALOR, y hay DOS rampas** porque el módulo hace dos preguntas distintas sobre una
cifra, y contestar las dos con una sola es lo que hace que un color signifique dos cosas en la misma
pantalla:

| Rampa              | Pregunta                | Pasos                                 | Dónde                            |
| ------------------ | ----------------------- | ------------------------------------- | -------------------------------- |
| `CHART_HEAT_RAMP`  | **cuánto** (intensidad) | amarillo → naranja → **rojo**         | mapa de calor                    |
| `CHART_SCORE_RAMP` | **qué tan bien fue**    | **rojo** → naranja → amarillo → verde | barras y micro-barra de la tabla |

- **Cada marca toma su propio color** de `CHART_PERIOD_PALETTE`, doce tonos por el lugar en el eje, como
  `channelOption` ya pinta una barra por canal. Vale igual para el **ritmo por día de la semana**.
- Es un set **decorativo y apagado a propósito** (cada tono mezclado ~18 % hacia gris): doce barras
  saturadas cansan la vista, y esto se mira minutos seguidos. **Nunca se usa para series** — para eso
  están los ocho slots de identidad, que sí sobreviven al daltonismo.
- **Con dos o más sucursales el color vuelve a la sucursal**: ahí sí codifica identidad y tiene que
  seguir a la entidad que se compara.
- El **mapa de calor** usa una **escala amarilla** de un solo tono (amarillo claro → ocre), monotónica en
  luminancia, así que sobrevive a una impresión en blanco y negro y una cuadrícula de 372 celdas nunca
  se lee como un arcoíris.

Lo que el validador dice del set de doce, para que nadie lo vuelva a derivar: banda de luminancia
**PASS**, piso de croma **PASS**, y el piso de **visión normal PASS** (peor par vecino ΔE 16.3) — que es
la comprobación que importa para «que varíe entre barras». La separación bajo daltonismo **no** pasa
(peor par, verde-azulado↔rosa, ΔE 3.2 en protanopía): doce tonos separables para daltonismo no existen,
que es justamente por qué el set de identidad se detiene en ocho. Es aceptable **solo aquí** porque
quien no distinga dos de esos tonos no pierde nada: el mes está escrito bajo la barra.

**Al entrar:** todo el año, **mes a mes** y en **gráficas**. Doce columnas es la lectura que tiene la
hoja del contador, y es la única granularidad que sirve a las dos mitades del reporte —la tabla no puede
mostrar un eje diario—.

**En la barra va solo lo que ACOTA lo que se ve.** Por eso ni «Métrica» ni «Ver como»/«Ver por» están
ahí: la métrica elige qué cifra mira la segunda sección y los otros dos cómo se lee la primera;
ninguno quita nada de la pantalla. Un control que gobierna una sección vive sobre esa sección.

- **La métrica es de selección única.** Ocupación es %, ADR y RevPAR son $, vendidas y PAX son
  conteos; mezclarlas en una tarjeta pediría un segundo eje Y, que el proyecto no permite. Lo que
  se compara son sucursales, años y periodos, siempre en la misma unidad.
- **En «Comparar» el periodo se marca en dos niveles: mes y día del mes.** Con «Ver por: Día» y
  ningún mes marcado el eje es el año corrido; marcando marzo, son sus 31 días; marcando además el
  día 5, el eje es **una sola columna**. Marcar acota el eje y nunca multiplica las series, así que
  «Cultura Manor, 2025 y 2026, enero, día 5» son dos barras: el 5 de enero de un año contra el
  del otro. Un día marcado vale para **cada** mes marcado («el 5» de enero y de marzo), y un día
  que el mes no tiene simplemente no aparece. Marcar un día pasa «Ver por» a Día por su cuenta:
  sobre el eje mensual no querría decir nada.
- **Cobertura:** un mes que el espacio nunca recibió no dibuja punto; un día dentro de un mes con
  datos que no vendió nada es un cero real y sí se dibuja.
- **La selección se lee en una frase.** Bajo los controles hay una línea «Mostrando 5 de enero ·
  2025 y 2026 · Cultura Manor», y el control de Periodo se rotula con el periodo
  («5 de enero»), no con cuántas casillas hay marcadas. La rejilla de días se ve desde el
  principio, deshabilitada hasta que eliges un mes, para que se sepa que existe.
- **Cuando el eje queda en una sola columna, el eje pasa a ser la entidad:** «el 5 de enero de
  2025 contra el de 2026» son dos barras rotuladas con su año, y la fecha se dice en el
  subtítulo. Dejar «5 ene» en el eje rotularía las dos barras con la misma fecha y escondería la
  comparación en la leyenda.
- **Drill-down, dos movimientos distintos:** clic en la barra de un mes **escribe los filtros**
  (marca ese periodo y baja «Ver por» a Día), y se deshace quitando el chip; clic en un día del
  mapa de calor **abre un panel lateral** con sus indicadores y canales, sin tocar nada — un día
  suelto es un punto, no un nivel del eje.
- **El mapa de calor no es una gráfica de ECharts:** son celdas de color, una cuadrícula por
  sucursal-año marcada (hasta cuatro) y **una sola escala para todas**, que es lo que las hace
  comparables de un vistazo. Es el único consumidor de la rampa secuencial `CHART_HEAT_RAMP`,
  separada de la paleta categórica.

#### Sección 1 · «Reporte del periodo»

Es el resumen que el contador ya llevaba a mano en su propio Excel, y con el que la pestaña ABRE:
**Venta en $ · % Ocupación · Tarifa Prom · RevPAR**, primero como **cuatro tarjetas con el total del
rango marcado** y debajo como **cuatro gráficas de barras** —las mismas cuatro que su archivo dibuja
bajo su tabla—.

- **`MONTHLY_COLUMNS` declara esas cuatro cifras una sola vez** (encabezado, orden y unidad) y de ahí
  las leen las dos mitades, así que una tarjeta y la gráfica de debajo no pueden nombrar ni escalar
  la misma cifra distinto. Cada `id` es a la vez una clave de `MonthlyFigures` y una métrica del
  motor, que es lo que permite una única lista.
- **Las tarjetas son el cierre del rango**: `monthlyTables(...).total`, ratio de sumas, nunca el
  promedio de los meses. Una fila de tarjetas por sucursal-año marcada, con su punto de color: marcar
  dos es pedir compararlas, y una cifra mezclada respondería algo que nadie preguntó.
- **Las gráficas comparten un solo eje** (`buildOccupancyEvolution`, un panel por cifra sobre la misma
  consulta), y **cada una lleva su propia escala**: un porcentaje y un importe no comparten eje,
  comparten periodo. Es lo que permite verlas juntas sin el segundo eje Y que el proyecto no permite.
- **«Ver por» gobierna las cuatro a la vez** y el **clic en una barra baja un nivel** —semestre →
  trimestre → mes → día— escribiendo en los mismos filtros; se deshace quitando el chip. Al ser el
  mismo eje, el clic en cualquiera de las cuatro baja igual.
- **Lo marcado en la barra las acota**: sin meses marcados son los doce del año; marcando marzo es
  una sola barra; con días marcados las cifras cubren solo esos días.
- **Un mes sin ventas no dibuja punto**, y su capacidad no entra en el total — es lo que el Excel de
  origen hace dejando agosto en blanco. Dentro de un mes que sí vendió, un día sin ventas sigue
  siendo un cero real.
- **Dos decimales fijos** en las tarjetas (`formatMonthlyFigure`), sin el umbral por magnitud que usa
  el eje: la tarjeta es la cifra que alguien compara contra su hoja celda por celda, y el eje es una
  escala.
