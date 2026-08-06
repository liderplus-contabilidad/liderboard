# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`liderboard` — the **LiderPlus** financial dashboard, a web app for an accounting
firm. UI copy is in **Spanish**; code (identifiers, route slugs) is in **English**.
Desktop only — no responsive/mobile layer.

## Commands

Package manager is **pnpm** (pinned via `packageManager`). Node LTS.

| Task                                | Command                               |
| ----------------------------------- | ------------------------------------- |
| Dev server (Turbopack, :3000)       | `pnpm dev`                            |
| Production build (also type-checks) | `pnpm build`                          |
| Serve production build              | `pnpm start`                          |
| Lint                                | `pnpm lint` (or `pnpm exec oxlint .`) |
| Lint + autofix                      | `pnpm lint:fix`                       |
| Format                              | `pnpm fmt`                            |
| Format check (CI gate)              | `pnpm fmt:check`                      |
| Tests (Vitest, pure layer only)     | `pnpm test`                           |

**Vitest** is configured but runs ONLY the pure layer (`lib/**/*.test.ts`, e.g.
`lib/profit-loss/`, `lib/charts/`); there are no component/jsdom tests.

CI (`.github/workflows/ci.yml`) runs four independent jobs on PRs and pushes to
`main`: `pnpm lint`, `pnpm fmt:check`, `pnpm build`, `pnpm test`. A husky pre-commit
hook runs `lint-staged` (oxlint --fix + oxfmt on staged files).

## Toolchain gotchas

- **Linting/formatting is oxc, not ESLint/Prettier.** `pnpm lint` runs `oxlint`;
  `pnpm fmt` runs `oxfmt`. Running `eslint`/`prettier` directly will fail — they
  are not installed. oxlint config is `.oxlintrc.json` (only the `correctness`
  category is set to error).
- oxlint enforces `next/no-assign-module-variable`: never name a local `module`
  (use `mod`).
- **Tailwind CSS v4, CSS-first.** There is no `tailwind.config.js`. Theme lives in
  `app/globals.css` via `@import "tailwindcss"` + an `@theme { … }` block.
- **ECharts measures text on a canvas**, where a CSS variable cannot resolve — so a font stack
  written as `var(--font-ibm-plex-sans)` is silently measured against a narrower fallback and
  every width-capped axis label truncates to a box that renders wider than its own cap (labels
  clipped at the _start_). `components/ui/chart.tsx` reads the generated family off `:root` and
  substitutes it before `setOption`; keep any new text sizing on that path.
- TypeScript is `strict`; import alias `@/*` maps to the repo root (e.g.
  `@/lib/modules`).
- Vitest covers only the pure layer under `lib/` (parse/derive/persistence, the analytics
  engine, the palette and the chart-option builders) — no jsdom/component tests; config in
  `vitest.config.ts`.

## Code conventions

- **Prefer reusable functions.** Extract anything general-purpose (formatters, constants,
  pure utils) into `lib/` and import via `@/*` — don't re-implement the same logic across
  components. Amounts format through `lib/format.ts` (`formatCurrency` = Ecuador USD `$`),
  month labels via `lib/date.ts`. Only helpers tied to one module's domain stay in that
  module.
- **Reuse primitives + tokens first.** Reach for `components/ui/*` and the `@theme`
  color/font tokens before writing ad-hoc markup or hardcoding hex.
- **Prop-driven components.** Pass data in so a component fills from real data later, and
  render a sensible empty state when it's absent (Excel-sourced views do this today).
- **Small client boundary.** Server Components by default; add `"use client"` only where
  local state/interactivity needs it.
- **Optimize for performance by default.** Keep renders cheap: `React.memo` list/row
  components with stable keys and callbacks (`useCallback`), wrap expensive derivations in
  `useMemo`, and lean on CSS (`content-visibility`) over JS where it fits. Reach for
  heavier tooling (e.g. row virtualization) only when data volumes justify it — don't add
  it speculatively.
- **Match the surrounding code.** Follow existing naming, style, and comment density;
  comments explain the _why_. UI copy in Spanish, identifiers/slugs in English.

## Architecture

Next.js **App Router**. Server Components by default — keep the client boundary
small; only files that need `usePathname`/local state are marked `"use client"`.

**Shell + routing.** `app/page.tsx` redirects `/` to the default module.
`app/(dashboard)/` is a route group whose `layout.tsx` renders the persistent
shell (`<DashboardSidebar/>` + `<DashboardHeader/>` + `<main>`). Because App Router
layouts persist across navigation, the sidebar's collapse state (local `useState`)
survives switching modules without any global store or localStorage. Each module is
a static page at `app/(dashboard)/<slug>/page.tsx`.

**Module registry is the single source of truth.** `lib/modules.ts` exports the
ordered `MODULES` array (`{ slug, label, title, icon, tabs }`) plus `DEFAULT_MODULE`
and `findModuleBySlug()`. Both the sidebar nav and the header breadcrumb/title derive
from it — there is no duplicated module list. **To add a module:** add an entry to
`MODULES` and create the matching `app/(dashboard)/<slug>/page.tsx`. Route slugs are
English; the Spanish name goes in `label`/`title`.

**Components.** Reusable primitives live in `components/ui/` — prefer them over ad-hoc
markup. Module-specific compositions live in `components/<module>/` (`components/profit-loss/`,
`components/occupancy/`). `ModuleTabs` holds a `MODULE_VIEWS` registry of per-module
`rightSlot`/`toolbar`/`panel`; a module absent from it renders `ComingSoon`, so adding one is
purely additive; `ModuleTabs` also owns the `rightSlot`'s vertical alignment, so the same
component works outside the bar. **Excel actions are one component for the whole app**:
`components/ui/excel-actions.tsx` renders `Cargar Excel` · `Descargar Excel` · optional `ⓘ`, and
a module only writes a thin wrapper (`<module>-excel-actions.tsx`) that wires its provider and
upload modal — never its own button markup. The FORM of the download control is derived from how
many options it gets (one → plain button, two or more → menu), never declared; `busy`, the error
panel and the reentrancy guard live in the primitive, so a module supplies just
`run: () => Promise<void>` plus `disabled`/`disabledReason`. Live gallery at
`/docs/components#excel-actions`. `ExcelActions` renders the UPLOAD button's `disabledReason` as a
pill beside it rather than as a tooltip — a control switched off with no visible reason makes you
point at it to find out what is missing, and what is missing here is the module's previous step.
**Module state never lives there** — each data provider is mounted in the
dashboard layout, because the header reads from the same state the panel does (`ActiveClient`
shows PyG's cliente and Ocupaciones' hotel).

**PyG holds several CLIENTES at once.** A client is a name the user chose plus exactly one estado
de resultados — flat list, no nesting. It is created EXPLICITLY (`+ Agregar cliente`), is born
empty, and no upload ever invents one on its own. Its label and the razón social of a file are
different things and NEVER compared: the user calls «Manor Galápagos» what the file calls
`DARWIN & WOLF…`. An empty client has no identity; its FIRST upload **adopts** `(sistema, empresa,
modo)`, so a first load can never clash. `lib/profit-loss/clients.ts` is the pure layer (name
validation and its 60-char cap, uniqueness ignoring case and accents via `normalizeLabel`,
alphabetical order — there is no `order` column, renaming reorders —, `matchesSearch` for the
selector's search box, `proposeClientName` for the clash dialog's editable suggestion, and
`findClientForIdentity`, which is what lets a clash say «este archivo sí es de Dingoo»).
**Storage is partitioned by `clientId`** (Dexie v7: table `clients`, `datasets.clientId`, `meta`
keyed by client instead of the singleton row `"workspace"`, and a one-row `active` table so the
open client survives a reload). `edits` keeps hanging off `datasetId`, unique across clients, so an
edit cannot reach the wrong client even with a bug — what it gains is CASCADE on delete. The
migration is purely ADDITIVE (Dexie has no downgrade): nothing is deleted, the workspace becomes
the first client named after its `companyName` (or `Cliente 1`), and a database that never loaded
anything gets NO client. **`db.ts` is the only door to the tables** — that is not tidiness, it is
the mitigation of this design's one real risk: with several clients sharing four tables, an
unbounded query mixes two companies in silence and nothing downstream can tell. `ParsedDataset`
(`types.ts`) is `PygDataset` minus `clientId`: the pure layer produces datasets that belong to
nobody yet, and `db.ts` STAMPS the owner at the door, because which client a file belongs to is
decided by which client is open, never by the file. A discrepant identity therefore no longer
replaces «the workspace»: it opens a dialog with THREE exits whose shape depends on whether
another client already holds that identity (`describeIdentityChange` returns both forms) — load it
there (nothing is destroyed), create the client it belongs to, or replace only the ACTIVE client,
which keeps the comments of accounts the new file also brings and discards the value adjustments.
The selector lives in the header and `ActiveClient` stays **prop-driven**: with no `clients` prop it
renders the read-only block it always was, which is why Ocupaciones is untouched by all of this.

**El CONSOLIDADO ENTRE CLIENTES es la tercera vez que el módulo escribe la misma figura** (centros de
costo, sucursales, y ahora clientes): una entrada sintética fija arriba del selector —`ClientOption.
readOnly`, sin menú `⋯`, separada por una línea— que suma TODOS los clientes con datos. Se ofrece con
dos o más; con uno, el «consolidado» sería ese cliente con otro nombre. `lib/profit-loss/
consolidate.ts` es la capa pura (espejo de `lib/occupancy/consolidate.ts`) y es pequeña porque el
motor ya existía: suma **una sola vez**, con todos los centros de todos los clientes aplanados en una
llamada a `mergeCenters` —la suma es asociativa, así que sumar dentro de cada cliente y luego entre
clientes da lo mismo, y no aparece una segunda definición de «sumar» que pueda divergir de la
primera—. Los planes de cuentas se UNEN, no se fusionan: `4.1.01.01.01` de Dingoo y `4.1.1.1.1` de
MicroPlus quedan como ramas hermanas y la raíz `4` cuadra igual. `mergeCenters` gana un `unit`
(`"centro"` por defecto) porque su aviso de conflicto estructural ahora tiene que poder decir
«cliente». **Y planes de distinta PROFUNDIDAD ya no pierden plata**: un código puede ser HOJA en un
cliente —donde alguien escribió el monto directo— y PADRE en otro que lo desglosa, y como todo
consumidor recalcula un padre desde sus hijas (`computeRollups`), ese monto se descartaba en silencio
y el consolidado salía por debajo (500 en `4.1` más 300 repartidos en `4.1.01` daban 300, no 800).
Ahora se cuelga de una subcuenta sintética `4.1.0` «Sin desglosar» —la única forma de que a la vez
SUME y se VEA de dónde viene—, esquivando el sufijo si el plan ya ocupa ese código, y el aviso dice
dónde quedó en vez de decir que se trató como padre. El arreglo vive en `mergeCenters`, así que cubre
también al Consolidado de centros, donde el mismo agujero existía y casi nunca se disparaba porque el
plan es compartido. La cobertura es la UNIÓN y los huecos se dicen **por tramos** —«Abr–Jun 2026: 3 de 5
clientes con datos (faltan Manor y Ambato)»—, nunca uno por mes ni por cuenta: sin ese aviso una suma
parcial es indistinguible de una caída real del negocio. Un cliente cuya `baseFrequency` no sea la de
la mayoría queda fuera, nombrado. **Es DERIVADO y nunca se guarda** —una copia quedaría obsoleta al
siguiente ajuste de cualquier cliente—, así que llega como un estado único de solo lectura y Datos,
Gráficos, Análisis y la ficha no cambian ni una línea. `CONSOLIDATED_CLIENT_ID` vive en la capa pura
porque es a la vez lo que `db.ts` guarda en `active` (lo que le da sobrevivir al reload) y lo que el
selector marca; `consolidatedContributions()` es la ÚNICA lectura de `db.ts` sin `clientId` —que
exista no contradice la partición, la confirma: mezclar dos empresas en silencio es el riesgo, y aquí
mezclarlas es el encargo, por eso tiene nombre propio y devuelve cada cliente por separado—, y
`assertRealClient` rechaza toda escritura contra el centinela, porque una carga que aterrizara ahí
crearía una partición fantasma que ninguna pantalla lista y ningún borrado alcanza. La descarga
existe pero **sin la hoja de metadatos oculta** (`buildConsolidatedWorkbook`), para que el archivo no
pueda re-entrar a un cliente real y reemplazarlo por cuentas que no son suyas. **Qué clientes entran
se elige en la barra**, no en un control propio: `client-filter.tsx` es el primer desplegable y no se
rinde fuera del consolidado, igual que `center-filter.tsx` no se rinde en modo estado único.
`PygFilters` gana `clientIds` con las mismas reglas que el resto —ninguno marcado es TODOS, orden del
universo, podado en lectura contra `consolidatableIds`—, y `selectContributions` aplica la selección
ANTES de sumar, así que los avisos de cobertura se recalculan sobre los que quedaron dentro. Marcar
UNO es legítimo y da ese cliente: la regla de «hacen falta dos» decide si el consolidado se OFRECE
(`canConsolidate`), no qué puede mirar quien ya entró — vaciarlo al desmarcar el penúltimo sería un
callejón sin salida.

PyG › Datos loads real Excel data: `lib/profit-loss/` holds
the pure parse/derive/export layer plus Dexie (IndexedDB) persistence, and
`PygDataProvider` — mounted in the dashboard layout — shares `clients`/`dataset`/`edits`/
`frequency` between the header (`PygClientActions`) and the Datos content. `DatosView`
renders the Estado de Resultados table (account tree, sortable months + Total, cell
edit/comment); editing/commenting is monthly-view-only. The Datos toolbar downloads
the edited state or a seeded blank template via `exceljs` (`export.ts`, dynamic
import); the "con tus datos" file re-uploads cleanly and restores its comments from a
hidden metadata sheet. Only leaf (movement) accounts
edit their value; parent accounts comment-only. **Cost centers load monthly and incrementally:**
one file = one month = every center at once (`GENERAL` + a column per center + `SIN CENTRO DE
COSTO`, the same grid the accounting system always exports); uploading June writes column 5 of
every center and leaves every other month untouched. The file carries no date, so the filename
declares the period — `PyG-YYYY-MM[-libre].(xlsx|xls)` — and is validated as such.
`lib/profit-loss/upload/` is a strategy registry (`registry.ts`, first-match-wins over an
ordered list) that replaces a format `if`: `monthly-centers.ts`, `monthly-single.ts` (the
single-mode counterpart — unlike centers, its file DOES declare its own period, a
`Desde el … hasta el …` line read by `date-range.ts`; a range that isn't exactly one calendar
month is rejected naming why, and the filename plays no part), `microplus.ts` and `dingoo.ts` (a
SECOND and a THIRD accounting system, both single-mode only) and `app-workbook.ts` (reads the
app's own downloads back, either mode) each own their sheet shape, account-code convention and
sign rule; `grid.ts` holds only the convention-free reading utilities. **MicroPlus is the proof
the registry is a real extension point**: it exercises all six of those without touching the
core. Its preamble is spread across arbitrary cells, so `microplus-grid.ts` locates EVERYTHING by
the labels the report writes (`CODIGO`+`NOMBRE DE LA CUENTA`, `Desde:`/`Hasta:` in separate
cells, `RESULTADO:`) and never by coordinates; a value is the ONE non-empty cell right of the
name (the column encodes depth, `SALDO` labels a column only level 3 uses); the trailing dot of
a parent code is stripped and kept only as a cross-check against the derived tree (an aviso when
they disagree, the tree wins); numbers arrive as text with thousands separators; and the expense
branch (root `5`) is NEGATED at import, because MicroPlus stores expenses negative and adds
while the app stores them positive and subtracts. **Dingoo is the mirror of MicroPlus**, and that
is what makes it worth reading: its `dingoo-grid.ts` also locates everything by label, but `Saldo`
here really IS the value column (every level values in it, so an empty cell is a ZERO and nothing
goes hunting), codes carry two-digit segments kept VERBATIM (`5.02.01.01.01` — the leading zeros
are what the accountant checks against their own file), and the negated branch is `4`, not `5`,
because Dingoo stores INCOME negative. Two systems negating opposite branches over an untouched
`derive.ts` is the sign convention proving it belongs to the strategy. Its period is a one-line
`Desde el … al …` (`al`, not the `hasta el` of `monthly-single`, whose pattern is deliberately NOT
relaxed), and its company is read skipping the report's own titles (`REPORTE`, `ESTADO DE
RESULTADOS`) — otherwise «first non-empty line» hands back `REPORTE`. **Both detects require their
own range declaration**, not just the header: `Código`+`Nombre de la cuenta` normalizes to exactly
MicroPlus's `CODIGO`+`NOMBRE DE LA CUENTA`, so the header alone made MicroPlus claim Dingoo's
files. Order is not what separates them; each `detect` is. The exact-calendar-month rule
(`date-range.ts`'s `toCalendarMonth`) is shared verbatim — no per-vendor exception. `merge-month.ts` is the pure merge — new center/account →
zero-filled everywhere but the arriving month, and cuadre against `GENERAL` (one aviso per month,
never per account). **A dataset is a center-YEAR**, so several years live in one workspace;
`WorkspaceMeta.loadedMonthsByYear` is the declared coverage, keyed by year because coverage lives
on the same axis as the data (loading January of 2026 must not mark January of 2025 as covered).
A month never loaded reads `null` through the whole engine (`buildAnalyticsSource`'s
`coveredIndices` param), never the same as a loaded month valued at 0. Edits survive every reload (`applyMonthSlice`
never touches `edits`); an adjusted cell gets a dotted `brand` underline in Datos, and reloading
a month whose file value changed under an adjustment surfaces as a conflict in the upload
summary, removable from there. `Sin centro de costo` is an ordinary editable monthly center now
(just its own selector color/position), so the Consolidado equals `GENERAL` by construction.
Downloads: "Excel completo" (`buildMultiCenterWorkbook`, one sheet per center + Consolidado,
round-trips through `app-workbook.ts`) and "un mes en crudo" (`buildMonthSliceWorkbook`, re-enters
through `monthly-centers.ts`); no blank template in either mode. **Estado único loads monthly and
incrementally too**: `monthly-single.ts` reduces every upload to the same `month-slice` shape
(`mode: "single"`, one nameless `centerId: null` slice, no `general`), so it reuses
`merge-month.ts`/`loadedMonthsByYear` unmodified — a single-mode dataset's `baseFrequency` is
therefore always `"mensual"`, unlocking trimestral/semestral/anual there too. **Workspace identity
is `(sistema, empresa, modo)`** (`workspace-identity.ts`, derived by `deriveWorkspaceIdentity` from
the datasets + `meta`, never stored — which is what makes «un cliente vacío no tiene identidad»
free): a file whose system, company or mode contradicts the **ACTIVE CLIENT's** opens the clash
dialog described above, and whatever it replaces, it replaces only there. **The YEAR is
deliberately NOT in it**: it was, back when a `PygDataset` held one `number[12]` and a second year
had nowhere to go; now a file from another year is not a contradiction but more of the same
workspace, and it merges in without asking — which is also why a batch may mix years (it may not
repeat a `(year, month)`). The SYSTEM is the id of the originating strategy
(`upload/systems.ts`), stored in `WorkspaceMeta.sourceSystemId` and carried through the app's own
workbook metadata, because two systems' charts of accounts (`4.1.01.01.01` vs `4.1.1.1.1`) would
fuse into one meaningless tree and nothing else would catch it when company matches. `systemLabel`
lives next to those ids for the same reason they do — naming a system on screen must not drag in
SheetJS — and it is the ONE way a system reaches copy: the `id` is not UI text.
Estado único's downloads mirror centers: "Excel con tus datos"
(`buildPygWorkbook`, carries every year, its coverage and the adjustment originals in the same
hidden metadata sheet `app-workbook.ts` reads, and **re-enters merging BY YEAR** — a year the file
doesn't carry stays untouched) and "un mes en crudo" (`buildSingleMonthSliceWorkbook`, re-enters
through `monthly-single.ts`) — but **"un mes en crudo" only appears when the originating strategy
declares `writesOwnFormat`**; MicroPlus is read-only, so its workspace shows one plain button.
**Análisis vertical:** the first card of Análisis is a TABLE (accounts × periods, each cell the
share of a base account the reader picks), so it does not use `ChartCard` — that component only
shows its table twin alongside an `option` with series. `lib/profit-loss/charts/vertical.ts`
(pure + tested) builds it straight off the `AnalyticsSource`, because a `SeriesQuery` would cap
it at the palette's eight slots and this draws the whole tree. Rows need NOT descend from the
base — a gasto over Ingresos is the ordinary case. `toPctOfAccount` in `analytics/structure.ts`
is the module's one definition of "percentage over an account"; `toPctOfRevenue` is its
`baseCode: "4"` case. «Total año» is `Σ cuenta ÷ Σ base`, never the average of the column
percentages, and a base that is `null` or `0` empties the column with one warning naming the
period — never one warning per account.

**«Ocultar cuentas en cero» es el tercer criterio de qué filas se ven**, junto al enfoque por cuenta
y la profundidad por nivel, y vive donde los otros dos: `lib/profit-loss/filter.ts` (puro + testeado).
Una fila no tiene movimiento cuando toda celda juzgada vale 0 o `null` **y** no carga comentario ni
ajuste — las dos anotaciones pesan tanto como la cifra, porque un ajuste puede PRODUCIR el cero
(500 → 0) y un comentario en una cuenta parada es la nota que dice por qué lo está; sin esa excepción
la descarga perdería el ajuste con su valor original y la hoja de metadatos apuntaría a una fila
ausente. Se juzga la RAMA, no la fila: un padre que cuadra en 0 porque dos hijas se cancelan se queda,
y las filas de resultado nunca se ocultan. Y lo que sostiene esa excepción es que **lo guardado sea
verdad**: `storedAdjustment` (en `derive.ts`, aplicado en el punto de ESCRITURA y también al gemelo
de una reclasificación) descarta un valor que coincide con el del archivo, así que teclear una cifra
y volver a la original no deja ajuste ninguno. Sin esa regla la app afirmaba un ajuste inexistente y
lo arrastraba a los cuatro lectores a la vez — la celda pintada, la nota «Valor original: $0 → $0»
del Excel, el conflicto al recargar el mes y esta poda. El interruptor está en la cabecera de la tarjeta de Datos
—no en la barra— porque lo lee una sola tarjeta, la misma regla que el «Ver por» de Ocupaciones y el
«Base» de Análisis; no es un `PygFilters`, no produce chip y Gráficos y Análisis dibujan lo mismo
encendido o apagado. **Y hay una regla gemela para las COLUMNAS** (`movingColumnPositions`), bajo el mismo
`hasMovement`: un periodo en el que no se movió nada se va igual que una cuenta. Filas y columnas se
juzgan contra la MISMA tabla —las filas sobre las columnas que deja «Periodo», las columnas sobre las
filas que deja «Cuenta»—, nunca una después de la otra: eso quita la circularidad y regala el
invariante que importa, que la celda que salva a una fila salva también a su columna, así que ninguna
fila queda viva con su única cifra escondida. La columna de Total no necesita caso propio (un año con
un solo mes movido totaliza a ese mes y sobrevive) y ocultar un mes vacío **no** descuadra el Total,
porque un mes vacío suma cero — por eso esto no activa el rótulo «Total año» que sí pone el filtro
«Periodo». En pantalla juzga las columnas VISIBLES (lo que se ve es lo que se juzga), el pie cuenta lo
que quitó de las dos clases, y un orden por una columna que se esconde se anula mientras lo esté y
vuelve al mostrarla. **En el Excel las filas se OMITEN, y el criterio es POR LIBRO**: un código
—y un MES— sale solo si no se mueve en NINGUNA hoja, así las doce hojas de un «Excel completo» siguen
compartiendo un plan de cuentas y las mismas columnas, y se pueden leer en paralelo. Quitar meses del
libro es seguro porque `app-workbook.ts` los lee POR RÓTULO de cabecera y no por posición, y la
cobertura viaja aparte en la hoja de metadatos: un mes cargado que no vendió nada vuelve como cargado
y en cero, no como nunca cargado. `writeStatementSheet` recibe el grid ya
construido justamente para eso — el conjunto a omitir (`emptyAccountCodes`) se calcula sobre todas las
hojas antes de escribir ninguna. La descarga sigue al interruptor y lo DICE en la descripción de cada
opción; «un mes en crudo» no entra, porque existe para parecerse al export del sistema contable, donde
una cuenta en cero es parte de la rejilla.

**El INFORME imprimible saca TODO lo disponible, y la hoja donde cabe se DERIVA.** La sección «Estado
de resultados» ya no imprime un acumulado del centro que resolvió la barra: imprime una tabla por
cada vista del selector —el Consolidado primero, detrás cada centro y «Sin centro de costo»— con las
columnas que Datos tiene en pantalla (las que deja el filtro «Periodo», con el Total de cada año,
etiquetadas por el mismo `columnHeaderLabel` que la tabla — por eso subió a `datos-columns.ts` junto
a `visibleColumnPositions` y `sliceColumns`). Es el equivalente en papel del «Excel completo», y
recorre las MISMAS `views` del proveedor en vez de reconstruir quién existe, porque una segunda
definición de «los centros» se separaría de la primera en cuanto alguien cargara uno nuevo. **No hay
control que elegir**: la firma pide el detalle completo, y `accumulate.ts` sobrevive solo porque el
análisis vertical aún lo necesita. **Una tabla es un centro-AÑO**, y eso es lo que hace que quepa: un
centro con dos años son 26 columnas que no entran ni apaisadas, y año por año son 13, que es justo lo
que entra — no es una concesión al papel, un estado de resultados ES de un ejercicio, y el eje de
Datos ya lleva el año en cada columna. El orden es año por fuera (ascendente, como Datos) y centro
por dentro; el rótulo nombra el año solo cuando hay varios, porque con uno la portada ya lo declara.
Cada tabla abre página —dos estados encadenados en la misma hoja se leen como uno solo con las
cuentas repetidas—, todas comparten UN `fit` dimensionado por la que más columnas tenga, y el aviso
del corte de nivel sale una sola vez, bajo la última. La poda de cuentas sin movimiento es POR TABLA
—al revés que en el Excel, donde el criterio es por libro para que las hojas se lean en paralelo—,
porque aquí cada tabla se lee sola en su página; y `pruneEmptyColumns` hace lo mismo con los
periodos, que en papel es lo que más pesa: como `fit` se dimensiona por el mayor número de columnas,
quitar los meses vacíos es lo que puede devolver la sección de apaisada a vertical. NO se imprimen `Var.` ni `% Ing.`: una variación
entre dos meses no es lo que esa cabecera significa, y son las dos columnas que estorban cuando ya
hay trece — quitar `% Ing.` es también lo que devuelve la sección «Análisis vertical» a existir
siempre, ya que se omitía justamente por repetirla. Lo que NO hereda de Datos es el ORDEN (un estado
impreso se lee en orden de plan) ni el árbol replegado (el corte lo pone «Detalle», que es del
informe y no puede replegarle nada a nadie en pantalla). `report/page-fit.ts` (puro + testeado) es la
única regla de si cabe: prueba vertical y luego apaisado, bajando la tipografía 10.5 → 9.5 → 8.5 px, y
mide por COTA —diez caracteres de mono, que cubren `-$1,171,420`— porque medir el texto real exigiría
un canvas y no se podría testear. Hasta seis columnas queda en el cuerpo vertical; de ocho a trece
**la sección se lleva su propia hoja apaisada** y el resto del informe sigue vertical. Esa hoja es un
`<article>` HERMANO con su ancho real (1123 px) y una `@page` con nombre: hubo páginas apaisadas antes
y se quitaron porque vivían DENTRO del cuerpo vertical y tenían que desbordarlo con un margen
negativo, que en pantalla se lee como una tabla escapándose de la hoja.

**Account ficha:** each account row exposes a hover "ficha" trigger (own column, `sticky
right-0` so it survives horizontal scroll) that opens `AccountDetailPanel` in a `SidePanel`.
The panel runs ONE analytics query for the account and formats `buildAccountDetail`
(`lib/profit-loss/charts/account-detail.ts`, pure + tested): total, active-vs-covered periods,
average of active periods, best period, share of parent, last-period variation, plan level. It
inherits the engine's coverage (a `null` never counts as `0`), follows the active frequency (no
chart in Anual), reuses `barOption`+`ChartCard`, and skips only the derived «Utilidad» row.

**Segmentar gastos** splits the statement into operating and non-operating. A button under the
Datos card (`segment-actions.tsx`) copies the **5.2** subtree as root **6**, re-levelling the code
(`5.2.1.1 → 6.1.1`), keeping each account's name and zeroing every value, across EVERY dataset in
one transaction (`segmentWorkspace` in `db.ts`; the Consolidado re-sums itself). It is ONE-WAY, so
the control disappears once there is nothing left to segment instead of sitting disabled — and the
presence of root 6 IS the flag, so there is no dataset field to migrate. `lib/profit-loss/
segment.ts` (pure + tested) owns the rules: the 5.2→6 mapping, `twinCode` (6.1.1 ↔ 5.2.1.1) and
`twinWriteFor`, which is what makes the pair hold — writing a non-operating amount ALSO writes its
twin inside 5.2, discounted **by difference** against what the twin holds right now, so a manual
correction on 5.2 survives and re-typing a cell moves only the delta. Section 5 keeps behaving
exactly as before (still editable); nothing clamps, so over-classifying leaves the twin negative.
`computeResult` now returns the split (`operating`/`nonOperating`/`expenses`/`values`) and
`toDatosGrid` emits ONE «Utilidad o Pérdida» row unsegmented, four summaries segmented — each
`anchorCode`d to the block it closes, an anchor `flattenSorted` honors only while unsorted (a
month sort reorders the roots, so every summary falls to the end). The shape mirrors the
accountant's own consolidated workbook: `operating` = Σ4 − Σ5, `nonOperatingTotal` = **Σ6 positive
— a TOTAL of expenses, not a "utilidad"**, which is why it is never negated, and the exercise is
operating MINUS it (verified against their file: 9.357,33 − 13.395,59 = −4.038,26). Because 6 takes
what 5 gives up, **the exercise's result never moves** — only the split does. In the table an
adjusted cell is PAINTED (not underlined) so a reclassification is visible in the section above,
where it happens out of view; a brief ring marks the one cell that just moved. `rootSign` in
`derive.ts` is the
ONE sign definition (4 adds, 5 and 6 subtract) and `analytics/series.ts` re-exports it, so the
cascade follows; `expenseRootsOf` in `charts/presets.ts` reads the expense roots off the SOURCE so
the tiles and the ranking don't shrink by whatever was reclassified.

**Ocupaciones (hotel occupancy).** `lib/occupancy/` is the pure layer — `parse.ts` reads the
`OCUPACION_*.xlsx` exports (month blocks stacked on one sheet), `derive.ts` builds the daily
grid, `export.ts` writes a file that re-imports cleanly, `db.ts` persists in Dexie. **A record
is one HOTEL-SUCURSAL-YEAR**, keyed `[hotelId+centerId+year]`: the accountant exports one workbook
per sucursal per year, and the file declares its own hotel and cost center on two lines under the
title (read BY POSITION; a file with no cost-center line falls into the reserved `principal`).
A record stores ONLY raw inputs — ADR, ocupación, RevPAR, PAX and every total are recomputed,
and an imported month is shown VERBATIM until its first edit, which flips the whole month to
computed at once. `consolidate.ts` sums the sucursales of a year into a synthetic read-only
dataset: **raw inputs only**, so `derive.ts` recomputes the indicators as ratios of sums (the
one definition under which ADR × Ocupación = RevPAR survives the sum); it is never stored and
never shown verbatim. Uploads go through `occupancy-upload-modal.tsx`, a staging modal shaped like
PyG's: it parses each file as it is dropped, lists the sucursal-año it declares (or why it
failed), and hands the provider an already-parsed selection (`importParsed`) — so the provider
keeps the rules and the modal owns reading files. `addFiles` materializes the `FileList` BEFORE
its first `await`, because clearing `input.value` empties the live list. Uploads are still
two-phase — every file is parsed before anything is written, so the "all files from one hotel"
check cannot half-apply; it is enforced in the modal (which can still explain itself) and kept in
the provider, which is what writes — `planImport` decides WHERE a load lands before anything is
written, and the modal renders the clash dialog described below, since that is where the files are
still removable. Datos stacks three strips, **Sucursal → Año → Mes**; the sucursal strip
renders nothing with a single sucursal, and the Consolidado tab appears only with two or more.
The MES strip ends in an **«Año»** button: `toAnnualGrid` returns the same `OccupancyGrid` with
one column per month instead of per day (the type speaks in `columns`/`columnLabels`/`scope`,
never in days), always computed and always read-only — a month's cell is an aggregate of days,
and «Habitaciones disponibles» sums habitaciones-noche there because that is what the occupancy
of each month divides by. Both axes compose: the year of a sucursal, or the year of the
Consolidado.

**Ocupaciones holds several HOTELES at once**, the same shape PyG's clientes introduced and for the
same reason: the firm keeps the occupancy of several hotels, and a single space meant one browser per
hotel or losing what was loaded. A hotel is a name the user chose plus what the space always held —
sucursales × years, with their Consolidado. It is created EXPLICITLY (`+ Agregar hotel`), is born
empty, and no upload ever invents one on its own. **Its label is NOT its identity**: the user calls
«Manor Galápagos» what the workbook declares as `CULTURA MANOR`, so the name is never compared
against a file — what is compared is the identity a hotel ADOPTED on its first upload, which
`hotel-identity.ts` DERIVES from what it holds (`deriveHotelIdentity`) instead of storing, and that
is what makes «un hotel vacío no tiene identidad» free. PyG's identity is `(sistema, empresa, modo)`;
here it is ONE field, the declared hotel name, because there is a single parser and the sucursal is
data inside the hotel rather than a mode of holding it. A file that contradicts the ACTIVE hotel no
longer replaces the base: `describeHotelChange` returns a dialog with THREE exits whose shape depends
on whether another hotel already holds that identity — load it there (nothing is destroyed, only the
active hotel moves), create the hotel it belongs to with an editable proposed name, or —demoted to
secondary— replace only the OPEN hotel. **The generic half of a name lives in `lib/workspaces.ts`**
and is shared with PyG (`clients.ts` re-exports it under its own names, so no PyG call changed):
validation and the 60-char cap, uniqueness ignoring case and accents, alphabetical order,
`matchesSearch` and `proposeEntityName`. The two LISTS stay separate — an Ocupaciones hotel and a PyG
cliente are not the same row and share no database. `ActiveClient` takes `labels` so the same header
control says «hotel» here and «cliente» there. **Storage is partitioned by `hotelId`** (Dexie v4
creates `centerYears` keyed `[hotelId+centerId+year]` while `datasets` is still readable and v5 drops
it — the same dance as v2 —, `hotels` absorbs what the singleton `meta` row held, since which
sucursal and year are open belongs to the hotel and not to the space, and a one-row `active` table
keeps the open hotel across reloads). The migration is purely ADDITIVE: the current space becomes the
first hotel named after its `hotelName` (or «Hotel 1»), and a database that never loaded anything
gets NO hotel. **`db.ts` is the only door to the tables**, and that is the mitigation of this
design's one real risk: with several hotels sharing one table, an unbounded query mixes two companies
in silence and nothing below — not `consolidate.ts`, not the series engine, not the grid — can tell.
`OccupancyDataset` is what the pure layer produces (it belongs to nobody yet) and
`StoredOccupancyDataset` is that plus its `hotelId`, STAMPED at the door, because which hotel a
workbook belongs to is decided by which hotel is open, never by the file. A year typed by hand
carries NO declared name, so it cannot hand its hotel an identity derived from the user's label.

**Ocupaciones › Gráficos** mirrors PyG's shape with its own engine: `lib/occupancy/filters.ts`
holds the marks, `charts/selection.ts` is the ONE translation into an `OccupancyQuery`,
`analytics/series.ts` builds the series and `charts/option.ts` turns them into options. The
métrica is **single-choice** (ocupación is %, ADR is $, PAX is a count — two units in one card
would need the second `yAxis` the types forbid); what compares is the sucursales, años and
periodos marked, exactly as in PyG. «Ver por» switches the axis between months and days; it is
the ONLY control read by a single card (`query.scope` reaches just `analytics/series.ts` — the
KPIs, heatmap, canales and weekday cards aggregate the marked period whatever the axis), so it
sits in that card's own header via `ChartCard`'s `headerSlot` and NOT in the filter bar, where
every control feeds every card. A marked periodo NARROWS that axis rather than adding series — in two levels, months and days of
the month, so «Manor, 2025 y 2026, enero, día 5» is two bars over a single column. A day mark
drops «Ver por» to días by itself, and a comparison narrow enough to fit a few columns is drawn
as grouped bars because a line of one point draws nothing. Coverage carries over: a month the
workspace never received is `null`, a day inside a covered month that sold nothing is `0`.
**Drill-down** has two moves: clicking a month's bar writes `months=[m]` + `scope="dia"` into the
same filter bar (undo = remove the chip), while clicking a heatmap day opens the `SidePanel` and
touches nothing. The heatmap is deliberately NOT an ECharts chart — one grid per marked
sucursal-year, all sharing one scale so a tone means the same thing in both — and it is the only
consumer of the sequential `CHART_HEAT_RAMP`, which is separate from the categorical palette.
`filters.ts` also owns `periodLabel`/`describeSelection`, the plain-Spanish wording of the
selection: the bar carries a «Mostrando …» line and every KPI and card subtitle reads its period
from there, so nothing says «Enero» under a «5 de enero». When the axis collapses to ONE column
the option builder swaps what the axis means — each series becomes a labelled bar and the date
moves to the subtitle, because two bars under a single «5 ene» would read as the same date.
Datos keeps its own three strips: those answer «cuál edito», the bar answers «cuáles comparo»,
and the bar falls back to whatever Datos has open.

**The YEAR is part of the period, not a series.** `DateRef` is a full date, `OccupancyQuery.period` is
either a `rango` (one continuous span, which may cross years) or `dias` (individual dates of any year,
one column each), and a SERIES IS A SUCURSAL — `OccupancySeriesKey` is `{ centerId }`. That is what
lets one span run from marzo de 2025 to abril de 2026 as a single evolution and two dates of different
years sit side by side. The filter bar is therefore two controls: **Sucursal · Periodo**, with the year
inside the date pickers.

**`lib/occupancy/analytics/scope.ts` is the ONE answer to «which days of which months of which years
does the period cover»** — `periodCells` returns `PeriodCell[]` (`{year, monthIndex, days}`) and
`series.ts`, `breakdown.ts` and `heatmap.ts` all work on those cells, never on the period itself. The
months at a span's ends are PARTIAL by construction; a date the month does not hold is dropped rather
than clamped; every day is clipped to the month's real length, so 29 de febrero exists in a leap year
and not in the others. `filters.ts` keeps BOTH payloads (`range` and `dates`) so switching modes loses
nothing, and the gesture picks the mode: moving an edge IS a rango, adding a date IS días.
`sanitizeFilters` resolves `UNRESOLVED_YEAR` (the default span's «el año que haya») against the years
the workspace holds — on read, never in an effect.

**Gráficos reads in TWO sections, each with its own heading, subtitle and controls.** «Reporte del
periodo» opens with FOUR TILES holding the close of the period (Venta en $ · % Ocupación · Tarifa Prom ·
RevPAR, from `reportTotals`, ratio of sums) and then ONE of two readings of the same figures, chosen by
«Ver como»: the FOUR BAR CHARTS (the DEFAULT — one per figure, each with its own scale; the reason there
are four instead of one chart with four series is the second `yAxis` the option types forbid) or the
TABLE (`buildReportTable` transposes the same `OccupancyEvolution`, centered, the period down the rows).
The tab opens on the whole year read MONTH BY MONTH (`emptyFilters`), the only granularity both halves
can show.
Never both: they say the same thing, and the table gives the exact figure while the charts give the
shape. «Ver por» offers **Día only to the charts** — 365 columns a chart thins out by itself, 365 rows
nobody reads — and going back to the table lifts the axis to Mes. The section closes with **Canales de
venta**, which lives HERE and not under the métrica because it is the one card that does not read the
métrica: it counts nights per channel, so it belongs beside the total it breaks down (declared once and
placed per view, so it lines up with whichever reading is on screen). «Análisis por métrica» follows
with the métrica selector: heatmap and weekday rhythm, the two that do read it.

**Each mark takes its own colour from `CHART_PERIOD_PALETTE`** — twelve muted hues by the mark's place on
the axis (`colorForPeriod`, wired through `SeriesOptionContext.colorAt`, honoured only for a single
series), the way `channelOption` already paints a bar per channel. The weekday card takes it too, and the
table's ocupación micro-bar takes the slot of ITS OWN ROW, so a row and its bar recognise each other.
With TWO OR MORE sucursales it is ignored: colour goes back to the sucursal, where it encodes identity.

That set is DECORATIVE and muted on purpose (~18 % toward grey; twelve saturated bars are tiring to read
for minutes). **Never use it for series** — `CHART_PALETTE`'s eight CVD-sequenced slots are for identity.
Its validator result, so nobody re-derives it: lightness band PASS, chroma floor PASS, normal-vision
adjacent floor PASS (worst pair ΔE 16.3 — the check that matters for «que varíe»); adjacent CVD
separation does NOT clear (worst pair ΔE 3.2 protan), because twelve colourblind-separable hues do not
exist. Acceptable only here: the month is written under the bar, so a reader who cannot tell two of them
apart loses nothing.

`CHART_HEAT_RAMP` is a single-hue YELLOW scale (light yellow → ochre), monotonic in lightness, so it
survives greyscale and a 372-cell grid never reads as a rainbow.

`MONTHLY_COLUMNS` (in `charts/option.ts`) declares those four figures ONCE — heading, order and unit —
and the tiles, the table and the panels all read it, so nothing can name or scale the same figure two
ways; every `id` is at once a key of `MonthlyFigures` and an `OccupancyMetricId`, which is what lets one
list drive all three. Tiles and table cells format through `formatMonthlyFigure` (two fixed decimals)
rather than `formatMetric`, which drops the cents past a thousand — right for an axis, wrong for a
figure someone compares against their own spreadsheet.

**Coverage is SALES, not existence.** `monthHasData` now lives in `derive.ts` — it was copied in
`series.ts`, `breakdown.ts`, `heatmap.ts`, `month-tabs.tsx` and `occupancy-datos-view.tsx` — and it
is the ONE definition of a covered month: **ingresos or habitaciones vendidas**, never `fromFile` and
never `available`. A real workbook is the whole year in twelve blocks that the accountant fills as
the months happen, so the months still to come already carry the hotel's capacity, and often room
and channel rows left over from the year it was copied from; reading those as data dragged the Hotel
Ambato's 2026 occupancy from 56 % down to 32 % (8.152 room-nights nobody sold in the denominator).
`toAnnualGrid` consults it too — an uncovered month leaves EVERY cell of its column empty and does
not reach «Total año» — because otherwise Datos and Gráficos put two different year occupancies on
screen; that is why `inputRow` takes `(number | null)[]` and aggregates only the columns that exist.
The trade-off is deliberate and matches what the accountant's own report does: a month the hotel
really was open through and sold NOTHING reads as "not loaded", since nothing in the file tells that
apart from a month not yet filled. It is a statement about the WHOLE month — a day with no sales
inside a month that sold is still a real zero, and the editable daily grid always shows what is
stored. Figures go through `formatAmount` (two fixed decimals, no symbol —
the rule `occupancy-two-decimals` proposes for the rest of the module), and the ocupación cell
carries a micro-bar on a FIXED 0–100 % scale: scaled to the best month, a flat year would paint a
full bar and read as a full hotel.

**PyG's filter bar is the module's only selection surface.** `pyg-toolbar.tsx` renders, in
order, Cuenta contable · Nivel · Centro de costo · Año · Periodo, "Ver por" pinned right, and an
active-filter chip strip (`active-filter-chips.tsx`) below — reflected identically by Datos,
Gráficos and Análisis, with no second place (no "Comparar" box, no Datos-only center pills) to
pick the same things differently. The comparison axis is never declared: marking several
accounts and/or several centers is itself what produces a comparison, so `lib/profit-loss/
filters.ts` holds one flat `PygFilters` (`codes`/`centerIds`/`years`/`periods`), pure toggles kept
in universe order (not click order), `sanitizeFilters` (pruned on read, never in an effect) and
`resolveActiveCenterId`/`canEditActiveCenter` — the center Datos reads and edits is _derived_:
none or several centers marked resolves to the Consolidado (read-only), exactly one resolves to
that center. **«Año» follows the same rule as «Centro de costo»** — exactly one marked is that
year, editable; none or several puts the years side by side, read-only — and a marked `periods`
entry is a `PeriodSlot` (`{frequency, index}`), not a `PeriodRef`: one period mark narrows the
axis of EVERY marked year rather than picking a year's period. `center-filter.tsx` and `period-filter.tsx` render the last two dropdowns;
`center-filter.tsx` renders nothing in single-statement mode. The ONE control outside the bar is
Análisis' «Base» dropdown: it names a card's denominator, not what any tab reads, so it sits in
that card's header (same rule as Ocupaciones' «Ver por»). Both it and the account filter render
the same `account-tree-list.tsx` — one tree, single- or multi-select. Marking accounts also intersects
every structural card's fixed universe (composition, ranking, cascada, Análisis' three defaults)
instead of being ignored by them, and marking periods bounds Datos' visible columns.
`PygDataProvider` owns the filters and never imports from `charts/`.

**Datos speaks in COLUMNS, not months.** `DatosGrid.columns` is a `DatosColumn[]` where each entry
carries its own `year`, its `index` and its `kind` (`"period" | "total"`) — because a grid can show
several years side by side and a header has to say which year a column belongs to ("Ene 25" with
more than one visible, "Ene" with one). **A year's Total is a column like any other**, one per
year, which is what removed the old `showTotal` flag and the `"total"` sort key: a single total
computed over every cell would have added 2025 to 2026. Annual granularity contributes no Total
column, because there the year IS the column.

**Charts.** `lib/profit-loss/analytics/` is the pure engine (series with coverage, the
temporal/structure/variation transforms). Everything above it is also pure and tested:
`lib/charts/` holds the eight-slot palette + mark constants (`colorForEntity` is the only way a
series gets a color) and the `ChartOption` types this app writes — declared locally so `lib/`
never imports the renderer; `lib/profit-loss/charts/` holds `sources.ts` (workspace views →
`AnalyticsSource`, identity taken from the VIEW), `selection.ts` (`PygFilters` → `SeriesQuery`
and → color resolver — no dimension/cross model, the axis is read off which lists are
populated), `option.ts` (one builder per chart type, `Series[]` → option) and `presets.ts` (the
default views, built through the same `toSeriesQuery`/`presetQuery` every card uses, plus
`intersectWithMarked` for the structural ones). Components are mount only:
`components/ui/chart.tsx` is the sole `echarts.init` caller (partial imports from
`echarts/core`, SVG renderer), `PygAnalyticsProvider` (nested inside `PygDataProvider`) now
holds only the presentation half — `transform`/`chartType`/`sources`/`colorOf`/`runQuery` — and
`components/profit-loss/charts/` renders the cards. **If a chart component grows logic worth
testing, that logic belongs in `lib/`.** Two invariants are load-bearing: no chart declares two
`yAxis` (the `ChartOption` type forbids it), and the palette never cycles — queries cap at
`CHART_MAX_SERIES` (8) and the engine reports what it truncated.

**Rol de Pagos.** Un período es cliente + año + mes; su nómina son `PayrollEmployeeLine[]`. Las
cifras del mes (`PayrollEmployeeFigures`) se leen VERBATIM del archivo y nunca se recalculan: el
rol trae más de mil fórmulas y su cuadre es el del contador, y una segunda definición de «aporte
IESS» se separaría de la suya al centavo — ausente no es cero, es que el período aún no recibió su
archivo. Nada derivado se persiste (`PayrollRosterSummary`, los totales del período, el asiento
mismo): una copia guardada aparte quedaría desactualizada y la pantalla diría una cosa y los datos
otra. `sameToTheCentavo` (`lib/payroll/amounts.ts`) es la única definición de «mismo importe» del
módulo, porque el rol llega con ruido de coma flotante (`457.69000000000005`) — con `===` cuatro de
cinco empleados conciliados salían «con diferencia».

**El asiento contable** es UNO solo y consolidado del rol entero, no uno por área — y **el libro del
contador lo escribe DOS VECES**, lo cual solo se ve siguiendo fórmulas, nunca rótulos. La hoja
`ASIENTOS` trae cinco bloques rotulados por área: cuatro leen subtotales de área (dos con los
rótulos cruzados entre sí — «RESTAURANTE» lee la fila 32, que es COCINA) y el quinto sí cubre el rol
entero, porque lee `GENERAL!39`, la fila `SUMAN` (`F39 = F13+F23+F26+F32+F38`). Pero **ese bloque
descuadra por 64.25 y no es el que manda**: `GENERAL!43-71` lleva la versión que el contador
corrigió sobre el mismo molde y **cuadra sola** (`C71 = D71 = 3,889.06`, con su celda de control
`C73 = 0`). La regla en una línea: `ASIENTOS` descuadra, `GENERAL!43-71` cuadra, manda la que
cuadra. Lo que las separa: los aportes IESS fundidos en **una** cuenta `2.1.7.1.9` (`X+AU+Y+AW`),
con las cuatro que reemplaza anuladas a `*0` justo encima; los **décimos al derecho** (`621004` ←
`AS`+`O`, `621005` ← `AT`+`N`, que `ASIENTOS` cruza); cada cuenta leyendo la columna que su rótulo
dice (`Viaticos` ← `R`, no `V`, que pasa a su propia `Bono ND`); y destino para `Z`, `AI` y `AN`
(licencia sin sueldo, tiempo parcial, permiso médico), que en `ASIENTOS` no acreditan a nadie y
descuadrarían el asiento con el primer empleado a tiempo parcial. El rótulo del Excel
(«ADMINISTRACION DEL PERSONAL», que ambas versiones arrastran del molde) **no** llega a la
pantalla: suma el rol entero y copiarlo haría creer que la tabla muestra solo Administración. El
catálogo (`lib/payroll/journal.ts`) declara las 24 cuentas una sola vez; **su clave es el `id`, no
el `code`** — `621001` aparece dos veces (el gasto en el debe, las licencias en el haber) y dos
cuentas no traen código —, y los nombres van VERBATIM con las erratas del contador («Anticpo
Empleados», «Vacaciones Pagar», el código truncado `6` de `Bono ND`) porque son los rótulos con los
que él coteja pantalla contra hoja; la única excepción es la cuenta de licencias, a la que la hoja
no da nombre porque comparte fila con el débito de `621001`. `sourceColumns` anota de qué columnas
de `GENERAL!39` sale cada importe; nadie las lee todavía, es el mapa dejado para cuando se cablee.
El catálogo es la constante y los importes el argumento — `buildJournalEntry(amounts)`, con
`JournalAmounts` tipado contra los `id` del catálogo para que un `id` mal escrito no compile —; hoy
el mapa lo produce `journal-mock.ts`, un archivo que existe para borrarse, y mañana lo producirá el
período; la construcción vive en `period-detail-view.tsx`, que es la costura.

## Design system

Tokens are defined **once** in `app/globals.css`'s `@theme` block and consumed as Tailwind
utilities. README's "Sistema visual" has the full table; the normative rules for writing new
UI are:

- **Token or primitive first, always.** Reach for `components/ui/*` and a `@theme` token before
  writing markup. **Never** hardcode a hex or an inline color; **never** invent a spacing/radius
  scale — reuse what the neighbours use.
- **Palette** (`--color-*`): `brand`/`brand-hover`/`brand-soft` (primary action, active), `canvas`
  (app bg) vs `surface` (cards/tables) vs `surface-header`/`surface-muted`/`surface-sunken`,
  `border`/`border-soft`/`border-faint` (increasingly faint separators), the ink ramp
  `ink`→`ink-soft`→`muted`→`faint`→`faintest`, and `warning` for cuadre notices.
- **El color de una fila de Datos dice de qué BLOQUE del estado es, no cuán honda.** Los tokens
  `--color-section-{income,cost,other}` (+ `-sub` para el nivel 2, + `-hover` de cada uno) pintan la
  raíz 4, la 5 y la 6 con **los rellenos exactos del libro del contador**, muestreados de sus
  capturas: verde oliva `#d7e4bd` la 4, celeste `#b7dee8` la 5, durazno `#fcd5b5` la 6. Solo llega al **nivel 2**; del 3 hacia dentro la tabla
  vuelve a blanco, porque ahí lo que se lee es la cifra. `lib/profit-loss/datos-sections.ts` (puro +
  testeado) es la única regla de qué tono toca, y clasifica con `rootSign`/`isNonOperationalCode`
  —la definición que ya existe de qué raíz suma y cuál resta— en vez de repetirla. El verde NO
  choca con `positive`: en esta tabla un positivo va en tinta normal y solo el negativo se pinta.
  Un fondo ROJO sí está descartado, porque borraría esa lectura. El tono va en el `<tr>` (las `td`
  son transparentes), y la columna fija de la ficha lo repite con `group-hover:` porque es opaca y
  con `hover:` propio se encendería sola. **El INFORME lo imprime igual** —el estado y el análisis
  vertical, no el anexo de centros, cuyas filas son centros y no cuentas—, con un tercer campo
  `print` que es el fondo a secas: una tabla que solo se lee no se enciende al pasar por encima, y
  la previa del informe sigue siendo pantalla. Llega al papel porque `@media print` ya fuerza
  `print-color-adjust: exact`, la misma regla que sostiene las bandas de encabezado.
- **`positive`/`negative` are the SIGN of a value, never a series color.** They never travel
  alone: always with a `▲`/`▼` glyph and the signed value, because color alone is not a reading
  for everyone. `zero` is only the `–` of an empty cell.
- **Type:** IBM Plex Sans (`font-sans`); IBM Plex Mono (`font-mono`) for figures, account codes
  and editable values. **Every number carries `tabular-nums`.** Sizing is fixed px (desktop-only
  density), not `rem`. Micro-labels are `uppercase tracking-[0.5px] font-semibold text-faint`.
- **Shape:** radii `13px` card/table/panel · `9px` toolbar control/button · `rounded-full`
  chip/badge. Control heights are the three `Button` sizes — `toolbar` `34px`, `md` `38px`,
  `sm` `h-8` — so a bar control is `size="toolbar"`, never hand-written markup. Shadows are always
  `rgba(15,23,42,…)`, never pure black. Icons from `lucide-react`.
- **Charts consume `lib/charts/palette.ts` only** — `colorForEntity` is the one way a series gets
  a color, the eight slots never re-order or cycle, and no option builder writes a hex. The
  palette hexes deliberately mirror `@theme` (a canvas can't resolve a CSS var); that mirror is
  the single allowed duplication. Los ocho slots se **saturaron** a pedido de la firma, que los ve
  junto a su propio Excel: subir el croma NO costó separabilidad, la mejoró (peor par adyacente CVD
  ΔE 9.1 → 10.8; visión normal 19.6 → 21.7), porque lo que un daltónico distingue es sobre todo la
  luminosidad. Se midió con el validador de la skill `dataviz`, no a ojo, y los números quedan
  escritos en el archivo para que nadie los re-derive.
- **`CHART_SECTION` es la excepción a «el color de una serie es identidad».** Cuando lo comparado
  son las RAÍCES del estado —«Ingresos contra Costos y Gastos», la apertura de la cascada— el color
  ya no distingue entidades sino que dice de qué BLOQUE habla la serie, y toma el tono que la tabla
  de Datos usa para ese mismo bloque: un verde quiere decir «ingresos» en las dos pantallas.
  `codeColorResolver` lo aplica **solo si todos los códigos comparados son raíces**; «Composición de
  los ingresos» compara `4.1.01` contra `4.1.02` y vuelve a las ranuras, porque pintarlas del mismo
  verde las volvería indistinguibles. Son los tonos de `--color-section-*` un paso más hondos: allí
  son fondos bajo texto oscuro, aquí rellenos que deben caer en la banda L 0.43–0.77. Usar los del
  Excel tal cual NO es opción y está medido: dan 1,3:1 contra el papel —barras invisibles— y ΔE 7,4
  entre el verde y el celeste, por debajo del piso de visión normal. Lo que se conserva es el TONO;
  la luminosidad es otro trabajo. Medido: CVD ΔE 18.1, visión normal ΔE 19.5.

**Reusable side panel.** `components/ui/side-panel.tsx` is a right-anchored, non-modal drawer
(no scrim, Escape/outside-click to close, focus in on open and back to the opener on close). It's
what the PyG account ficha mounts on; reuse it for any future lateral detail view rather than
building another.

## Design source

The UI was translated from a Claude Design file, "Dashboard LiderPlus.dc.html"
(claude.ai/design project `1fed77ae-29ff-439e-a0d1-f01e3b3abe5e`).

**Specs live in OpenSpec, not `docs/`.** Every non-trivial change is specified in `openspec/`
before code: `openspec/changes/<name>/` holds the in-flight proposal/design/specs/tasks, and
`openspec/specs/<capability>/` holds the current spec a change archives into. Use the OpenSpec
skills (`/opsx:propose`, `/opsx:apply`, `/opsx:archive`) and `openspec validate <name>`. The
older `docs/superpowers/specs/` tree is historical only — do not add new specs there.
