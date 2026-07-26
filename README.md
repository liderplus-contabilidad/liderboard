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
  popover `h-9` · botón de popover `h-8`.
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

- El **nombre del cliente activo** se muestra en el header del módulo (`ActiveClient`),
  con estado vacío mientras no se carga un Excel.
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
- Leyenda de **semáforo** en la fila de tabs.
- **Barra de acciones de Datos** (`DatosToolbar`, solo en la tab Datos, bajo la fila de
  filtros): barra **fija** de una fila con las acciones de Excel — **Cargar Excel** (abre el
  modal de carga multi-centro), menú **Descargar Excel** (Excel con tus datos · Plantilla
  vacía, ambos conectados al pipeline de exportación) e ícono de **información** con los
  formatos aceptados. Ya no lleva selector de centro propio: qué centro lee y si es editable
  sale del filtro **Centro de costo** de la fila de filtros (ver abajo).

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
  marcado o varios marcados resuelven al **Consolidado** (suma de los centros mensuales, solo
  lectura); exactamente un centro marcado resuelve a **ese** centro (editable en vista Mensual,
  salvo **Sin centro de costo**, que es anual y por tanto solo lectura). La tabla nombra la
  causa cuando no se puede editar (Consolidado, varios centros marcados, o vista no mensual).
  El subtítulo del header nombra el centro resuelto.
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
- Rendimiento: filas memoizadas (`React.memo`), derivaciones con `useMemo` y
  `content-visibility` en las filas; sin virtualización (aún no hace falta).

Los importes usan el **formato de moneda de Ecuador** (`$`) vía `lib/format.ts`.

## Gráficos y Análisis (PyG)

Ambas pestañas consumen el **motor analítico** (`lib/profit-loss/analytics/`) a través de una
capa de traducción pura y testeada; ya no muestran "próximamente".

- **Reparto.** _Gráficos_ responde **cuánto y de qué** (montos por periodo, comparación entre
  cuentas y centros, composición de un total). _Análisis_ responde **cómo cambia**: las
  transformaciones del motor — acumulado YTD, índice base 100, media móvil, mismo periodo del
  año anterior, % sobre ingresos, % sobre la cuenta padre, variación y concentración de gastos.
- **Vista por defecto, y filtros que acotan en vez de reemplazar.** Con un Excel cargado y
  nada marcado en la fila de filtros, _Gráficos_ trae los totales del periodo como **stat
  tiles** (Ingresos, Costos y Gastos, Utilidad o Pérdida — un total es un número, no una
  gráfica de una barra), la evolución de Ingresos contra Costos y Gastos, la composición de
  los ingresos y el ranking de gastos; _Análisis_ trae el % sobre ingresos de los gastos
  principales, la variación contra el periodo anterior y el Pareto. No hay una tarjeta de
  "Comparación" aparte: la tarjeta de evolución de Gráficos dibuja las cuentas (y centros)
  marcados cuando los hay, y las tarjetas de pregunta fija (composición, ranking, cascada, y
  las tres de Análisis) **intersecan** su universo con las cuentas marcadas — vacía a
  propósito cuando lo marcado cae fuera de su pregunta, con un estado vacío que nombra la
  causa en vez de un panel en blanco. Todos son **consultas normales al motor**
  (`toSeriesQuery`/`presetQuery`), la misma ruta para el preset y para lo marcado — no hay un
  camino aparte. En Análisis, elegir una transformación del selector agrega una cuarta
  tarjeta construida sobre las mismas marcas; las tres de pregunta fija no desaparecen.
- **Sin una segunda selección que declarar.** El eje de comparación nunca se elige: marcar
  varias cuentas y/o varios centros en el filtro **es** la comparación, y el color se deriva
  del conteo de lo marcado (por cuenta, por centro, o por el par cuenta×centro cuando ambos
  ejes tienen más de una marca) en vez de leerse de una dimensión declarada.
- **Estado compartido, repartido por a quién sirve.** Los tres ejes de la selección —cuentas,
  centros y periodos marcados— viven en `PygFilters` dentro de `PygDataProvider` (en
  `lib/profit-loss/filters.ts`, puro), porque las tres pestañas los leen; se sanean **en
  lectura**, nunca en un efecto. `PygAnalyticsProvider` (montado dentro de `PygDataProvider`,
  así que el layout no cambia) expone `usePygAnalytics()` con solo la mitad de presentación —
  `transform`, `chartType`, `sources`, `colorOf`, `runQuery` — porque solo Gráficos/Análisis
  la usan. La selección vive **en memoria** — sobrevive al cambio entre pestañas, no al
  recargar.

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

## Carga de Excel (PyG › Datos)

- **Formatos soportados:** reporte mensual (con o sin línea "Centro de Costo"), reporte
  anual (solo columna Total) y el **consolidado por centros de costo** (columnas GENERAL +
  centros + Sin centro de costo, valores anuales).
- **Carga multi-centro (modal de staging):** "Cargar Excel" abre un modal donde arrastras o
  eliges **varios archivos a la vez**; cada uno se parsea al vuelo y se muestra con su rol
  detectado (centro / consolidado / estado único). Los archivos se agrupan por **contenido**
  (línea "Centro de Costo:" + empresa), **nunca por el nombre de archivo** — los reportes
  reales tienen nombres poco confiables. Los centros salen de las sucursales mensuales; el
  **Consolidado** se calcula sumándolas; el archivo consolidado aporta **Sin centro de costo**
  (anual) y valida los cuadres (`Σ centros + Sin-centro = GENERAL`, descuadre por cuentas de
  cada centro, y un aviso claro cuando un centro entra **vacío** —todo en 0— pero el
  consolidado sí trae datos, señal típica de haber cargado el archivo mensual equivocado). Los
  avisos salen en un banner **expandible** (`NoticeBanner`, con "Ver detalle" para leer cada
  mensaje) tanto en la vista Datos como en el preview del modal de carga.
- **Mapeo genérico:** el parser lee el esqueleto (preámbulo → cabecera → filas
  `código, nombre, valores` → fila Utilidad), no un plan de cuentas fijo. Las sumas de
  cuentas padre y la fila "Utilidad o Pérdida" (raíces 4 − raíces 5) **siempre se
  recalculan desde las cuentas de movimiento**; los valores del archivo solo validan el
  parseo (los descuadres se avisan).
- **Frecuencias:** el archivo define la frecuencia base y la vista puede agregar hacia
  arriba (mensual → trimestral → semestral → anual, sumas de períodos); nunca se
  desagrega. Un archivo anual queda bloqueado en Anual.
- **Persistencia:** IndexedDB (Dexie). El dataset original y las ediciones/comentarios
  viven en tablas separadas — la comparación "original vs editado" llegará sin
  migraciones. Subir otro archivo reemplaza todo (con confirmación si hay ediciones); si
  el archivo fue exportado por la app, sus **comentarios se restauran** al recargarlo.
- **Decisión — edición solo en vista mensual:** editar valores y comentar celdas solo
  está disponible en la frecuencia Mensual, porque una celda agregada cubre varios
  meses y la edición sería ambigua. Si a futuro se quiere editar en vistas agregadas
  (p. ej. prorrateando entre meses), esta decisión es el punto a revisitar.

## Descarga de Excel (PyG › Datos)

- **Dos exportaciones** (menú "Descargar Excel"), generadas con **`exceljs`** (formato +
  notas de celda, que SheetJS no escribe), cargada por _dynamic import_ para no engordar el
  bundle inicial:
  - **Excel con tus datos:** el Estado de Resultados con los **valores editados** y los
    **comentarios** actuales, con formato (preámbulo, cabecera y cuentas padre en negrita,
    sangría por nivel, moneda a 2 decimales, columna Total, paneles congelados). Cada celda
    editada lleva una **nota** con `Valor original: $X → $Y` (más el comentario si lo hay);
    las celdas solo comentadas llevan su texto. Se exporta siempre en la **frecuencia base**.
    En **modo multi-centro** genera un libro con **una hoja por centro** (con sus ediciones y
    comentarios) + la hoja **Consolidado** (suma calculada) + **Sin centro de costo** si existe.
  - **Plantilla vacía:** la misma estructura **sembrada con tus cuentas** (código + nombre)
    y los montos en blanco, para llenar y volver a cargar.
- **Round-trip:** el archivo "con tus datos" se **vuelve a subir** sin error; los valores se
  conservan y los **comentarios se restauran**. El re-import usa una **hoja de metadatos
  oculta** (`_liderplus_meta`, `veryHidden`) con el texto exacto del comentario — no se
  parsea la prosa de las notas. Los value-edits no se "reviven": los valores editados quedan
  como nueva base.
- **`lib/download.ts`** expone `downloadBlob(blob, filename)`, reutilizable por cualquier módulo.

## Ocupaciones (análisis hotelero)

La pestaña **Datos** carga los `OCUPACION_*.xlsx` reales del contador y los deja navegables por
**Sucursal → Año → Mes**. La capa pura vive en `lib/occupancy/` (parse, derive, consolidate,
export + persistencia Dexie) y está cubierta por vitest; los componentes solo montan.

### Cómo se clasifican los datos

- **La unidad de guardado es la sucursal-año**, con clave compuesta `[centerId+year]` en
  IndexedDB: el contador exporta **un Excel por sucursal y por año**, así que ese par es lo que
  se escribe, se fusiona y se borra.
- El archivo **se declara a sí mismo**: bajo el título lleva dos líneas, el **hotel** y el
  **centro de costo** (sucursal). Se leen **por posición**, no por etiqueta. Un archivo sin
  línea de centro cae en la sucursal reservada `principal`, rotulada con el nombre del hotel;
  así un hotel de una sola propiedad no es un caso especial en ningún otro sitio.
- El **hotel activo** se muestra en el header (`ActiveClient`), con el año y la sucursal debajo.
- El espacio de trabajo es de **un hotel**. Subir archivos de otro pide confirmación y
  **reemplaza todo** — mezclar dos empresas en un mismo juego de pestañas no se avisaría solo.

### Carga

- **Varios Excel a la vez**, mezclando sucursales y años; cada uno cae en su propio registro.
- Se **parsea todo antes de escribir nada**: así la verificación de "todos los archivos son del
  mismo hotel" no puede dejar la base a medias. Si los archivos discrepan entre sí, no se
  guarda ninguno; si el archivo falla al leerse, se reporta por su nombre y los demás entran.
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

La pestaña tiene su propia **barra de filtros** — Métrica · Sucursal · Año · Periodo, con **Ver
por** (Mes / Día) a la derecha y la franja de chips activos debajo. Como en PyG, **la comparación
no se declara**: marcar dos sucursales, dos años o dos meses es lo que la produce.

- **La métrica es de selección única.** Ocupación es %, ADR y RevPAR son $, vendidas y PAX son
  conteos; mezclarlas en una tarjeta pediría un segundo eje Y, que el proyecto no permite. Lo que
  se compara son sucursales, años y periodos, siempre en la misma unidad.
- **El periodo se marca en dos niveles: mes y día del mes.** Con «Ver por: Día» y ningún mes
  marcado el eje es el año corrido; marcando marzo, son sus 31 días; marcando además el día 5, el
  eje es **una sola columna**. Marcar acota el eje y nunca multiplica las series, así que
  «Cultura Manor, 2025 y 2026, enero, día 5» son dos barras: el 5 de enero de un año contra el
  del otro. Un día marcado vale para **cada** mes marcado («el 5» de enero y de marzo), y un día
  que el mes no tiene simplemente no aparece. Marcar un día pasa «Ver por» a Día por su cuenta:
  sobre el eje mensual no querría decir nada.
- **Cobertura:** un mes que el espacio nunca recibió no dibuja punto; un día dentro de un mes con
  datos que no vendió nada es un cero real y sí se dibuja.
- **Tarjetas:** cuatro indicadores del alcance marcado (ocupación media, ADR, RevPAR, ingresos),
  la serie principal, el mapa de calor día×mes, los canales de venta y el ritmo por día de la
  semana.
- **La selección se lee en una frase.** Bajo los controles hay una línea «Mostrando Ocupación ·
  5 de enero · 2025 y 2026 · Cultura Manor», y el control de Periodo se rotula con el periodo
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
