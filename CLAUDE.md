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
- **El tooltip de ECharts cuelga del contenedor de la gráfica, pero se coloca contra la VENTANA.**
  El texto no se recorta nunca —el div lleva `white-space: nowrap`, así que la caja crece hasta el
  renglón más largo—, pero `ChartCard` es un `overflow-hidden` (lo necesita para que su tabla no se
  salga de las esquinas redondeadas), así que al pasar por las últimas barras la caja se salía por
  el borde y la tarjeta la CORTABA, justo con los nombres de cuenta largos. Por eso todo tooltip
  lleva `confine: true`, puesto una vez en el `TOOLTIP_CHROME` de cada módulo y no tooltip por
  tooltip: el recorte es de la tarjeta, y todas las tarjetas son la misma.
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
English; the Spanish name goes in `label`/`title`. A module may declare `children`
(`DashboardSubmodule`) — pages that hang off it at `/<padre>/<hijo>`, rendered indented under it
and **visibles por defecto**, porque un subitem que solo aparece al entrar en su padre no se puede
descubrir. Plegarlos es del usuario, con un chevron en el padre: el sidebar guarda lo PLEGADO (no lo
desplegado), así que un módulo nuevo con hijos nace visible sin sembrar nada. Dos casos ignoran ese
pliegue por el mismo motivo —un hijo escondido sin control a la vista es inalcanzable—: la barra
colapsada, donde no hay dónde poner el chevron, y el padre de la página ABIERTA, que se borraría del
menú justo cuando estás en ella. The nesting is ONE level: this nav is a list, not a tree, and a second level has
nowhere to render in the 72 px collapsed rail (where a child keeps its icon and `title` and drops
the indent). The header's breadcrumb grows a third level ONLY when the second segment matches a
declared child (`findSubmoduleBySlug`) — `/payroll/<uuid>` is a período detail, and without that
check its identifier would land in the breadcrumb and the `<h1>`. The entity selector still
resolves off the PARENT, so a subitem keeps its module's control without declaring it. **A module
with no real page does not get an entry**: an item that leads to a permanent «próximamente»
teaches the user not to press it, and eventually not to read the one beside it either.

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
pueda re-entrar a un cliente real y reemplazarlo por cuentas que no son suyas. **Y saca el DETALLE,
no solo el total**: por año, la hoja de la suma y detrás una por cada pieza que la sumó —cada
(cliente · centro) que entró, rotulada «Restaurante · Dingoo» como el chip y la leyenda, y el estado
entero de cada cliente de estado único, rotulado con su nombre—, que es el equivalente entre
empresas del «Excel completo» y por el mismo motivo: quien recibe una suma de cinco empresas
pregunta enseguida de dónde sale, y una sola hoja no lo dice. Las piezas llegan HECHAS de la capa
pura (`ConsolidatedWorkspace.summedDatasets`, que reusa las entradas de `centerDatasets` en vez de
derivar un segundo centro) y no se recomponen en el Excel: cuáles entraron ya lo decidió el filtro
al sumar, así que las hojas cuadran con su total por construcción y un cliente de estado único
apartado por una marca de centro tampoco tiene hoja. «Ocultar ceros» se sigue juzgando POR LIBRO
—las piezas incluidas—, de modo que todas las hojas comparten plan de cuentas y columnas; y el
membrete es por hoja, con el logo del cliente a la izquierda y el de su centro a la derecha (la del
total no lleva ninguno, porque son varias empresas), lo que hizo que `StatementSheet` ganara un
`logo` propio además del del libro. **Qué clientes entran
se elige en la barra**, no en un control propio: `client-filter.tsx` es el primer desplegable y no se
rinde fuera del consolidado, igual que `center-filter.tsx` no se rinde en modo estado único.
`PygFilters` gana `clientIds` con las mismas reglas que el resto —ninguno marcado es TODOS, orden del
universo, podado en lectura contra `consolidatableIds`—, y `selectContributions` aplica la selección
ANTES de sumar, así que los avisos de cobertura se recalculan sobre los que quedaron dentro. Marcar
UNO es legítimo y da ese cliente: la regla de «hacen falta dos» decide si el consolidado se OFRECE
(`canConsolidate`), no qué puede mirar quien ya entró — vaciarlo al desmarcar el penúltimo sería un
callejón sin salida.

**Y los CENTROS DE COSTO se cruzan entre clientes en el mismo desplegable de siempre.** El
consolidado devuelve, además del total, un dataset por cada par (cliente, centro)
(`ConsolidatedWorkspace.centerDatasets`, `consolidatedCenterId` = `<clientId>::<centerId>`), y esos
ids compuestos SON ids de vista: por eso el cruce no estrena ni un campo de `PygFilters` ni una
segunda lista —`centerIds`, `sanitizeFilters`, los chips y `selection.ts` funcionan sin tocarse— y
`center-filter.tsx` se rinde allí con el mismo control, **agrupado por cliente**: un encabezado con
el nombre del cliente y debajo sus centros, donde repetirlo en cada fila sería ruido. **No se funden
por nombre**: el `restaurante` de tres empresas son tres columnas, y las dos mitades del rótulo
viajan SEPARADAS (`costCenterName` y `companyName` en la capa pura; `group`/`shortName` en la vista)
porque el desplegable las lee partidas y todos los demás juntas — el `name` de la vista sigue siendo
«Restaurante · Dingoo», así que un chip, una leyenda o el informe, donde no hay encabezado que
desambigüe, dicen de quién es aunque ignoren los dos campos nuevos. Los agrupa
`groupViews` por consecutivos, no por clave: el orden que da el proveedor es el que fija el color y
la posición de cada centro en el resto de la app. Marcar ACOTA la suma —como «Cliente», no como dentro de un cliente, donde el Consolidado
tiene que cuadrar contra `GENERAL` y no puede ser un subconjunto; aquí no hay ningún `GENERAL`
contra el que cuadrar—, y por eso `buildConsolidatedViews` no pasa por `buildViews`, cuyo
Consolidado es por construcción la suma de los centros que ve. **Con centros marcados la suma es
EXACTAMENTE esos centros y el filtro manda sobre «Cliente»**: un cliente de estado único no tiene
ninguno con el que entrar y queda fuera, con un aviso que lo dice, porque no aparece en esa lista y
su ausencia no se vería en ningún otro sitio. Se probó al revés —entrar completo, gobernado por
«Cliente»— y no sirve: los archivos de MicroPlus y Dingoo son de estado único, así que «los tres
restaurantes del grupo» salía siendo casi la suma entera. Para volver a incluirlo se quitan las
marcas de centro. Una marca huérfana
(la de un cliente concreto, que sigue en la barra al abrir el consolidado) se cruza contra el
universo y vale como «ninguna», la misma defensa de `selectContributions`: vaciar la pantalla sería
peor que no acotar. Los años, en cambio, se leen del UNIVERSO y no de la suma acotada — marcar un
centro que solo tiene 2026 no puede borrar 2025 de la lista desde la que se desmarca.

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
twin inside 5.2, **anclado a lo que trajo el archivo** (`original − valor`), así que el par SIEMPRE
suma el monto cargado y re-teclear una celda no descuenta dos veces. Se descontaba «por diferencia»
contra lo que el gemelo tuviera en ese momento —mismo resultado mientras nadie más escribiera en
5.2, y una corrección manual sobrevivía—, pero eso hacía que el resultado dependiera del ORDEN de
dos gestos que significan lo mismo: vaciar 5.2 a mano y luego teclear ese monto abajo lo descontaba
dos veces y dejaba la celda operativa en NEGATIVO, un gasto que el archivo nunca trajo.
Reclasificar a mano es reclasificar, así que los dos órdenes tienen que caer en el mismo sitio; el
precio, escrito en los tests, es que una corrección hecha a mano sobre 5.2 la PISA la siguiente
escritura en su gemela en vez de componerse con ella. Section 5 keeps behaving
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

**«Ocultar meses en 0» quita del EJE las columnas de mes en las que no se movió nada.** Es el gemelo
en Gráficos de la poda de columnas de Datos, y `movingPeriods` (en `charts/presets.ts`, puro +
testeado) es su única regla. Se juzga contra el EJE y no contra la cobertura, que es lo que hace que
el botón sirva para algo: el eje es el de la frecuencia —las doce del año salvo que «Periodo» lo
acote—, así que un archivo que llega hasta julio pinta Ago–Dic vacías aunque el rótulo diga «Ene–Jul»,
y son justo esas las que estorban. Cae además el mes que sí se cargó y no movió nada, que solo existe
con la cobertura DECLARADA (`loadedMonthsByYear`). **Los dos casos se van juntos** y para el motor
siguen siendo distintos —un `null` nunca es un `0`, y el rótulo y las cifras lo leen por
`coveredPeriods`—: el botón no decide qué está cargado sino qué columnas se dibujan, y ahí las dos son
una columna vacía. Contarlas contra los meses CUBIERTOS en vez de contra los dibujados daba cero justo
en el caso que se ve en pantalla, y el control no asomaba nunca. Se juzga el ESTADO y no una cuenta, la regla de
`computeCoverage`: con una cuenta marcada, un mes parado PARA ELLA sigue siendo un mes del ejercicio,
y borrarlo del eje de todas las tarjetas afirmaría que no pasó nada. Se aplica en `cards.ts`, en el
ÚNICO sitio donde se resuelve el tramo, así que las cinco tarjetas y el rótulo lo heredan de una vez
y ninguna nombra un tramo distinto de la de al lado. La primera tarjeta es la excepción de fontanería:
su eje no sale de `periodRefs` sino de `toSeriesQuery`, así que los periodos que quedan le llegan como
si estuvieran MARCADOS —acotar es exactamente lo que una marca hace—, en vez de abrirle una segunda
puerta al motor que pudiera dibujar otro eje que el resto de la pantalla. El rótulo no necesita caso propio, porque
`periodRangeLabel` ya ENUMERA un conjunto con huecos («Ene, Feb, Abr…») en vez de afirmar «Ene–Jul».
**Las cifras no se mueven**: un mes en cero suma cero, así que los tiles, la tarta, el ranking y la
cascada dan el mismo número y solo se encoge el eje — el mismo argumento por el que ocultar un mes
vacío no descuadra el Total en Datos. El interruptor vive en Gráficos y NO en la barra, porque lo
leen las tarjetas de esa pestaña y ninguna de las otras dos (en la barra sería un control muerto en
Datos y en Análisis): es estado local, no es un `PygFilters`, no produce chip y el informe imprimible
—que llama a `buildGraficosCards` por su cuenta— sigue sacando el eje completo. Solo asoma en
MENSUAL, porque un trimestre cubierto agrega tres meses y no es «un mes en 0», y solo si hay alguno
que ocultar; `emptyPeriods` se cuenta siempre sobre el eje SIN podar, así que el botón no se esfuma
justo al pulsarlo, y encendido lleva la CUENTA de lo que quitó, ya que aquí no hay pie de tabla donde
ponerla.

**Una cifra de Gráficos o Análisis es el TOTAL del periodo seleccionado**, nunca el valor de una de
sus columnas. Marcar seis meses y leer el de junio era lo que hacía `lastCoveredIndex`, de cuando no
existía el filtro «Periodo» y la última columna cargada era el único periodo del que se podía
hablar; hoy lo que manda es `coveredPeriods` + `sumOver`/`amountsOver` (`presets.ts`), y el rango se
resuelve UNA vez en `cards.ts` y viaja con la lista, para que dos tarjetas de la misma pantalla no
digan «Ene–Jul» y «Ene–Dic». Un periodo sin cobertura no cuenta como `0`: una cuenta sin cobertura
en ninguno da `null` y su tarjeta queda vacía. Dos tarjetas son la excepción y por la misma razón —
lo que calculan no es una suma—: el **% sobre ingresos** es `Σ cuenta ÷ Σ ingresos` y jamás el
promedio de los porcentajes de cada mes (la regla que el análisis vertical ya aplica a su «Total
año»; con la base en `0` se vacía y lo dice, una sola línea nombrando el rango), y la **variación**
compara dos columnas, así que no hereda el rótulo del rango sino que nombra su propio par («Jul
contra Jun»). `periodRangeLabel` (`analytics/period.ts`) es la única forma de nombrar un conjunto de
periodos y distingue el rango continuo del que tiene huecos: Ene y Mar marcados son «Ene, Mar», y
«Ene–Mar» afirmaría que febrero está sumado.

**Marcar una cuenta y otra que la CONTIENE anota el porcentaje sobre la barra.** Marcar «4 Ingresos»
y «4.1 Ventas» a la vez no es solo comparar dos barras: la pregunta que produce esa marca es qué
parte de la primera es la segunda. `lib/profit-loss/charts/share.ts` (puro + testeado) la responde
una vez y de ahí salen las TRES lecturas — la etiqueta de la barra, el tooltip y la nota al pie de la
tarjeta «Comparación» —, en vez de tres cálculos que puedan separarse. La base es el **ancestro
marcado más cercano** a cualquier profundidad, caminando `parentByCode` (la parentela del ÁRBOL, la
misma que sigue `ancestorPath`): eso es lo que da lectura al salto de nivel (`4` y `4.1.01` sin la
intermedia) y lo que acierta con dos familias marcadas a la vez, donde una base común no existe. La
división NO se reescribe — se le cuelga a la serie ese ancestro como `container` y se pasa por
`toPctOfContainer`, así hereda que un periodo sin cobertura y una base en `0` den `null` y nunca
`0 %`. En la barra va **solo el número**, en una segunda línea más tenue bajo el monto (`rich`, la
única razón por la que `ChartLabel` lo tiene): «28.4 % de Ingresos» no cabe en doce columnas, así que
quién es la base lo dicen el tooltip —barra por barra— y una línea en castellano llano bajo la
tarjeta (`describeShares`), que además es lo que desambigua cuando hay dos niveles de padre en la
misma columna. El porcentaje tiene **presupuesto propio** y se mide contra las barras que lo llevan,
no contra todas: padre e hija sobre doce meses son 24 marcas y ningún monto cabe, pero solo la hija
lleva porcentaje, así que son 12 y sí caben — en el año completo se lee el % y ningún monto, y al
acotar «Periodo» reaparece el monto encima. Nada de lo que se veía antes deja de verse, y dos cuentas
sin parentesco dejan la gráfica exactamente igual. La tabla gemela sigue siendo montos y el informe
imprimible lo hereda sin tocarlo, porque lee el mismo `buildGraficosCards`.

**«PREDETERMINADOS» es una SECCIÓN propia de la barra**, con su rótulo y separada por una línea de
los cinco desplegables: aquellos ACOTAN lo que ya hay en pantalla y este lo SUSTITUYE por otra
lectura, de las que la firma presenta siempre. `lib/profit-loss/charts/preset-views.ts` es el
catálogo —una lista y no un `if`—, cada entrada con su `isAvailable`, porque quién puede dibujar una
vista es de la vista; añadir la siguiente es una entrada ahí más su rama en `cards.ts`, sin tocar la
barra ni los filtros. Cada vista es un INTERRUPTOR a la vista y no una opción dentro de un menú —se
presentan de un clic, y un menú esconde tras un rótulo genérico lo único que hay que leer—, y la
sección **se rinde entera** cuando el plan abierto no admite ninguna, ya que un rótulo sobre un
control muerto enseña a no leer ninguno de los dos.

**Su primera vista, «Ventas», es la primera vez que una serie NO es una cuenta, y la única tarjeta
con el EJE GIRADO.** La primera tarjeta de Gráficos pasa a comparar SEIS CATEGORÍAS —Hospedaje,
Restaurante, Lavandería, Bar, Tours y el resto de los ingresos ordinarios—, una serie por línea
sobre el mismo eje de periodos. Existe porque esa pregunta no cabe en el plan: «hospedaje» son dos
ramas enteras de tarifa menos lo que el contador colgó ahí y es otro negocio (Eventos);
«restaurante» y «bar» viven MEZCLADOS bajo una sola cuenta de Alimentos y Bebidas donde solo el
nombre los separa; y «lavandería» y «tours» están DUPLICADOS en ramas distintas y a distinta
profundidad, uno de ellos escondido bajo un padre llamado «Otros Ingresos de Actividades
Ordinarias». `lib/profit-loss/charts/business-lines.ts` (puro + testeado) localiza todo POR RÓTULO y
jamás por código —la regla de `microplus-grid.ts` y `dingoo-grid.ts`, y lo que hace que funcione con
`4.1.01.01` y con `4.1.1.1`—: el nodo de hospedaje se busca por su nombre a cualquier profundidad
bajo Ingresos y su PADRE es la sección de actividades ordinarias, en vez de dar por hecho que es
`4.1` — y si NINGUNA cuenta escribe «hospedaje», el nodo se reconoce por sus hijas, la que vende
habitaciones, que es un plan real de la firma. **La lectura entra además en toda rama hermana que el
PLAN declare también ordinaria**: un cliente llama a su `4.2` «Otros Ingresos de Actividades
Ordinarias» y mete ahí las `Comisiones Tours` que su propio informe cuenta como Tours, mientras otro
llama al suyo «Otros Ingresos» a secas; seguir lo que el plan declara es lo que deja fuera solos a
los ingresos financieros. Sin esa regla faltaban $684 de enero contra el informe del contador.

**Son categorías DECLARADAS y no una barra por cuenta**, y eso se probó al revés primero: con una
barra por cuenta suelta, el plan real daba DOCE líneas para las OCHO ranuras de la paleta, así que
la lectura dependía de cuáles cabían —las dos lavanderías salían separadas, una dibujada y la otra
dentro de un «Otras líneas» que nadie podía cuadrar—. Con cinco categorías más el resto son seis,
nunca se pliega nada, y una cuenta duplicada suma en su categoría en vez de competir consigo misma
por una ranura. Tres reglas sostienen el reparto: **Hospedaje corta por PROFUNDIDAD** —solo las
hijas DIRECTAS del nodo que dicen hospedaje, alojamiento, habitación, suite o tarifa, y esas se
llevan su rama completa, incluida una `Ventas Restaurante` colgada dentro de `Habitaciones
Sencillas`—, lo que separa ese caso del de `Ventas Eventos`, que cuelga del mismo nodo y no es
hospedaje; **Bar es lo que dice bebidas y Restaurante es EL RESTO** de Alimentos y Bebidas, no otra
lista de palabras, así que los dos siempre suman esa cuenta entera y un «Sin desglosar» nuevo cae en
Restaurante en vez de desaparecer; y **se DESCIENDE por lo que no encaja en ninguna categoría**, que
es lo único que encuentra `Servicios de Lavandería` bajo un padre llamado «Otros Ingresos». Las
líneas SIN MOVIMIENTO en el tramo se van y se cuentan —la regla de `foldDistribution`—, porque el
plan declara `Venta Parqueadero` y `Ventas Telefono` en cero todo el año y cuatro barras invisibles
entierran a la que importa. Rebajas y descuentos quedan fuera de todo: son un menos dentro de los
ingresos y no una línea de negocio. **Y la nota CUADRA la lectura contra el estado**, que es la
primera cuenta que hace cualquiera al ver seis barras — «Las 6 líneas suman $204.045,51 y el estado
declara $201.998,26: la diferencia son −$2.047,25 de cuentas que quedan fuera» —, con centavos, al
revés que el eje: aquí la cifra no se mira, se COTEJA. Por eso `excluded` lleva el código además del
rótulo y `sectionCode` viaja en el conjunto: sin ellos la tarjeta puede nombrar lo excluido pero no
sumarlo, y hacer esa resta a mano contra otra pestaña es lo que convierte una lectura correcta en
una sospecha. Si lo excluido no explica la diferencia, la nota dice cuánto queda «sin clasificar» en
vez de dejar dos cifras que no cierran. Una vista es **excluyente con las marcas de cuenta en los
dos sentidos** —elegirla las borra, marcar una cuenta la deselecciona—, porque son dos respuestas a
«qué series dibujo» sin nada que las arbitre; por eso `preset` vive en `PygFilters` (como `string |
null`, para no arrastrar `charts/` a `filters.ts`) y no en la cabecera de su tarjeta, y por eso deja
chip. La de «Ventas» no se ofrece cuando el plan no declara líneas (MicroPlus, Dingoo, un comercio),
la misma regla que `center-filter.tsx` en modo estado único, y se exigen DOS o más: una sola barra
no es una comparación. Datos, Análisis, las otras cuatro tarjetas y el informe imprimible no cambian
ni una línea.

**Su segunda vista, «Costos y gastos», es el ANEXO DE GASTOS que la firma llevaba en un libro
aparte**, y es la prueba de que el catálogo de predeterminados es un punto de extensión de verdad:
una entrada en `preset-views.ts` más su rama en `cards.ts`, sin tocar la barra ni `filters.ts`. Se
consideró primero como marcas —las 17 categorías del anexo SON cuentas del plan, así que marcarlas
las produce— y se descartó por lo único que importaba: marcar diecisiete cuentas a mano no es
llegar. **Y al revés que «Ventas», no necesita vocabulario ninguno.** Aquella busca sus categorías
por rótulo y por eso solo se ofrece a un plan de hotelería; las de aquí están a distinta profundidad
según la rama (`5.2.02` junto a `5.3.03.01`) justamente porque son las cuentas de MOVIMIENTO del
árbol de gastos, que es lo que `leavesOfAny` ya devuelve — regla estructural y no de dominio, sin
una lista que mantener por cliente. **Y por eso se ofrece con CUALQUIER plan que declare cuentas de
gasto**, sin mirar de qué sistema salió el archivo. Estuvo atada a MicroPlus, y era una restricción
de LEGIBILIDAD y no de que el cálculo fallara: el reparto se hace sobre las cuentas de movimiento, y
ahí cada plan da un número muy distinto —el de MicroPlus se queda en unas decenas, otros bajan mucho
más y devuelven más de cien rubros—. Lo que hace legible ese caso no es el candado sino el CORTE, que
es de la tarjeta y vale igual para todos: catorce rubros y un «Otros» que agrupa la cola, con la
tabla gemela listándolos uno a uno con su cifra. El plan real de MicroPlus trae diecisiete rubros,
así que ese cliente ya venía leyendo el pliegue, y el candado protegía en realidad la SIEMBRA —ver
abajo—, que es lo que se quitó con él. `isAvailable` recibe igualmente un `PresetContext` y no la
fuente a secas, porque lo que decide no tiene por qué estar en el árbol —el anexo dependió del
SISTEMA, que es un dato del workspace— y la vista que venga puede necesitar otro dato así.
`lib/profit-loss/charts/expense-distribution.ts` es la capa pura y es
pequeña porque el motor ya existía: reusa la MISMA tanda del ranking en vez de pedir la suya —dos
consultas para el mismo reparto podrían acabar cuadrando contra tramos distintos, que es justo lo
que la nota afirma que no pasa—. **Lo que la define son sus DOS denominadores**: el total del gasto,
que es el 100 % del reparto, y el total del INGRESO, porque «¿cuánto de lo que vendí se me fue en
honorarios médicos?» es la pregunta con la que se abre el anexo y un solo denominador no la
responde. `shareOf` es la única definición de «porcentaje sobre un total» de esa cara del módulo y
la comparten las dos columnas y la ficha, así que un rubro y su fila no pueden decir cifras
distintas; un total `null` o `0` da `null` y jamás `0 %`. El denominador es el ROLLUP del motor y no
la suma de lo que haya en pantalla, de modo que con cuentas marcadas la columna suma menos de 100 %
— que es lo correcto, y es lo que dice que se está mirando un trozo.

**NO siembra cuentas, pero se deja ACOTAR por ellas**, y las dos mitades de esa frase son la misma
decisión. Sembró las que dibuja —al encenderse quedaban marcadas en «Cuenta contable», así se veía
cuáles entran y se quitaba un rubro desmarcándolo—, y eso es justo lo que ataba la vista a MicroPlus:
las que dibuja son TODAS las de movimiento del árbol de gastos, y un plan real declara ciento treinta
y una, o sea ciento treinta y un chips en la tira de filtros, que no es ver nada. Sembrar solo las
catorce dibujadas tampoco vale, por dos motivos independientes: cuáles son depende de los MONTOS, que
salen del motor y del tramo, así que calcularlos en la siembra sería una segunda suma capaz de marcar
catorce distintas de las catorce dibujadas; y una marca ACOTA lo que el anexo suma, de modo que
marcar catorce se llevaría por delante el «Otros» que agrupa el resto. Sin siembra la barra queda con
un chip, el anexo lee el árbol de gastos entero y la tabla gemela sigue listando cada rubro.
Lo que SÍ sobrevive es la excepción a la exclusividad entre marcas y vistas: normalmente marcar una
cuenta apaga el predeterminado —son dos respuestas a «qué dibujo» y nada las arbitra—, pero eso vale
cuando la vista dibuja algo que NO es un conjunto de cuentas; aquí los rubros SON cuentas del plan,
así que la marca y la vista dicen lo mismo y marcar ACOTA el reparto en vez de contradecirlo
(`withCodeToggled`, opción `keepPreset`). Ahora lo DECLARA la vista (`PresetView.narrowedByCodes`) en
vez de heredarlo de la siembra, que es lo que lo dejaba en pie al quitarla: son dos cosas distintas,
y una vista puede no sembrar nada y aun así dejarse acotar por cuentas. Quien sabe cuál es cuál es
el catálogo, que vive en `charts/`, y `PygDataProvider` no importa de ahí — así que lo que cada vista
declara (`seeds`, `narrowedByCodes`, `frequency`) viaja al proveedor como ARGUMENTO desde el botón de
la barra, que sí lo conoce, y el proveedor solo recuerda si la vista abierta se deja acotar. Se lee además
en **ANUAL** y también lo declara ella: el anexo es una columna por rubro sobre el tramo entero, y en
mensual saldrían seis barras por rubro, que es su evolución y no su reparto; se aplica al encender y
no se deshace al apagar, porque «Ver por» está a la vista y se vuelve de un clic, al revés que las
marcas, que dejarían chips que el usuario no puso. Tampoco siembra centros ni periodos — el anexo no
reparte por eso, y marcar los centros abriría una columna por establecimiento de algo que se lee como
un total.

La vista ocupa DOS ranuras de la lista: la primera, que es la que toda vista sustituye, y la del
**ranking**, porque pregunta lo mismo sobre el mismo universo y dejar las dos imprimiría la lista dos
veces. **La CASCADA se adelanta a la composición de ingresos**, porque es la que continúa la
lectura: va del ingreso al resultado pasando por los gastos, que es justo el reparto que se acaba de
leer, mientras que la composición de ingresos se queda detrás como contexto de la columna «% del ingreso».
Fuera del anexo el orden es el de siempre, así que las dos se declaran aparte del literal y la lista
las intercambia — son la misma tarjeta en los dos casos. **Y RINDE la de «Distribución»**, que reparte UNA cuenta entre sus hijas y
con quince marcadas resuelve Ingresos: bajo un anexo de GASTOS quedaba una tarjeta repartiendo
ingresos sin relación con lo que se está leyendo. Se va entera en vez de reapuntarse a los gastos
porque su lectura ya la dan las otras dos —el reparto lo dicen la tarta y las barras, y en anual no
hay evolución que apilar—, y por eso la lista puede traer CUATRO tarjetas en vez de cinco.

**Las barras son VERTICALES** (`verticalBarOption`, espejo del horizontal) porque es como la firma
dibuja su anexo a mano, y esa forma no es capricho: con las categorías abajo el ojo recorre la fila
de cifras de un barrido, que es lo que se hace al cotejar contra la hoja. El precio es el rótulo
—«EMPLEADOS M.O.I. / ADMISIONES / CAJA / INFORMACION» no cabe bajo una columna— y se paga
PARTIÉNDOLO en líneas, no girándolo, que obligaría a inclinar la cabeza diecisiete veces; `interval:
0` es lo que obliga a dibujarlos TODOS, porque sin él ECharts adelgaza el eje y se salta uno de cada
dos, y una barra sin nombre no se identifica por nada. **Y van todas del MISMO color**,
`CHART_SECTION.cost` —el celeste con el que Datos pinta la raíz 5—, que es la cuarta vez que el color
deja de seguir a la entidad y aquí por el motivo más simple: con cada barra rotulada y con su cifra
encima, el color no distingue nada, así que repartir diecisiete tonos gastaría el canal de identidad
en re-decir lo que la longitud ya dice. Por lo mismo las filas de la tabla no llevan punto de color:
diecisiete puntos iguales prometerían una distinción que no existe. **Las dos tarjetas cortan en el
MISMO sitio y por una sola reducción**: quince rubros (`ANNEX_MAX_SLICES`) con la cola plegada en
«Otros». Antes cada una cortaba por su cuenta —las barras por la escala del ranking, la tarta por la
suya— y podían enseñar distinto número de rubros del mismo reparto, que es la clase de desacuerdo que
nadie lee como un error. **Y esa segunda tarjeta es una TARTA y no un anillo**: el hueco de un anillo
existe para poner el TOTAL en medio —lo único que una tarta no puede decir—, y aquí el total vive en
la nota al pie y en la fila de cierre de la tabla gemela, así que el agujero gastaba el centro del
círculo en nada y, al estrechar cada porción a una banda, decía el reparto peor que la tarta que la
firma dibuja en su propio anexo. `pieOption` perdió con eso su interruptor `donut`, que se quedaba
sin ningún llamador. Quince es un límite de LEGIBILIDAD y no de color: las barras van todas del
mismo tono, así que por ahí no hay tope, y la tarta tiene tonos para más; lo que no da para más es la
lectura — un plan de gastos puede traer 133 cuentas de movimiento, y ahí las porciones caen bajo el
0,1 %, donde no se ven ni se pueden rotular. La nota dice cuántos agrupó «Otros» y dónde están
enteros, porque si no ese pliegue se lee como una cuenta más del plan. Pero **la tabla gemela no corta**: ES el anexo entero —código de `sublabel`, valor, % del gasto, % del ingreso
y una fila de TOTAL con `emphasis`—, que es el sitio donde un rubro plegado conserva su cifra. Los
tests transcriben el archivo real del Hospital General Privado Durán y reproducen los porcentajes
que él imprime (27 %, 15 %, 14 %, …) y el 77,7 % de gasto sobre ingreso, que es la única evidencia
externa de que las dos columnas significan lo que su cabecera promete. **Lo que la app NO reproduce
de ese archivo** es su fila repetida: `5.5.01.01` aparece dos veces —«Empleados Familia Durán» y
«Empleados Administración»—, un corte a mano de UNA cuenta que su propio gráfico de barras vuelve a
fundir; aquí un código es una fila, y ese corte es del plan de cuentas o de una segmentación, no de
esta tarjeta.

**Y «seleccionar un gasto X» ya era un gesto que existía**: la ficha de cuenta. Gana
`shareOfExpenses` y `shareOfRevenue`, que NO sustituyen a `shareOfContainer` sino que responden otra
pregunta — aquel divide por el padre INMEDIATO («Honorarios Médicos es el 43 % de Gastos
Operacionales»), que dice dónde está dentro de su rama, y estos por las raíces del estado («el 27 %
de todo el gasto y el 21 % de lo que se facturó»). Una cuenta hundida tres niveles pesa muchísimo en
su padre y poquísimo en el estado, así que leer solo el primero engaña. Los totales los pide QUIEN
LLAMA (`AccountDetailInput.totals`, opcional) en vez de derivarse dentro, porque salen de otra
consulta al motor y hacerla ahí abriría la puerta a cuadrar contra un tramo distinto del que la
ficha dibuja; sin ellos las dos cifras son `null` y el panel no las escribe, que es lo que deja
intacta a la ficha de un ingreso.

**Y la ficha las DIBUJA, no solo las escribe** (`shareOfTotalOption`/`shareOfTotalTable`): una tarjeta
«Peso en el estado» con una fila por total —la barra llena hasta lo que la cuenta pesa y el resto en
un relleno recesivo hasta el 100 %—, porque un 27,4 % y un 21,3 % en una lista no dicen de un vistazo
cuál es grande y dos barras contra el mismo todo sí. La decisión está en el RESTO: sin él una barra
sobre un eje que se auto-escala obliga a ir a mirar el eje para saber contra qué, así que el eje va
FIJO a 100 y deja de hacer falta —además de que sin fijarlo el mismo relleno diría cosas distintas en
las dos filas—. El monto y su porcentaje van JUSTO A LA DERECHA del relleno y no dentro, y eso se
probó al revés: dentro, `$307,005.37` no cabe en una barra del 27 % y sale recortado, y el umbral que
decidiera cuándo entra dependería del ancho del texto, que no se puede medir sin un canvas. El resto
no se rotula —su porcentaje es el complemento del que ya está escrito—, y el color de cada fila lo
pone el BLOQUE contra el que se mide (`CHART_SECTION`: celeste los gastos, verde los ingresos), que
es exactamente lo que esa excepción existe para decir. Los rótulos son cortos («Sobre los gastos») y
el canal 106 px porque esto vive en el panel lateral, que son 440 px: entre el canal y el hueco de la
cifra se le come a la barra todo el ancho que tiene para decir algo.

**El eje va girado —las CATEGORÍAS en la X— y esa es la decisión de la tarjeta.** Con los meses en
el eje, las cinco categorías que no son hospedaje comparten grupo con una barra cien veces mayor:
quedan aplastadas contra él, sin rótulo propio y sin sitio para su cifra. Ninguna escala arregla esa
diferencia de tamaño; lo que la arregla es que la pequeña deje de competir por el espacio de la
grande. `categoryBarOption` y `categoryTable` (en `option.ts`) son los builders, y
`ChartTableRow.color` pasó a ser OPCIONAL por ellos: ahí las filas son categorías y el color lo
llevan las columnas, así que un punto de color emparejaría con algo que no existe. Lo que se compara
DENTRO de cada columna sale de lo marcado, la figura de siempre: los periodos CUBIERTOS son las
barras, y pasadas las ocho ranuras de la paleta se cierra en una sola barra por columna con el total
del tramo —la única lectura donde cada barra imprime su cifra encima—.

**Reparte por ESTABLECIMIENTO y por MES, y las marcas lo dicen.** Encender «Ventas» SIEMBRA los
periodos cubiertos del año abierto en «Periodo» —los que dibuja, ni uno que el archivo no trajera— y
TODO el listado de «Centro de costo» (`withPresetSelected` recibe la lista; el proveedor la saca de
las vistas con rol `center` **y `sin-centro`**), así que lo dibujado y lo marcado son lo mismo: se ve
cuáles entran y se quita uno desmarcándolo, donde el usuario ya sabe buscar. Apagarla las limpia —
eran marcas que puso la vista, y dejar cinco chips detrás de un interruptor apagado es basura que el
usuario no puso. El Consolidado es lo ÚNICO que no se siembra, porque no es un centro sino su suma y
su columna repetiría las otras. **«Sin centro de costo» sí entra**, aunque no sea un
establecimiento: es lo que el sistema contable no supo asignar, y son dólares del estado, así que
dejarlo fuera por defecto los sacaba de TODAS las columnas a la vez y la lectura arrancaba por
debajo del consolidado. La nota que lo dice sigue en pie para quien lo desmarque a mano, que es
donde ese aviso hace falta. Desmarcarlos todos vuelve al centro resuelto, la regla de siempre, y desmarcar
meses acota el eje de TODAS las tarjetas, que es lo que una marca de «Periodo» siempre ha hecho. Con
más de ocho periodos marcados cada columna se cierra en el total del tramo —ocho es lo que da la
paleta— y la nota dice qué hacer para volver a compararlos uno a uno. **El CONSOLIDADO ENTRE
CLIENTES es la excepción y no siembra nada**: allí los centros son de todos los clientes juntos y
sembrarlos abriría decenas de columnas de golpe; quien entra al consolidado sabe cuántos hay, así
que elegir cuáles comparar es suyo. Cada columna es entonces un par (categoría, establecimiento) con
los meses dentro —la hoja del contador entera, actividad × sucursal × mes, en un gráfico—, y un par
que no se mueve no abre columna, porque son justo las columnas vacías las que hacen ilegible el
resto — con cinco centros marcados, Hospedaje enseña tres, y la nota lo DICE, porque una columna que
falta se lee como un dato que falta. La suma del cuadre se hace CENTRO A CENTRO también con uno
solo: la tanda trae una serie por (cuenta, centro), y una suma que las indexe por código se queda
con la última —las barras dirían cinco hoteles, el cuadre uno, y la nota declararía medio millón
«sin clasificar» que en realidad está dibujado—.

**El eje lleva DOS RENGLONES**: abajo la categoría, una sola vez y en negrita sobre sus columnas, y
encima el establecimiento de cada una. Repetir «Hospedaje · C. C. ALBEMARLE» cinco veces seguidas es
lo que hacía ilegible el eje, así que la categoría viaja aparte (`CategoryColumn.group`) y
`CategoryReading.groups` la resuelve en TRAMOS por consecutivos —el orden de las columnas es el que
dice dónde empieza y acaba cada una, igual que `groupViews` en Ocupaciones—. El renglón es un
SEGUNDO `xAxis`, y por eso `ChartOption` pasó a admitir un par: no es una segunda escala —ninguna
serie se ata a él, es una banda de rótulos—, y el invariante que sigue intacto es el de `yAxis`,
donde una segunda entrada sí haría comparables dos unidades que no lo son. El nombre se escribe en
el CENTRO de su tramo y el resto de posiciones van en blanco, que es lo que lo hace parecer un
encabezado; con un tramo par cae en la columna de la izquierda del medio, porque centrarlo exacto
exigiría medir el gráfico y esto se decide sin renderizar nada. En la tabla gemela el grupo va de
`sublabel`, no pegado al nombre: ahí hay sitio para los dos. **Hasta dónde llega cada grupo lo dice
una FRANJA de fondo en los impares** (`markArea` con `CHART_BAND`, que espeja
`--color-border-soft`), la lectura de una tabla de filas alternas: lo que hace ver el corte es el
CAMBIO, y una divisoria por grupo añadiría verticales a una retícula que ya tiene horizontales. Sus
extremos son ÍNDICES de columna y no rótulos, porque el mismo establecimiento aparece en varios
grupos y un rango por nombre engancharía la primera aparición. Exigió registrar `MarkAreaComponent`
en `chart.tsx`: sin él un `markArea` no falla, simplemente no se dibuja, que es peor.

**Y las CATEGORÍAS se quitan y se ponen desde una LEYENDA propia**, el mismo gesto que la leyenda de
meses que ECharts dibuja bajo esa misma tarjeta. La dibuja React (`business-line-legend.tsx`, colgada
del nuevo `footerSlot` de `ChartCard`) porque ahí las líneas son el EJE y ECharts solo sabe hacer
leyenda de SERIES; sus marcas no llevan color —el color lo lleva el periodo, así que seis puntos de
colores prometerían una distinción que no existe, la misma regla por la que la tabla del anexo no
lleva punto— y son de tinta, llena encendida y hueca apagada. Es estado LOCAL de Gráficos y no un
`PygFilters`: lo lee UNA tarjeta, así que no se guarda, no deja chip y el informe imprimible —que
llama a `buildGraficosCards` por su cuenta— sigue sacando todas; una marca huérfana vale como
ninguna, la defensa de siempre. **Lo que puede estar mal no son las columnas —eso se ve— sino el
CUADRE**: `selectBusinessLines` APARTA las apagadas en vez de borrarlas y la nota las suma del lado de
lo que queda fuera («la diferencia son −$2.047,25 de cuentas que quedan fuera y $4.045,51 de las
líneas apagadas»), porque dejarlas caer en el residuo declararía miles «sin clasificar», que es justo
el aviso que esa frase existe para dar cuando la lectura no cierra de verdad. La leyenda ofrece solo
las líneas que SE MUEVEN en el tramo —un ítem que no dibuja nada al encenderlo enseña a no pulsar los
de al lado—, se juzga contra la MISMA tanda que dibujan las barras, y sigue en pantalla con todas
apagadas, que es el único sitio desde el que se vuelven a encender.

**«Distribución» es la tercera lectura de la composición y no repite a las otras dos**: la dona dice
de qué se compone el TRAMO entero y el ranking cuáles son las más grandes, pero solo un apilado por
periodo dice si una hija está ganando peso mes a mes. `lib/profit-loss/charts/distribution.ts` (puro y
testeado) toma las dos decisiones que pueden estar mal. **Qué cuenta se reparte** es por quinta vez la
figura de `resolveActiveCenterId` —exactamente una marcada es esa cuenta, ninguna o varias es
Ingresos—, y luego DESCIENDE mientras haya una sola hija: un plan real encadena `4 → 4.1` y `5 → 5.1`,
así que repartir la raíz sería una pila de un solo segmento, que no es una pila. Una cuenta de
movimiento marcada no tiene nada que repartir y la tarjeta lo dice en vez de dibujar. **Qué hijas se
dibujan**: las paradas se van y se cuentan (un estado declara cada cuenta de su plan tenga o no
movimiento, y diez leyendas en cero entierran a la que importa), y pasadas las CINCO de su escala la
cola se pliega en «Otros» ordenando ANTES de cortar, como el ranking y con el mismo corte que la dona.
**La línea del total NO es el techo de la pila**, y por eso existe: `4.1.4 Rebajas y/o Descuentos` es
un ingreso de saldo negativo que se apila hacia ABAJO, así que el neto no está en ningún borde; con
«Otros» plegado sigue siendo el total de verdad, y es además lo único que imprime un MONTO por
columna. Viaja por su propia consulta
—nunca re-sumando las barras— y toma un tono de TINTA y no un paso de la escala, la misma regla del
combo: es una lectura de la misma entidad, no una segunda. Es también la ÚNICA pila de la app que se
dibuja sin las costuras de 2 px de superficie que separan todo relleno contiguo (`barSeries`,
`seamless`): una columna que ya declara su total es una sola cifra repartida y no varias puestas en
fila, y esas costuras la parten en trozos sueltos —lo que separa un segmento del siguiente pasa a ser
el salto de color, que la escala garantiza—. En la tabla gemela cierra con `emphasis`, y el informe
imprimible la hereda sin tocarla porque lee el mismo `buildGraficosCards`. **Lo que cada segmento sí
escribe es su PORCENTAJE dentro de ese total** (`distributionShares`, que cuelga la línea como
`container` y pasa por `toPctOfContainer` —la única definición de «porcentaje sobre el contenedor»—,
así que un periodo sin cobertura y un total en `0` dan `null` y jamás `0 %`): el monto lo dice la
línea una vez por columna, y qué PARTE de él es cada hija es justo lo que la pila añade y lo que
restar montos a ojo cuesta. No pasa por el presupuesto de `sharesFit` —ese mide un elenco que se
aprieta de lado, y una pila reparte sus etiquetas en VERTICAL, cada una dentro de su trozo—: lo que
limita aquí es la altura del segmento, que es su propio porcentaje, así que por debajo de
`MIN_STACK_LABEL_SHARE` el número se apaga en vez de desbordar el trozo, y el tooltip —donde sobra
el ancho— lo dice igual y nombrando la base. Con el eje despejado el segmento lleva las dos cifras,
monto arriba y porcentaje debajo, el mismo `rich` de las cuentas anidadas. La tabla gemela sigue
siendo montos.

**Y es la excepción a «el color de una serie es identidad», por el motivo contrario a `CHART_SECTION`.**
Allí el color dice de qué BLOQUE habla la serie; aquí no distingue entidades en absoluto: los segmentos
son PARTES DE UNA MISMA CIFRA apiladas de mayor a menor, así que el color sigue al TAMAÑO
(`distributionColor` reparte `CHART_DISTRIBUTION_RAMP` por el lugar en la pila, sin pasar por
`colorForEntity`). Ocho tonos de identidad —azul, rojo, verde, ámbar— borran justo esa lectura: cada
columna sale pareciendo cuatro asuntos amontonados en vez de un reparto. La escala va de azul marino a
verde claro, monótona en luminosidad, de modo que el tono y la posición dicen lo mismo. **Son CINCO
pasos y no ocho, y eso está MEDIDO**: el arco azul→verde mide unos 55 ΔE, y en ocho pasos deja pares
vecinos en ΔE 8 —bajo el piso de visión normal, y en una pila los vecinos son exactamente lo que hay
que distinguir—, mientras que en cinco da 16.6 y pasa. De ahí sale el corte de «Otros», que se lleva
`CHART_NEUTRAL` porque no es un puesto de la escala sino lo que sobra. Medido con el validador de la
skill `dataviz` y escrito en el archivo: croma PASS, CVD PASS (peor par azul↔azul ΔE 14.2 deutan),
visión normal PASS (peor par verde↔verde ΔE 16.6). La banda de luminosidad NO se cumple y no debe
cumplirse — es un requisito de los rellenos categóricos, y una rampa secuencial existe para salirse de
ella por los dos extremos, igual que `CHART_HEAT_RAMP`.

**Rol de Pagos.** Un período es cliente + año + mes; su nómina son `PayrollEmployeeLine[]`. **El
MOTOR es la única fuente de toda cifra en pantalla** y el Excel sirve solo para SUBIR información:
lo guardado es la ficha del empleado más lo que se CAPTURA del mes (`PayrollMonthlyCapture`), y las
veinte columnas del rol —incluidos los cuatro totales del período y el líquido de cada fila— las
deriva `lib/payroll/engine/` en cada render. El archivo del contador ya no deja copia de sus
propias salidas: `rol-general-grid.ts` ni siquiera localiza `TOTAL INGRESO`, `TOTAL EGRESOS`,
`LIQUIDO A RECIBIR` ni `COSTO TOTAL`; lo que sí lee es `PAGADO` (`BZ`), que es un insumo y entra
como un capturado más. Contrastar la app contra el libro es trabajo de `engine/golden.test.ts`, que
reproduce las 20 columnas de los seis empleados de marzo 2026 con igualdad EXACTA — una pantalla
que enseña las cifras del archivo junto a un veredicto calculado no es un contraste, es dos
verdades a la vez. Nada derivado se persiste (`PayrollRosterSummary`, los totales del período, el
asiento mismo): una copia guardada aparte quedaría desactualizada y la pantalla diría una cosa y
los datos otra. Un período **no tiene estado**: nació con uno («en captura» / «cerrado») que nada
sabía poner en «cerrado» y que no compuertaba nada, así que todo período decía lo mismo para
siempre. `computeLinePayroll` (`employee-input.ts`) es la ÚNICA composición de ficha + captura →
motor, y existe porque estaba escrita a mano en cada consumidor: la de la tabla comparaba lo que
declaró el archivo mientras la del motor comparaba lo tecleado, y el badge de conciliación y la
cifra de al lado podían discrepar.

**Qué es de la FICHA y qué del MES es la línea que decide dónde se edita cada cosa.** La ficha
(`PayrollEmployeeLine`) guarda lo estable —identidad, área, tipo de contrato, sueldo base, las dos
banderas del fondo de reserva (`FR`/`AC FR`) y **las dos de provisión de décimos** (`AS`/`AT`)— y la
captura, lo que se declara cada mes. Las provisiones vivían en la captura y son el mismo tipo de
decisión que el fondo de reserva —cobrar los décimos mensualizados o acumularlos es una elección del
EMPLEADO, la del SUT—, así que no sobrevivían a `copyRoster`: había que volver a marcarlas cada mes,
persona por persona, y olvidarse un mes dejaba de provisionar sin que nada avisara. Mudarlas no
cambió la granularidad de nada —una `PayrollEmployeeLine` ya se guarda POR PERÍODO, así que el
importador las sigue deduciendo del archivo mes a mes (`AS`/`AT` ≠ 0)— ni tocó el motor:
`PayrollComputationFlags` es la misma entrada y solo cambió quién la compone. La v4 de Dexie las
sube de `capture` a la línea; con el archivo real es un no-op (apagadas en los seis), pero una
encendida perdida solo se notaría en el costo total empresa, que nadie compara contra el mes
anterior. **`employee-form-modal.tsx` es UN formulario con dos modos**, alta y edición: un campo de
ficha que existiera en uno y faltara en el otro es el fallo que nadie ve. La edición NO pinta sueldo
base ni días —se corrigen en línea en la pantalla del mes, donde se ve moverse el líquido, y una
segunda puerta sería un sitio más donde decir otra cosa—, aunque `EmployeeFormValues` los conserve
sembrados para que UNA validación sirva a los dos modos; `toEmployeePatch` es quien decide no
escribirlos. **Y NO reescribe las banderas del fondo de reserva si el modo no cambió**: la
traducción de `reserve-fund.ts` es asimétrica a propósito (`(FR=N, AC FR=S)` se lee «sin derecho» y
volvería como `(N, N)`) y MORALES trae esa combinación en el rol real, así que guardar el cargo
corregiría un archivo que nadie pidió corregir y el Excel descargado dejaría de coincidir con el que
entró. **Una edición —y un borrado— alcanzan SOLO al período abierto**, que es lo que el
almacenamiento ya dice y lo que dice el libro: una hoja `GENERAL` por mes. Corregir marzo no
reescribe febrero, y la corrección viaja hacia adelante sola cuando `copyRoster` crea abril. La
tarjeta del mes quedó solo con el importe aprobado de horas extras y por eso se llama «Horas
extras»; su campo lleva la marca `$` PEGADA —la convención de `concept-table.tsx`, donde una `h`
marca las horas y un `$` el importe—, porque «Importe aprobado de horas extras» con un placeholder
«Todas» se lee como una cantidad de horas. Las dos provisiones se leen en la rejilla del período en
SOLO LECTURA, con su importe cuando están encendidas: son las dos únicas cifras de `AS` y `AT` en
toda la pantalla —`EmployeeTotals` no desglosa ninguna de las cinco provisiones— y sacar las
casillas sin reemplazo las habría perdido.

**La CONCILIACIÓN es la clasificación del `difference` del motor** (`CA = AP − BZ`), no una segunda
resta: `reconciliationStatusOf` (`period-detail.ts`) solo mira si es `null` (nadie declaró lo
pagado → «sin conciliar»), cero («conciliado») o cualquier otra cosa («con diferencia»). El colapso
del ruido sub-centavo vive en `compute.ts` y en ningún otro sitio, apoyado en `sameToTheCentavo`
(`lib/payroll/amounts.ts`), la única definición de «mismo importe» del módulo — el rol llega con
`457.69000000000005` y con `===` cuatro de cinco conciliados salían «con diferencia». Como `paid`
es del MES y vive en la captura, **un alta a mano concilia sin ningún Excel de por medio**. Y como
el motor deriva el rol de la ficha, `computePeriodFinancials` devuelve `undefined` solo con la
nómina VACÍA: ya no existe el estado «el período no recibió su archivo», así que una nómina copiada
del mes anterior enseña sus cuatro KPIs desde el primer render, que es el caso de uso principal.

**EL RÓTULO DE UNA FILA VIVE EN LA CAPTURA DEL MES DEL EMPLEADO**, y esa es la única definición de
cómo se llama una fila del rol. Toda fila cuyo IMPORTE se teclea admite nombre propio —`P Q R S T V`
en ingresos y los doce egresos con nombre—, guardado en `PayrollMonthlyCapture.labels` bajo el código
del concepto; las `calculado` no, porque su rótulo es una tasa de ley (`Horas extras 50%`) y no un
nombre, y renombrarlas mentiría sobre un cálculo que ninguna cifra delata. Existe porque `E-11 Otros`
es un COMODÍN: es la columna `AH` del libro y significa cosas distintas en empleados distintos, así
que el comprobante que cada uno firma imprimía el nombre de la COLUMNA en vez del del descuento.
`lib/payroll/row-labels.ts` (puro + testeado) resuelve y valida: un rótulo propio pisa LOS DOS del
catálogo —el de pantalla y el `payslipLabel`, este en mayúsculas—, porque pisar solo el primero
dejaría el papel diciendo `OTROS`, que es el motivo de todo esto. La unicidad se juzga contra las
filas VISIBLES de ese empleado y no contra el período: lo que protege es que dos filas de un mismo
comprobante no se llamen igual; dos empleados llamando `Uniformes` a la suya siempre fue legítimo.
Quitar una fila borra su rótulo en la misma escritura — colgado, resucitaría al volver a agregar ese
concepto y le pondría a una cifra nueva el nombre de otro mes.

**Los BONOS son filas de la misma clase, no un mecanismo aparte.** `PayrollExtraRow`
(`{ id, label, kind, amount }`) vive en `capture.extras`, y el rótulo, la clase y el importe viajan
JUNTOS: por eso el importe huérfano dejó de poder existir, cuando antes la declaración estaba en el
período (`PayrollPeriod.extraConcepts`) y el importe en la ficha, y borrar una podía dejar el otro
colgado. Se agregan desde el MISMO menú de `Agregar ingreso`, bajo una línea, como **«Bono aportable»**
y **«Bono no aportable»**, repetibles cuantas veces haga falta —los tres no aportables de DELICMAR son
elegir tres veces y nombrar—, así que la clase no se pregunta nunca: la dice cuál se eligió, y queda
escrita en la fila porque el rótulo lo escribe el usuario y dos bonos de distinta clase no se
distinguen mirándolos — por lo mismo, donde un concepto del libro pone su código, un bono pone su
clase. `Agregar deducción` es un menú también, sin filas de bono: todas las
deducciones restan igual, no hay clase que elegir. **Y como el concepto se elige AL AGREGAR, se fue el
desplegable de cambiar de concepto** que ocupaba la celda del rótulo: esa celda es ahora el campo del
nombre, y todas las filas se leen igual —píldora, nombre, importe, valor, papelera—, incluida la de
bono, que era la única con esa forma. Cambiar de concepto es quitar la fila y agregar la correcta.

Que las filas de bono viajen dentro de la captura es lo que quitó el parámetro `extraConcepts` de
CINCO firmas —`toEngineInput`, `computeLinePayroll`, `journalAmountsFor`, `RolExportInput` y
`buildPayslipDocument`— y el `bulkGet` de períodos de `periodFinancialsFor`. Era obligatorio y sin
default a propósito, para que un consumidor que lo olvidara no compilara en vez de devolver un rol POR
DEBAJO; ahora no hay nada que olvidar. Lo que SÍ arrastra `copyRoster` son las declaraciones, con el
importe en cero: una fila de bono es FORMA del rol —la columna que esa empresa repite cada mes— y lo
que no viaja es lo que cada empleado cobró en ella; los rótulos del CATÁLOGO no viajan, porque una
fila del catálogo solo se VE si tiene cifra y arrastrar su nombre sin su importe pondría el rótulo de
marzo esperando a la de abril. Esa copia vivía en `db.ts`, fuera de `copyRoster`, que se declara «la
ÚNICA definición de qué sobrevive a un período». Nada de esto toca el motor —sigue recibiendo dos
agregados y ninguna lista— ni el destino contable de ninguna columna: renombrar es un rótulo, no una
reclasificación, y «Uniformes» no estrena cuenta.

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
no da nombre porque comparte fila con el débito de `621001`. El catálogo es la constante y los
importes el argumento — `buildJournalEntry(amounts)`, con `JournalAmounts` tipado contra los `id`
del catálogo para que un `id` mal escrito no compile —, y la construcción vive en
`period-detail-view.tsx`, que es la costura.

**`sourceColumns` NO es documentación: es lo que el asiento ejecuta.** Cada cuenta anota de qué
columnas del rol sale su importe, y `journal-amounts.ts` RECORRE esa anotación para sumar la nómina
entera a través del motor — en vez de 25 sumas escritas a mano, que serían una segunda definición de
«de dónde sale este importe» capaz de separarse de la anotación sin que nada lo delate; y lo que el
contador revisa contra su hoja es la anotación. Su mapa habla el vocabulario del MOTOR
(`PayrollEmployeeComputation` + `PayrollEmployeeInput`) y no el del almacenamiento, aunque compartan
campos: eso es lo que deja pasar `GOLDEN_MARCH_2026` —seis entradas transcritas del `.xls`— por la
MISMA suma que la pantalla y cotejar el asiento contra `GENERAL!43-71`, que es la única evidencia
externa de que la costura acierta (3.889,06 en ambos lados y las nueve cuentas con movimiento al
centavo). `RolColumn` se deriva del propio catálogo, así que una columna sin destino **no compila**:
el fallo contrario es invisible —daría cero, el interruptor de ocultar ceros escondería la cuenta y
el asiento descuadraría sin causa a la vista—.

**Son 25 cuentas, no 24, y la 25.ª no sale del libro.** «Seguro Privado» (debe, sin código como
`Viaticos`) la añade esta app porque sin ella el asiento DESCUADRA por el importe de `Q`: esa
columna suma al ingreso y le llega al empleado por el haber dentro de `AP`, y ninguna de las 24 la
recoge por el debe —`Debe = (W − Q) + provisiones`, `Haber = W + provisiones`—. En el archivo real
de marzo `Q` vale cero, y por eso el agujero no se veía. Es una desviación deliberada, anotada en su
propia entrada y **pendiente de confirmar con la firma**; si prefieren otro destino, cambia esa
entrada y su fila del mapa. Como consecuencia del álgebra, el DEBE del asiento equivale al costo
total del período cuando `Q` es cero, que es lo que hace que cuadre con los KPIs y con Sueldos por
Áreas.

**El COMPROBANTE en PDF** (`lib/payroll/payslip/`, con `pdf-lib`) reproduce la hoja `INDIVIDUAL` del
libro — el papel que el empleado firma. Tres capas y la que dibuja no decide nada: `document.ts`
(puro) baja el comprobante a TEXTO, con los importes ya formateados, que es lo que permite cotejarlo
contra el Excel comparando cadenas en vez de números contra otro cálculo; `layout.ts` (puro, con un
`measure` inyectado para no arrastrar `pdf-lib`) lo coloca en cajas y por eso se puede afirmar sin
generar un PDF que ninguna se sale de la hoja; `render.ts` las recorre y dibuja. Tipografía
**Helvetica**, una de las base-14 del formato: cero bytes embebidos y dígitos de ancho fijo, además
de métricamente compatible con la Arial del libro. Se importa en dinámico, como `exceljs`.
**Solo se imprimen las filas CON importe** —cinco de las 26 en el empleado de muestra—, y eso NO es
la regla de la pantalla aunque se le parezca: `visibleIncomeConcepts` esconde lo que se TECLEA en
cero y conserva siempre lo derivado, porque esa tabla es donde se captura y una fila que se va se
lleva el sitio donde escribirla; el papel no captura nada, así que juzga el IMPORTE, venga del motor
o de la captura, con `sameToTheCentavo` para que un `1e-14` del motor no ocupe renglón. Se
imprimieron las 26 siempre, con `-` en las vacías, tratándolo como el formulario de posición fija
que es el Excel; la firma pidió lo contrario. Omitir filas se lleva por delante tres cosas más: no
queda ningún cero de fila al que ponerle la raya del libro (filas y totales comparten un solo
`formatPayslipAmount`, y el `$0.00` de un total se queda porque un total es una afirmación sobre el
mes), ningún importe va ya en tinta débil, y la cabecera `Cantidad` y la nota al pie del `(*)` solo
se escriben si alguna fila impresa las usa — rotular una columna vacía promete un dato que no está.
Dos reglas siguen siendo al revés que en la pantalla: **el orden es el de
COLUMNAS del libro**, así que el fondo de reserva sale duodécimo y no séptimo — y eso no obliga a una
segunda lista, se ordena por el campo `column` que `concepts.ts` ya trae; y **no salen las cuatro
filas de egreso sin rótulo** (`AJ`–`AM`), que el catálogo excluye desde antes. Los rótulos son
`payslipLabel`, campo OBLIGATORIO del catálogo y no un mapa aparte —un mapa se queda corto al añadir
un concepto y ningún test de cifras lo delata—, verbatim con las erratas del contador
(`DESCUENTO TIEMPO PACIAL`). El `(*)` de la columna `Cantidad` marca los dos ingresos que
`bases.ts` dice que «no son base de nada, solo llegan al total», y `concepts.test.ts` lo vuelve
ejecutable: sumar 1 a un marcado no puede mover NINGUNA de las cinco bases —se prueban las cinco y no
solo la aportable, porque los dos décimos tampoco la mueven y sí llevan provisión, así que con una
sola el test los marcaría por error—. **Una copia por hoja**, no las dos que el Excel imprime lado a
lado: allí la derecha no tiene identidad propia (`M5 = +D5`) y es papel carbón resuelto con columnas,
que en un PDF lo resuelve el diálogo de impresión. Se conservan las PROPORCIONES de las tres columnas
(163 : 84 : 108) estiradas al ancho de la A4 y **no el tamaño**: el bloque real son 355 px —`H` e `I`
del `Print_Area` son el canal entre copias y no llevan nada—, o sea 266 pt, donde el rótulo más largo
pediría un cuerpo de 6 pt. Un rótulo se extiende hasta el inicio de `Cantidad` si su fila la usa y
hasta `Valores` si no, que es el desbordamiento hacia celdas vacías que el Excel hace por su cuenta,
escrito como regla. El encabezado imprime el nombre del CLIENTE: el parser lee la razón social de
`GENERAL!B1` pero nadie la persiste todavía. Nada se guarda — el comprobante se arma en la descarga
desde la ficha y el motor, la misma regla que el asiento y los totales del período.
**Todo importe lleva el `$`** de `formatCurrency`, filas incluidas, aunque el libro las deje sin
símbolo y solo ponga `US$` en sus tres totales: un solo dialecto del dólar entre la pantalla y el
papel. `formatPayslipAmount` no sube a `lib/format.ts` por dos razones que siguen en pie — dos
decimales SIEMPRE, y el signo juzgado tras redondear a centavos, porque el ruido de coma flotante
del motor imprimiría un `-$0.00` en la banda del líquido con la regla de `formatCurrency`.
**La JERARQUÍA es del documento y los COLORES son del libro**, que es la única desviación deliberada
de la fidelidad: cinco bloques con peso distinto —encabezado, panel de identidad, las dos secciones
y la banda del líquido— en vez de la rejilla plana del Excel, porque un papel que se firma se lee de
un vistazo. Las bandas de sección toman `--color-section-income` y `--color-section-cost`, los
rellenos del propio contador que Datos ya usa en la raíz 4 y la 5, así que un verde dice «ingresos»
en su Excel, en la pantalla y aquí; los hexes viven en `payslip/palette.ts`, espejo del `@theme` —
la misma duplicación permitida que `lib/charts/palette.ts`, porque ni un canvas ni un PDF resuelven
una variable CSS. `LIQUIDO A RECIBIR` es la ÚNICA banda oscura (`ink`, texto blanco) y NO usa
`brand`: teñirlo de marca haría del comprobante un documento de la app en vez del de la firma. La
franja alterna es tan clara que desaparece en fotocopia, y la raya de la firma se DIBUJA en vez de
escribirse con `_`.
`layout.ts` emite rellenos, reglas y cajas por separado y `render.ts` los dibuja en ese orden — al
revés, una banda taparía su propio rótulo.

**LA DESCARGA DEL ROL EN EXCEL** (`lib/payroll/export/`) es el espejo del importador: aquel dice DÓNDE
ESTÁ cada columna en el archivo del contador, este DÓNDE SE ESCRIBE y DE DÓNDE SALE. Una sola hoja
`GENERAL` con la forma del libro —`B1` el cliente, el período en su fila de rótulos, los rótulos
repartidos en DOS filas como allí, y el cuerpo de cabecera de área → empleados con ordinal corrido →
`SUBTOTAL` → `SUMAN`—, en NÚMEROS PLANOS del motor y sin una sola fórmula: una fórmula sería una
segunda definición de cada cálculo, capaz de separarse de la del motor sin que ninguna cifra lo
delate. **La LETRA es el contrato**, porque el contador coteja columna por columna, así que lo que la
app no guarda (`AJ`–`AM`, `AQ`, `BE`) conserva rótulo y sale VACÍO en vez de omitirse —omitirlo
correría todo lo de su derecha y su `AY` dejaría de ser `AY`—, y la hoja termina en `CA`: el bloque
`CC`–`CF` del original es el área de trabajo del contador repitiendo `PAGADO`, y su fila de índices de
búsqueda está DESINCRONIZADA en el archivo real. `columns.ts` declara ese layout una vez y
`columns.test.ts` lo cruza contra el catálogo de conceptos, porque el modo de fallo real no es
equivocar una cifra —el motor ya está probado— sino que escritor y lector se SEPAREN, y eso ninguna
suma lo delata. `rol-grid.ts` es la rejilla pura (vía `computeLinePayroll`, nunca un cálculo propio) y
`workbook.ts` la dibuja sin decidir nada, con exceljs en dinámico: la misma separación de tres capas
del comprobante. **Lo prueba `GOLDEN_MARCH_2026`**, que ya trae los seis empleados del archivo real
con sus veinte columnas al bit, y aquí exige además que cada una caiga en su LETRA —un motor exacto
escribiendo el patronal en la columna de al lado sigue dando un archivo que no cuadra— y que el
`SUMAN` reproduzca la fila 39 del libro. **Y el archivo VUELVE a entrar**, que es lo que cobró dos
precios en el importador, los dos por el mismo motivo: la app ahora GENERA el formato que lee. El
membrete del logo (`writeLogoHeader`, el de PyG y Ocupaciones) empuja el preámbulo, así que el período
dejó de leerse en `B2` fijo —la única coordenada de un módulo que declara localizarlo todo por
rótulo— y pasó a localizarse por su FORMA entre las filas anteriores a la cabecera (`findPeriod`); y
una celda de `PAGADO` en blanco pasó a leerse `null` y no `0`, porque el rol descargado deja en blanco
a quien no tiene pago declarado y con la regla vieja volvía «con diferencia» por todo su líquido — el
archivo de la app no habría podido describir su propio estado. Es `.xlsx` y no el `.xls` del original
(exceljs no escribe BIFF; SheetJS lee las dos). Las filas de bono van SUMADAS en una columna
`OTROS INGRESOS` tras `CA` —al final para no correr ninguna letra, agregadas para no ensanchar la hoja
por período—, y el importador todavía no la lee: re-subir el archivo las pierde, lo dice el `ⓘ` y hay
un test que lo fija para el día que deje de ser cierto. **Los RÓTULOS PROPIOS tampoco viajan**, y eso
no es una limitación pendiente sino la regla: la cabecera de `AH` dice `OTROS ` verbatim —con el
espacio sobrante del libro— porque una columna tiene UNA cabecera y la LETRA es el contrato contra el
que el contador coteja. Los importes vuelven completos; el nombre vive en la pantalla y en el papel,
que son documentos por EMPLEADO.

**EL MEMBRETE del cliente** son los datos con los que la firma encabeza su papel —razón social, RUC,
provincia, cantón, parroquia, dirección, teléfonos y correo—, y viven junto al nombre y el logo, en
`PayrollClient.company`. La capa pura es `lib/company-profile.ts` y está en `lib/` y no en
`lib/payroll/` porque quien los CAPTURA es el diálogo compartido del header: un componente de
`components/dashboard/` que importara de un módulo invertiría la dependencia. Es la misma vecindad de
`lib/logos.ts` y `lib/workspaces.ts`, y hoy solo lo cablea Rol de Pagos. **`letterheadLines` devuelve
LÍNEAS ya compuestas, no campos**, y es lo único que sostiene el cambio: el modo de fallo real no es
que una dirección salga mal, sino que salga de DOS maneras —con coma en la pantalla y con barra en el
Excel— sin que ninguna cifra lo delate; el `COMPANY_FIELDS` de al lado es el catálogo del que salen a
la vez el formulario, la validación y el borrador vacío. El perfil es **opcional en el TIPO aunque el
diálogo exija sus seis campos** (RUC y correo no), porque los clientes guardados antes no lo tienen y
un tipo que mintiera obligaría a cada lectura a inventarse algo — la obligatoriedad es del ALTA. Por
lo mismo no costó versión de Dexie: `stores()` declara índices y ninguno cambia. La sección del
diálogo entra por la puerta que ya abrió la de logos por centro (`company`/`onCompanyChange`
opcionales en `ClientNameDialog`), así que PyG y Ocupaciones no cambian ni una línea. **No se dibuja en NINGUNA
pantalla**, y eso se aprendió construyéndolo: como banda repetía el nombre del cliente que ya dicen
el selector del header y —en el detalle de un empleado— la ficha del empleador, y dentro de esa ficha
la llevaba de cuatro líneas a ocho para repetir un dato que ahí nadie usa; quien revisa el rol de una
persona no necesita la parroquia de la empresa. El membrete existe para el PAPEL, y ahí va entero: el
comprobante en PDF lo imprime bajo el nombre, donde **solo la primera línea cede ancho al bloque del
título** —es la única que comparte renglón con el mes— porque con un tope común la ubicación del
cliente real (325 pt) solo entraba a 6,5 pt en cuanto había logo; y la hoja `GENERAL` lo escribe en
filas de la columna `B` bajo el nombre. Esas filas son seguras para el viaje de vuelta porque el
lector ya no usa ninguna coordenada fija: `findPeriod` localiza el período por su forma y ahora
`findCompany` localiza la empresa por ser la primera celda con TEXTO de esa columna sobre la cabecera
—se leía en `grid[0][1]`, que desde la banda del logo era una fila en blanco, así que un rol
descargado con logo volvía a entrar sin empresa—. Un cliente sin perfil no bloquea nada: imprime lo
que hay, y quien dice qué falta es el DIÁLOGO —donde se llena—, no un aviso en una vista que
señalaría el hueco de un bloque que no se dibuja.

**EL CENTRO DE COSTO de un cliente es un nombre más específico y un logo propio, y NADA más**
(`lib/cost-center.ts`, puro + testeado). Se declara al crear el cliente, en el mismo diálogo que su
nombre y su membrete, es OPCIONAL y es UNO: **no es la estructura de centros de PyG ni de
Ocupaciones**, donde un centro sale de los datos —un slug de los datasets, la mitad de una clave—,
hay varios y sus logos se guardan por `centerId` en un registro. Aquí no hay nada de dónde derivarlo
ni jerarquía que mantener, y por eso `CostCenter` es `{ name, logo? }` colgado del cliente, no
indexado, sin versión nueva de Dexie. Su efecto es entero del PAPEL: ni el motor, ni el asiento, ni
una sola cifra lo miran, y el `golden` de marzo 2026 no se movió. **Dos funciones son toda la
regla**, y existen por el mismo motivo que `letterheadLines`: el modo de fallo real no es que el
membrete salga mal, sino que salga de DOS maneras sin que ninguna cifra lo delate.
`costCenterHeading` compone el rótulo —«Delicmar · Planta Ambato»— que encabezan el comprobante en
PDF, la columna `B` de la hoja `GENERAL`, el informe de Sueldos y el selector del header; y
`letterheadLogos` reparte los dos logos: **el del CLIENTE encabeza a la izquierda y el de su CENTRO
va a la derecha**, el mismo reparto con el que PyG y Ocupaciones timbran sus hojas, así que un logo
en el borde izquierdo quiere decir lo mismo en los tres módulos. Sin centro —o con un centro que no
subió logo— no hay segundo logo y el del cliente se queda donde siempre, de modo que todo cliente
que no declare ninguno imprime exactamente lo que imprimía. `writeLogoHeader` nombra sus parámetros
por su SITIO (`leftLogo`/`rightLogo`) porque es lo único que ese archivo sabe de ellos: de dónde
sale cada uno sí cambia por módulo —en PyG el centro es una fila derivada de los datos, aquí lo
declara el cliente—, y un `centerLogo` allí sería un nombre que solo vale para dos de los tres. Un logo SIN nombre se rechaza en vez de descartarse en silencio —una imagen sin
rótulo no se puede nombrar en ninguna pantalla—, y vaciar el nombre es cómo se quita el centro
entero (`null` en `updateClient`; `undefined` sigue siendo «esta llamada no habla del centro», el
mismo contrato del perfil). En el PDF el logo de la derecha es una PILA —logo, título, mes—, así que
el título baja en vez de compartir renglón con él; y el rótulo de la empresa pasó a ser el único
bloque de jerarquía que se deja ENCOGER (15 → 13,5 → 12 → 11): desde que tiene dos mitades,
truncarlo se lleva justo la que dice de qué centro es el papel. Su tope se MIDE contra el bloque
derecho en vez de estimarse con la fracción del ancho útil que se usaba antes — esa estimación
sobraba (el título ya se medía) y era lo que truncaba teniendo sitio libre al lado. En el Excel el
viaje de vuelta sigue intacto: `findCompany` toma esa primera celda de `B` con texto, así que lo que
recupera es el rótulo compuesto, y ninguna cifra ni ninguna letra de columna se mueve. **Y es el único módulo que admite NOMBRES REPETIDOS** (`allowDuplicateNames` en
`useEntityNaming`, apagado por defecto): la firma lleva la nómina de varias unidades de una misma
empresa y las llama a todas por el nombre de la empresa, así que rechazar el segundo «Delicmar»
obligaba a inventarle un nombre que su papel no dice. El precio está aceptado y es real —dos filas
del selector pueden leerse igual, y entonces borrar o renombrar la equivocada deja de ser
evitable—; lo que lo amortigua es que la fila muestre el rótulo COMPUESTO, así que dos clientes con
centros distintos sí se distinguen. La regla vivía en UN solo sitio, que es lo que permitió apagarla
sin tocar PyG ni Ocupaciones, donde el nombre sigue siendo lo único que separa un workspace de otro.

**SUELDOS POR ÁREAS** (`/payroll/salaries`, subitem del sidebar) sustituye el libro aparte
`EVOLUCION SUELDOS Y SALARIOS` que la firma llevaba a mano: la evolución del COSTO TOTAL
(`employerCost`, `AY`) por área y por empleado a lo largo de meses y años. **No es un módulo** —lo
fue, vacío, y se borró— porque no tiene datos propios: lee los períodos y la nómina del cliente
activo de Rol de Pagos, y como hermano se quedaba sin el selector de cliente que necesita para
significar algo. Una sola cifra y ningún selector de métrica: es la que dice la hoja. **Las dos
lecturas no son dos pantallas sino el resultado de marcar áreas** —ninguna o varias dan el
consolidado por área, exactamente una da el detalle de sus empleados con el cargo debajo del
nombre—, que es por cuarta vez la figura de `resolveActiveCenterId`; una pestaña «Consolidado / Por
área» habría creado un segundo sitio donde elegir lo mismo. `lib/payroll/salaries/` es la capa pura:
`identity.ts` (la cédula normalizada, con el nombre de respaldo cuando la ficha no la trae —sin ella
«SANDOVAL» serían tres filas de un mes cada una, porque cada período guarda su propia ficha— y sin
fundir nunca las dos evidencias), `filters.ts` (`areas`/`years`/`months`, las reglas de marcas de
siempre), `grid.ts` y `chart.ts`. **Tres reglas viven en `grid.ts` porque pueden estar mal**: una
columna existe solo si existe su PERÍODO (un mes que nadie registró no es un mes en cero); una celda
vacía se escribe con RAYA y no es un `$0.00` (el hueco de quien no había ingresado frente al cero
que una ficha presente afirma — la misma distinción que la cobertura de PyG); y el total suma **las
filas presentes**, no el universo, para que la fila de cierre cuadre a ojo con lo que tiene encima,
que es justo para lo que la pantalla existe. Un empleado que cambia de área suma cada mes bajo la
que declara la ficha de ESE período, y en el detalle de un área sus meses en la otra quedan vacíos.
El TOTAL va también como SERIE de la gráfica —aplasta la escala, y se acepta: es la barra naranja de
su hoja y es lo que él busca—. `chart.ts` es un builder PROPIO, no el `barOption` de PyG, que está
escrito sobre los tipos de su motor de analytics: el precedente es `lib/occupancy/charts/option.ts`.
**El tope de series recorta la GRÁFICA y no la TABLA** (`ChartCard` recibe `option` y `table` por
separado): dibuja el cierre más las de mayor costo acumulado —acumulado, para que mover una marca de
mes no le cambie el elenco— y declara al pie cuántas dejó fuera, mientras la tabla las lista todas.
`ChartTableRow` ganó por esto `sublabel` y `emphasis`, opcionales e inertes para quien no los pase.
Las marcas son estado LOCAL de la vista y no del provider del layout: la regla es que un provider
vive ahí porque la cabecera lee de su mismo estado, y de este módulo la cabecera solo lee el cliente.

**Y tiene su propio «Informe PDF»**, el botón en la CABECERA de la vista (no en la barra, que es
la única superficie de SELECCIÓN) — deshabilitado hasta que el cliente tenga alguna ficha cargada,
nombrando el paso que falta en vez de quedar apagado sin explicación. `lib/payroll/salaries/
report.ts` (puro + testeado) es la misma tarjeta pedida N+1 veces: `buildSalariesGrid` +
`buildSalariesCard` con las MISMAS marcas del usuario, variando solo `areas` — `[]` para el
consolidado que abre el informe y `[area]` para cada sección de área, en el orden del universo. La
marca de Área de la barra se IGNORA —el informe saca el consolidado y TODAS las áreas por
definición— y las de Año y Mes se HONRAN, porque son las que acotan las columnas de cada tabla; la
cabecera escribe cliente, rango, cuántas áreas y la fecha (sellada al abrir la vista previa) porque
en papel la barra ya no está. Un área sin ninguna ficha en el rango visible no produce sección
—ausente, no vacía—, y sin ninguna sección el informe entero desaparece. Cada sección imprime la
tabla Y la gráfica JUNTAS, sin el interruptor de pantalla —un control impreso es un botón que nadie
puede pulsar—, montadas por `components/payroll/salaries/report/`.

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
  `codeColorResolver` lo aplica **solo si todos los códigos comparados son raíces**; una tarjeta que
  compara `4.1.01` contra `4.1.02` sale de esa excepción, porque pintarlas del mismo verde las
  volvería indistinguibles. Son los tonos de `--color-section-*` un paso más hondos: allí
  son fondos bajo texto oscuro, aquí rellenos que deben caer en la banda L 0.43–0.77. Usar los del
  Excel tal cual NO es opción y está medido: dan 1,3:1 contra el papel —barras invisibles— y ΔE 7,4
  entre el verde y el celeste, por debajo del piso de visión normal. Lo que se conserva es el TONO;
  la luminosidad es otro trabajo. Medido: CVD ΔE 18.1, visión normal ΔE 19.5.
- **`CHART_COMPOSITION_PALETTE` es el set CÁLIDO de «Composición de los ingresos»**, y
  la tercera vez que un color deja de seguir a la entidad. **Esa tarjeta ya no es una tarta**: son
  BARRAS HORIZONTALES, la misma forma del ranking que tiene debajo, porque el reparto ya venía
  ordenado de mayor a menor y una barra dice cuánto pesa cada línea por su LARGO —comparable de un
  vistazo entre filas alineadas— mientras que la tarta lo decía por un ángulo que hay que estimar y
  escribía los rótulos de las porciones pequeñas fuera, con línea guía y amontonados en un borde. Lo
  que se conserva es el REPARTO: `toPieSlices` sigue siendo quien pliega «Otros» y aparta las
  negativas, y su nota al pie solo cambió el rótulo («Fuera del reparto», ya no «del pastel»). Las
  barras se ordenan por monto y la tabla gemela recibe ESA lista y no la de `toPieSlices` —que deja
  «Otros» al final porque una tarta dibuja en el orden del array—, así que la fila tercera de la
  tabla no puede ser la quinta barra; el COLOR se sigue resolviendo sobre la lista sin ordenar, que
  es lo que mantiene a «Otros» en la última ranura. El set se queda porque lo que lo justifica no es
  el círculo sino el reparto. Aquí no hay entidades que vayan y
  vengan: `toPieSlices` devuelve el reparto ENTERO, siempre completo y ordenado de mayor a menor, y
  el color ya seguía a ese orden — `colorForCompositionSlot` solo lo dice en voz alta. A diferencia
  de `CHART_DISTRIBUTION_RAMP` son HUES y no una rampa, porque una pila necesita leerse como «este
  trozo pesa más» mientras que una tarta solo necesita que seis porciones se distingan. Lo pidió la
  firma sobre una tarta de referencia que trajeron, y **sus tonos exactos no se usaron, con la razón
  medida**: `#ff5600`↔`#ff0000` dan ΔE 7.6 en visión NORMAL —la porción del 30 % y la del 20 % son
  casi el mismo rojo para cualquiera— y `#99aa27`↔`#ff8500` dan ΔE 3.9 protan. En la referencia eso
  no se nota porque cada porción lleva su «20%» impreso DENTRO, y el número es lo que desambigua;
  en esta tarjeta el tono es lo que empareja una fila de la tabla gemela con su barra —un punto de
  color, sin cifra dentro—, así que ese relieve no existe. Se conserva
  el CARÁCTER —el rojo, el naranja y el teal, tres de sus cinco— y se ensancha el arco, porque rojo,
  naranja y ámbar viven en unos 60° de tono y no llegan al piso sin separarse en luminosidad, lo
  que saca al ámbar de la banda por arriba. Ninguno de los seis es una ranura de `CHART_PALETTE`
  (el azul se desplazó a `#0f5bb5` por eso), la misma regla que ya cumple la rampa de distribución.
  `CHART_COMPOSITION_MAX` es además el corte que `toPieSlices` recibe, en vez de un 6 suelto, para
  que «Otros» caiga siempre en la última ranura y ninguna fila se quede sin tono. Medido: banda
  PASS, croma PASS, CVD ΔE 15.0, visión normal ΔE 16.2.
- **`CHART_RANKING_TAIL_RAMP` es la COLA del «Ranking de gastos», que pasó de 8 barras a 15.** Las
  ocho primeras se pintan como siempre, con `CHART_PALETTE`: ahí el color sigue haciendo su trabajo
  y la tarjeta no cambia de aspecto. El problema empieza en la NOVENA, donde `colorForEntity`
  devuelve `CHART_NEUTRAL` — las siete últimas salían del mismo gris, siete barras iguales y siete
  puntos iguales en la gemela en tabla, justo al fondo de la lista, que es donde se mira para saber
  qué recortar. La cola no se arregla con siete hues nuevos: un noveno tono de identidad es lo que
  la paleta prohíbe, y quince tonos separables no existen. Se arregla dándole a la cola lo que la
  cola ES —un tramo ORDENADO y no siete entidades—, así que ahí el color sigue al PUESTO, la cuarta
  vez que deja de seguir a la entidad. Son siete pasos de una sola gama **verde lima** (pedida por
  la firma) de oscuro a claro, y dos cosas la dejan convivir con las ocho de arriba: **un solo hue**
  (128°, solo cambia el tono), que es justo lo que la distingue de un set de identidad y lo que la
  hace leerse como tramo, y que sea **APAGADA** — cada paso por debajo del croma de TODAS las
  ranuras (0.08–0.118 contra un mínimo de 0.162). Son las barras más pequeñas: un verde vivo las
  habría puesto por delante de las ocho, al revés de lo que la lista dice. El croma es también lo
  que la separa de los dos verdes de identidad y del oliva de `--color-section-income` (h 124), el
  vecino más cercano y el que merece decirse: en Datos el verde significa «ingresos» y aquí es la
  cola de un ranking de GASTOS — convive porque nunca coinciden en pantalla (esa lectura de bloque
  solo la hace `CHART_SECTION`, y solo comparando raíces) y porque la cola es visiblemente más
  apagada. **El extremo claro lo fija una medición**: para en L 0.756 (2.13:1, el piso de 2:1 que
  una escala ordinal exige de su paso claro) porque ese paso le toca a la barra MÁS CORTA de las
  quince y seguir aclarando la borraba del papel — y el verde llega antes a ese piso que un azul,
  porque pesa 0.7152 en la luminancia contra 0.0722. Medido: **monotonía en luminosidad PASS**
  (0.496 → 0.756) — la banda, el piso de croma y la separación CVD/visión normal entre vecinos NO
  se cumplen y no deben cumplirse, porque son los checks de un set CATEGÓRICO y el propio validador
  los declara fuera de alcance para una rampa.
  `CHART_RANKING_MAX` se DERIVA (8 + 7) y `EXPENSE_RANKING_SIZE` es ese número, no un 15 suelto,
  así que ninguna barra dibujada puede quedarse sin tono; el resto de rankings sigue en
  `RANKING_SIZE` (8), que es lo que da la paleta con la que se pintan. La tarjeta subió a 520 px
  —la misma densidad de ~34 px por fila, no una tarjeta más grande—, va **después** de «Composición
  de los ingresos» (las dos son el mismo reparto en la misma forma, y el estado se lee empezando por
  lo que entró; además son quince filas contra seis, así que con el ranking delante la composición
  quedaba al pie de una tarjeta del doble de alto, justo donde el ojo ya no llega) y las cinco de
  Gráficos quedaron al
  MISMO ancho: una retícula a medias dejaba una tarjeta angosta al lado de un hueco, que se lee
  como que algo no cargó, y el ranking además necesita el ancho completo porque a media pantalla
  los 150 px fijos del canal de rótulos truncan casi todos los nombres de cuenta.

**Reusable side panel.** `components/ui/side-panel.tsx` is a right-anchored, non-modal drawer
(no scrim, Escape/outside-click to close, focus in on open and back to the opener on close). It's
what the PyG account ficha mounts on; reuse it for any future lateral detail view rather than
building another.

**Y su hermana, `components/ui/modal.tsx`**, una ventana CENTRADA sobre el `<dialog>` nativo (top
layer, trampa de foco y Escape los pone el navegador). Se elige entre las dos por la FORMA de lo que
muestran, no por gusto: el cajón existe para un detalle que se lee JUNTO a lo que lo abrió —la ficha
de una cuenta contra su fila de la tabla—, y por eso no lleva velo; la ventana interrumpe, se pone en
medio y apaga el fondo, que es lo correcto cuando lo que se abre se lee SOLO y se cierra enseguida.
El peso de un rubro al pulsar su barra del anexo entra por aquí, y además porque un cajón lateral
caería justo encima de las barras y taparía la que se acaba de pulsar. `ConfirmDialog` es anterior a
este archivo y repite sus mecánicas; cuando alguien lo toque, conviene plegarlo aquí.

**El armazón de todo informe imprimible vive en `components/ui/report-layer.tsx`.** `ReportLayer`
aporta el portal sobre `document.body`, la capa `.report-layer` que `@media print` aísla (en
`globals.css`, atada a la CLASE y no a un id — el cambio que hizo posible un segundo informe sin que
uno imprimiera la app entera detrás del otro), Escape, el título de impresión (de donde el navegador
toma el nombre sugerido del PDF, restaurado al cerrar aunque se cierre sin imprimir) y la barra con
«Guardar PDF»/«Cerrar»; `ReportSheet` aporta la hoja, A4 vertical o apaisada a su ancho real. No
importa nada de `profit-loss/` ni de `payroll/`: lo propio de cada informe —el `Detalle` de PyG, sus
avisos de cuántas hojas trae— entra por los huecos `controls`/`note`. El informe de PyG
(`pyg-report-preview.tsx`) se portó a él sin cambiar una línea de lo que imprime, y el de Sueldos por
Áreas nació sobre él directamente. `statementFit` —qué orientación y qué cuerpo de letra caben según
el número de columnas— vive por eso en `lib/report/page-fit.ts` y no en `profit-loss/`, y
`formatTimestampEs` —la fecha «18 de agosto de 2026, 14:05» que sella la cabecera de los dos
informes— vive en `lib/date.ts`, para que ninguno de los dos pueda decir la fecha de dos maneras.

## Design source

The UI was translated from a Claude Design file, "Dashboard LiderPlus.dc.html"
(claude.ai/design project `1fed77ae-29ff-439e-a0d1-f01e3b3abe5e`).

**Specs live in OpenSpec, not `docs/`.** Every non-trivial change is specified in `openspec/`
before code: `openspec/changes/<name>/` holds the in-flight proposal/design/specs/tasks, and
`openspec/specs/<capability>/` holds the current spec a change archives into. Use the OpenSpec
skills (`/opsx:propose`, `/opsx:apply`, `/opsx:archive`) and `openspec validate <name>`. The
older `docs/superpowers/specs/` tree is historical only — do not add new specs there.
