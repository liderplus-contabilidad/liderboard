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
is one SUCURSAL-YEAR**, keyed `[centerId+year]`: the accountant exports one workbook per
sucursal per year, and the file declares its own hotel and cost center on two lines under the
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
the provider, which is what writes. Files from another hotel raise a replace confirmation,
rendered by `OccupancyDataProvider` itself because the upload button lives in the tab bar. Datos stacks three strips, **Sucursal → Año → Mes**; the sucursal strip
renders nothing with a single sucursal, and the Consolidado tab appears only with two or more.
The MES strip ends in an **«Año»** button: `toAnnualGrid` returns the same `OccupancyGrid` with
one column per month instead of per day (the type speaks in `columns`/`columnLabels`/`scope`,
never in days), always computed and always read-only — a month's cell is an aggregate of days,
and «Habitaciones disponibles» sums habitaciones-noche there because that is what the occupancy
of each month divides by. Both axes compose: the year of a sucursal, or the year of the
Consolidado.

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
  the single allowed duplication.

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
